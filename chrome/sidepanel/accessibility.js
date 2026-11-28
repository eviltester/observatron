'use strict';

const accessibilityButton = document.getElementById('checkAccessibility');
const responsiveAccessibilityButton = document.getElementById('checkResponsiveAccessibility');
const clearAccessibilityButton = document.getElementById('clearAccessibility');
const accessibilityStatus = document.getElementById('accessibility-status');
const accessibilityFindings = document.getElementById('accessibility-findings');
const accessibilityCount = document.getElementById('accessibility-count');
let activeAccessibilityScan;
let currentAccessibilityReport;
let manualAccessibilityScan = false;
let backgroundAccessibilityScan = false;
let accessibilityNotesRunning = false;
const pageAccessibilityReport = watchPanelPageReport(accessibilityReportKey, renderAccessibilityReport);
watchPanelPageReport(tabId => reviewNotesActivityKey(accessibilityReportKey(tabId)), activity => {
    accessibilityNotesRunning = Boolean(activity);
    updateAccessibilityProgress();
});

clearAccessibilityButton.addEventListener('click', async () => {
    const scan = activeAccessibilityScan;
    accessibilityButton.focus();
    try {
        await Promise.all([pageAccessibilityReport.clear(), releaseAccessibilityResults(scan)]);
    } catch (error) {
        accessibilityStatus.textContent = `Could not clear the report. ${error.message}`;
    }
});

accessibilityButton.addEventListener('click', () => checkAccessibility());
responsiveAccessibilityButton.addEventListener('click', () => checkAccessibility(true));

async function checkAccessibility(responsive = false) {
    manualAccessibilityScan = true;

    try {
        const previousScan = activeAccessibilityScan;
        renderAccessibilityReport();
        await releaseAccessibilityResults(previousScan);
        accessibilityStatus.textContent = responsive
            ? `Checking accessibility at ${responsiveAccessibilityWidths.join(', ')} px…` : 'Checking accessibility…';
        const tab = await getPanelTab();

        if (tab?.id === undefined || !/^https?:\/\//.test(tab.url || '')) {
            accessibilityStatus.textContent = 'Open the Observatron side panel or DevTools panel on an HTTP or HTTPS page to check it.';
            return;
        }

        const result = responsive ? (await sendPanelAction('scanResponsiveAccessibility', tab)).report
            : await scanPageAccessibility(tab.id);
        if (result.url !== tab.url) throw new Error('The target page changed. Run the check again.');
        await pageAccessibilityReport.save(tab, result);
    } catch (error) {
        accessibilityStatus.textContent = `Could not check accessibility. ${error.message}`;
    } finally {
        manualAccessibilityScan = false;
        updateAccessibilityProgress();
    }
}

function renderAccessibilityReport(report) {
    currentAccessibilityReport = report;
    backgroundAccessibilityScan = Boolean(report?.running);
    updateAccessibilityProgress();
    activeAccessibilityScan = report?.scan;
    accessibilityStatus.textContent = '';
    accessibilityFindings.replaceChildren();
    accessibilityCount.textContent = '';
    accessibilityCount.hidden = true;
    if (report && !report.running && !report.error) {
        if (report.viewports) showResponsiveAccessibilityResults(report);
        else showAccessibilityResults(report, report.scan);
    } else {
        monitorTabs.setCount('accessibility-review', 0);
        if (report?.running) accessibilityStatus.textContent = 'Checking accessibility…';
        else if (report?.error) accessibilityStatus.textContent = `Could not check accessibility. ${report.error}`;
    }
}

function updateAccessibilityProgress() {
    accessibilityButton.disabled = manualAccessibilityScan || backgroundAccessibilityScan;
    responsiveAccessibilityButton.disabled = accessibilityButton.disabled || accessibilityNotesRunning;
    clearAccessibilityButton.disabled = !currentAccessibilityReport || accessibilityButton.disabled;
    monitorTabs.setRunning('accessibility-review', accessibilityButton.disabled || accessibilityNotesRunning);
}

async function releaseAccessibilityResults(scan) {
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

function showAccessibilityCount(count, reportId) {
    accessibilityCount.textContent = count ? ` (${count} ${count === 1 ? 'issue' : 'issues'})` : '';
    accessibilityCount.hidden = count === 0;
    accessibilityCount.style.color = monitorTabs.setCount('accessibility-review', count, reportId);
}

function showAccessibilityResults({url, violations, needsReview}, scan) {
    const count = violations.length;
    showAccessibilityCount(count, scan.id);
    const findings = count === 0 ? 'No automated issues found' : `${count} ${count === 1 ? 'issue' : 'issues'} found`;
    const reviewCount = needsReview.length;
    const review = reviewCount ? ` ${reviewCount} additional ${reviewCount === 1 ? 'rule needs' : 'rules need'} manual review.` : '';
    accessibilityStatus.textContent = `${findings} in the main document.${review} ${url}`;

    renderAccessibilityRuleGroups(accessibilityFindings, {url, violations, needsReview}, scan);
}

function showResponsiveAccessibilityResults({url, id, viewports}) {
    const count = viewports.reduce((total, viewport) => total + viewport.violations.length, 0);
    showAccessibilityCount(count, id);
    accessibilityStatus.textContent = `Responsive Accessibility Review. ${count} ${count === 1 ? 'issue' : 'issues'} across ${viewports.length} viewport widths. ${url}`;
    for (const {width, violations, needsReview} of viewports) {
        const group = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = `${width} px · ${violations.length} ${violations.length === 1 ? 'issue' : 'issues'} · ${needsReview.length} for manual review`;
        group.append(summary);
        if (!violations.length && !needsReview.length) {
            const empty = document.createElement('p');
            empty.textContent = 'No findings in the main document.';
            group.append(empty);
        }
        renderAccessibilityRuleGroups(group, {url, violations, needsReview}, undefined, width);
        accessibilityFindings.append(group);
    }
}

function renderAccessibilityRuleGroups(container, {url, violations, needsReview}, scan, width) {
    for (const violation of violations) {
        container.append(renderAccessibilityFinding(url, violation, scan, false, width));
    }
    if (needsReview.length) {
        const heading = document.createElement('h3');
        heading.textContent = 'Needs Manual Review';
        container.append(heading);
        for (const item of needsReview) {
            container.append(renderAccessibilityFinding(url, item, scan, true, width));
        }
    }
}

function renderAccessibilityFinding(url, result, scan, manualReview, width) {
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
    addButton.addEventListener('click', () => addAccessibilityFindingToNote(url, result, manualReview, width));

    const elementList = document.createElement('ul');
    for (const element of elements) {
        elementList.append(renderAffectedElement(element, url, scan));
    }

    finding.append(summary, ruleDetails, addButton, elementList);
    return finding;
}

function renderAffectedElement({selector, html, index, guidance}, url, scan) {
    const item = document.createElement('li');
    const locator = document.createElement('code');
    locator.textContent = selector;
    const actions = document.createElement('div');
    actions.dataset.actionGroup = '';
    actions.append(locator);
    item.append(actions);

    if (scan) addAccessibilityElementActions(actions, url, scan, index, selector);

    const snippet = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Show HTML';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = html;
    pre.append(code);
    snippet.append(summary, pre);

    if (guidance) {
        const explanation = document.createElement('p');
        explanation.className = 'accessibility-guidance';
        explanation.textContent = guidance;
        item.append(explanation);
    }
    item.append(snippet);
    return item;
}

function addAccessibilityElementActions(actions, url, scan, index, selector) {
    const showButton = document.createElement('button');
    showButton.type = 'button';
    showButton.textContent = 'Show on Page';
    showButton.setAttribute('aria-label', `Show on Page: ${selector}`);
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    showButton.addEventListener('click', () => highlightAccessibilityElement(scan, index, status));
    const screenshot = document.createElement('button');
    screenshot.type = 'button';
    screenshot.textContent = 'Take Screenshot';
    screenshot.setAttribute('aria-label', `Take Screenshot: ${selector}`);
    actions.append(showButton, screenshot, status);
    registerPanelAction(screenshot, async () => {
        status.textContent = '';
        const tab = await requirePanelTab();
        if (tab.id !== scan.target.tabId || tab.url !== url) throw new Error('The scanned page changed. Run the check again.');
        await sendPanelAction('capturePanelElementScreenshot', tab, {
            element: {
                pageUrl: url, elementUrl: url,
                finding: {scanId: scan.id, documentId: scan.target.documentIds[0], index}
            }
        });
        status.textContent = 'Element screenshot saved.';
    });
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

function addAccessibilityFindingToNote(url, {id, help, impact, elements}, manualReview, width) {
    const finding = [
        `${manualReview ? 'Accessibility — needs manual review' : 'Accessibility'}: ${help}`,
        `Rule: ${id}${impact ? ` (${impact})` : ''}`,
        width && `Viewport width: ${width} px`,
        `Page: ${url}`,
        'Affected elements:',
        ...elements.map(({selector}) => `- ${selector}`)
    ].filter(Boolean).join('\n');

    appendToNoteDraft(finding);
}
