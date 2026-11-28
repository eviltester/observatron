'use strict';

const accessibilityReportKey = tabId => `observatron-accessibility:${tabId}`;
const responsiveAccessibilityWidths = [360, 768, 1280];

async function scanPageAccessibility(tabId, documentId, retainElements = true) {
    const target = documentId ? {tabId, documentIds: [documentId]} : {tabId};
    const [{documentId: scannedDocument}] = await chrome.scripting.executeScript({
        target, files: ['vendor/axe-core/axe.min.js']
    });
    const scan = {id: crypto.randomUUID(), target: {tabId, documentIds: [scannedDocument]}};
    const [{result}] = await chrome.scripting.executeScript({
        target: scan.target,
        args: [scan.id, retainElements],
        func: async (scanId, keepElements) => {
            // Manual and page-load reviews can reach the same document at once.
            const previous = globalThis.observatronAccessibilityPending || Promise.resolve();
            const pending = previous.catch(() => {}).then(async () => {
                const {url, violations, incomplete} = await globalThis.axe.run({iframes: false, elementRef: keepElements});
                const elements = [];
                const mapFindings = findings => findings.map(({id, help, helpUrl, impact, nodes}) => ({
                    id,
                    help,
                    helpUrl,
                    impact,
                    elements: nodes.map(node => ({
                        index: keepElements ? elements.push(node.element ? new WeakRef(node.element) : null) - 1 : -1,
                        selector: node.target.flat().join(' → '),
                        html: node.html,
                        guidance: node.failureSummary
                    }))
                }));
                const failed = mapFindings(violations);
                const needsReview = mapFindings(incomplete);
                if (keepElements) {
                    globalThis.observatronAccessibilityScan?.highlight?.cancel();
                    globalThis.observatronAccessibilityScan = {id: scanId, elements};
                }
                return {url, needsReview, violations: failed};
            });
            globalThis.observatronAccessibilityPending = pending;
            try {
                return await pending;
            } finally {
                if (globalThis.observatronAccessibilityPending === pending) delete globalThis.observatronAccessibilityPending;
            }
        }
    });
    return {...result, scan};
}

async function scanResponsiveAccessibility(tabId, pageUrl) {
    let report;
    await queueCaptureAction(tabId, async session => {
        const [{documentId, result: page}] = await chrome.scripting.executeScript({
            target: {tabId}, func: () => ({url: location.href, height: window.innerHeight})
        });
        if (page.url !== pageUrl) throw new Error('The target page changed. Run the check again.');

        const target = {tabId, documentIds: [documentId]};
        const ownsConnection = !session.targets;
        const targets = await connectCaptureDebugger(session);
        const root = targets.get('');
        const viewports = [];
        try {
            await chrome.scripting.executeScript({target, func: () => { globalThis.observatronEmulatingViewport = true; }});
            for (const width of responsiveAccessibilityWidths) {
                await chrome.debugger.sendCommand(root, 'Emulation.setDeviceMetricsOverride', {
                    width, height: page.height, deviceScaleFactor: 0, mobile: false
                });
                const [{result: actualWidth}] = await chrome.scripting.executeScript({target, func: waitForViewportLayout});
                if (actualWidth !== width) throw new Error(`Chrome applied a ${actualWidth}px viewport instead of ${width}px.`);
                const {url, violations, needsReview} = await scanPageAccessibility(tabId, documentId, false);
                if (url !== pageUrl) throw new Error('The target page changed. Run the check again.');
                viewports.push({width, violations, needsReview});
            }
            report = {url: pageUrl, id: crypto.randomUUID(), viewports};
        } finally {
            try {
                if (session.targets === targets) {
                    await chrome.debugger.sendCommand(root, 'Emulation.clearDeviceMetricsOverride');
                    await chrome.scripting.executeScript({target, func: waitForViewportLayout}).catch(() => {});
                }
            } finally {
                if (ownsConnection && session.targets === targets) await disconnectCaptureDebugger(session);
                await chrome.scripting.executeScript({
                    target, func: () => { delete globalThis.observatronEmulatingViewport; }
                }).catch(() => {});
            }
        }
    });
    return report;
}

async function waitForViewportLayout() {
    if (document.visibilityState === 'visible') {
        await new Promise(resolve => {
            const fallback = setTimeout(resolve, 200);
            requestAnimationFrame(() => requestAnimationFrame(() => {
                clearTimeout(fallback);
                resolve();
            }));
        });
    }
    return window.innerWidth;
}
