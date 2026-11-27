'use strict';

const accessibilityButton = document.getElementById('checkAccessibility');
const clearAccessibilityButton = document.getElementById('clearAccessibility');
const accessibilityStatus = document.getElementById('accessibility-status');
const accessibilityFindings = document.getElementById('accessibility-findings');
let activeAccessibilityScan;

clearAccessibilityButton.addEventListener('click', () => {
    clearAccessibilityResults();
    accessibilityButton.focus();
});

accessibilityButton.addEventListener('click', async () => {
    accessibilityButton.disabled = true;

    try {
        await clearAccessibilityResults();
        accessibilityStatus.textContent = 'Checking accessibility…';
        const inspectedTabId = chrome.devtools?.inspectedWindow?.tabId;
        const tab = inspectedTabId === undefined
            ? (await chrome.tabs.query({active: true, currentWindow: true}))[0]
            : await chrome.tabs.get(inspectedTabId);

        if (tab?.id === undefined || !/^https?:\/\//.test(tab.url || '')) {
            accessibilityStatus.textContent = 'Open the Observatron side panel or DevTools panel on an HTTP or HTTPS page to check it.';
            return;
        }

        const [{documentId}] = await chrome.scripting.executeScript({
            target: {tabId: tab.id},
            files: ['vendor/axe-core/axe.min.js']
        });
        const scan = {id: crypto.randomUUID(), target: {tabId: tab.id, documentIds: [documentId]}};
        const [{result}] = await chrome.scripting.executeScript({
            target: scan.target,
            args: [scan.id],
            func: async scanId => {
                const {url, violations, incomplete} = await globalThis.axe.run({iframes: false, elementRef: true});
                const elements = [];
                const mapFindings = findings => findings.map(({id, help, helpUrl, impact, nodes}) => ({
                    id,
                    help,
                    helpUrl,
                    impact,
                    elements: nodes.map(node => ({
                        index: elements.push(node.element ? new WeakRef(node.element) : null) - 1,
                        selector: node.target.flat().join(' → '),
                        html: node.html,
                        guidance: node.failureSummary
                    }))
                }));
                const failed = mapFindings(violations);
                const needsReview = mapFindings(incomplete);
                globalThis.observatronAccessibilityScan?.highlight?.cancel();
                globalThis.observatronAccessibilityScan = {id: scanId, elements};
                return {url, needsReview, violations: failed};
            }
        });
        activeAccessibilityScan = scan;
        showAccessibilityResults(result, scan);
    } catch (error) {
        accessibilityStatus.textContent = `Could not check accessibility. ${error.message}`;
    } finally {
        accessibilityButton.disabled = false;
        clearAccessibilityButton.disabled = false;
    }
});

async function clearAccessibilityResults() {
    const scan = activeAccessibilityScan;
    activeAccessibilityScan = undefined;
    accessibilityStatus.textContent = '';
    accessibilityFindings.replaceChildren();
    clearAccessibilityButton.disabled = true;

    if (scan) {
        try {
            await chrome.scripting.executeScript({
                target: scan.target,
                args: [scan.id],
                func: scanId => {
                    const savedScan = globalThis.observatronAccessibilityScan;
                    if (savedScan?.id !== scanId) return;
                    savedScan.highlight?.cancel();
                    delete globalThis.observatronAccessibilityScan;
                }
            });
        } catch {
            // The scanned document may already be gone.
        }
    }
}

function showAccessibilityResults({url, violations, needsReview}, scan) {
    const count = violations.length;
    const findings = count === 0 ? 'No automated issues found' : `${count} ${count === 1 ? 'issue' : 'issues'} found`;
    const reviewCount = needsReview.length;
    const review = reviewCount ? ` ${reviewCount} additional ${reviewCount === 1 ? 'rule needs' : 'rules need'} manual review.` : '';
    accessibilityStatus.textContent = `${findings} in the main document.${review} ${url}`;

    for (const violation of violations) {
        accessibilityFindings.append(renderAccessibilityFinding(url, violation, scan));
    }
    if (reviewCount) {
        const heading = document.createElement('h3');
        heading.textContent = 'Needs Manual Review';
        accessibilityFindings.append(heading);
        for (const item of needsReview) {
            accessibilityFindings.append(renderAccessibilityFinding(url, item, scan, true));
        }
    }
}

function renderAccessibilityFinding(url, result, scan, manualReview = false) {
    const {id, help, helpUrl, impact, elements} = result;
    const finding = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `${help}${impact ? ` (${impact})` : ''} · ${elements.length} ${elements.length === 1 ? 'element' : 'elements'}`;

    const ruleDetails = document.createElement('p');
    const ruleId = document.createElement('code');
    ruleId.textContent = id;
    ruleDetails.append(ruleId);
    if (helpUrl?.startsWith('https://')) {
        const guidanceLink = document.createElement('a');
        guidanceLink.href = helpUrl;
        guidanceLink.target = '_blank';
        guidanceLink.rel = 'noopener noreferrer';
        guidanceLink.textContent = 'Rule guidance';
        ruleDetails.append(' · ', guidanceLink);
    }

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = 'Add to Note Draft';
    addButton.addEventListener('click', () => addAccessibilityFindingToNote(url, result, manualReview));

    const elementList = document.createElement('ul');
    for (const element of elements) {
        elementList.append(renderAffectedElement(element, scan));
    }

    finding.append(summary, ruleDetails, addButton, elementList);
    return finding;
}

function renderAffectedElement({selector, html, index, guidance}, scan) {
    const item = document.createElement('li');
    const locator = document.createElement('code');
    locator.textContent = selector;

    const showButton = document.createElement('button');
    showButton.type = 'button';
    showButton.textContent = 'Show on Page';
    showButton.setAttribute('aria-label', `Show on Page: ${selector}`);
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    showButton.addEventListener('click', () => highlightAccessibilityElement(scan, index, status));

    const snippet = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Show HTML';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = html;
    pre.append(code);
    snippet.append(summary, pre);

    item.append(locator, showButton, status);
    if (guidance) {
        const explanation = document.createElement('p');
        explanation.className = 'accessibility-guidance';
        explanation.textContent = guidance;
        item.append(explanation);
    }
    item.append(snippet);
    return item;
}

async function highlightAccessibilityElement(scan, index, status) {
    try {
        const [{result: problem}] = await chrome.scripting.executeScript({
            target: scan.target,
            args: [scan.id, index],
            func: (scanId, elementIndex) => {
                const savedScan = globalThis.observatronAccessibilityScan;
                if (savedScan?.id !== scanId) return 'This report is out of date. Run the check again.';

                const element = savedScan.elements[elementIndex]?.deref();
                if (!element?.isConnected) return 'The element is no longer available. Run the check again.';

                const {width, height} = element.getBoundingClientRect();
                if (!width || !height || getComputedStyle(element).visibility !== 'visible') {
                    return 'This element has no visible area to highlight.';
                }

                savedScan.highlight?.cancel();
                element.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'});
                const emphasis = {outline: '3px solid #ae2319', outlineOffset: '2px', boxShadow: '0 0 0 2px white'};
                savedScan.highlight = element.animate([emphasis, emphasis], {duration: 5000});
                return null;
            }
        });
        if (problem) {
            status.textContent = problem;
        } else if (scan === activeAccessibilityScan) {
            await chrome.tabs.update(scan.target.tabId, {active: true});
            status.textContent = 'Element highlighted.';
        }
    } catch {
        status.textContent = 'The scanned page is no longer available. Run the check again.';
    }
}

function addAccessibilityFindingToNote(url, {id, help, impact, elements}, manualReview) {
    const finding = [
        `${manualReview ? 'Accessibility — needs manual review' : 'Accessibility'}: ${help}`,
        `Rule: ${id}${impact ? ` (${impact})` : ''}`,
        `Page: ${url}`,
        'Affected elements:',
        ...elements.map(({selector}) => `- ${selector}`)
    ].join('\n');

    appendToNoteDraft(finding);
}
