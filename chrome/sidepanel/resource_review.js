'use strict';

for (const review of document.querySelectorAll('[data-resource-review]')) {
    const assetType = review.dataset.resourceReview;
    const assetName = assetType.toLowerCase();
    const scanButton = review.querySelector('button');
    const clearButton = review.querySelector('[data-clear-results]');
    const status = review.querySelector('[role="status"]');
    const findings = review.querySelector('ol');
    const countLabel = review.querySelector('.resource-review-count');
    let displayedId;
    let reportRunning = false;
    let noteReviewRunning = false;
    watchPanelPageReport(tabId => brokenAssetReportKey(tabId, assetType), renderReport);
    watchPanelPageReport(() => `broken${assetType}Queue`, running => {
        noteReviewRunning = running;
        updateSpinner();
    }, (queue, tab) => queue?.some(asset => tab && asset.tabId === tab.id && asset.source === tab.url));

    function updateSpinner() {
        monitorTabs.setRunning(review.id, reportRunning || Boolean(noteReviewRunning));
    }

    function renderFinding(asset) {
        const item = document.createElement('li');
        const address = document.createElement('strong');
        address.textContent = asset.url;
        const detail = document.createElement('div');
        const label = assetType === 'Link' ? 'Link text' : 'Alt text';
        const statuses = `HEAD ${asset.headStatus}, GET ${asset.getStatus}`;
        detail.textContent = `${label}: ${asset.text} · ${statuses}`;
        const add = document.createElement('button');
        add.type = 'button';
        add.textContent = 'Add to Note Draft';
        add.setAttribute('aria-label', `Add to Note Draft (${asset.url})`);
        add.addEventListener('click', () => appendToNoteDraft(
            `! Broken ${assetName}\nPage: ${asset.source}\nURL: ${asset.url}\n${label}: ${asset.text}\n${statuses}`
        ));
        item.append(address, detail, add);
        findings.append(item);
    }

    function renderReport(report) {
        if (displayedId !== report?.id) {
            displayedId = report?.id;
            findings.replaceChildren();
        }
        scanButton.disabled = Boolean(report?.running);
        reportRunning = Boolean(report?.running);
        updateSpinner();
        clearButton.disabled = !report;
        const count = report?.findings.length ?? 0;
        const label = `${count} ${assetName}${count === 1 ? '' : 's'}`;
        countLabel.textContent = count ? ` (${label})` : '';
        countLabel.hidden = count === 0;
        countLabel.style.color = monitorTabs.setCount(review.id, count, report?.id);
        if (!report) {
            status.textContent = '';
            return;
        }

        for (const asset of report.findings.slice(findings.children.length)) renderFinding(asset);
        if (report.error) {
            status.textContent = `Could not finish checking ${assetName}s. ${report.error}`;
        } else if (report.running) {
            status.textContent = report.total
                ? `Checking ${assetName} ${report.checked + 1} of ${report.total} on ${report.url}…`
                : `Collecting ${assetName}s from the page…`;
        } else {
            const summary = count ? `${count} broken ${assetName}${count === 1 ? '' : 's'} found` : `No broken ${assetName}s found`;
            status.textContent = `${summary} on ${report.url} (${report.checked} checked).`;
        }
    }

    clearButton.addEventListener('click', async () => {
        renderReport();
        scanButton.focus();
        try {
            const tab = await requirePanelTab();
            const response = await chrome.runtime.sendMessage({method: 'clearBrokenAssetReview', assetType, tabId: tab.id});
            if (!response?.success) throw new Error(response?.error || 'The review did not respond.');
        } catch (error) {
            status.textContent = `Could not clear the review. ${error.message}`;
            clearButton.disabled = false;
        }
    });

    scanButton.addEventListener('click', async () => {
        renderReport();
        scanButton.disabled = true;
        reportRunning = true;
        updateSpinner();
        status.textContent = `Collecting ${assetName}s from the page…`;

        try {
            const tab = await requirePanelTab();
            if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('Open an HTTP or HTTPS page and try again.');
            const response = await chrome.runtime.sendMessage({method: 'startBrokenAssetReview', assetType, tabId: tab.id, pageUrl: tab.url});
            if (!response?.success) throw new Error(response?.error || 'The resource check did not respond.');
        } catch (error) {
            status.textContent = `Could not start checking ${assetName}s. ${error.message}`;
            scanButton.disabled = false;
            reportRunning = false;
            updateSpinner();
            clearButton.disabled = false;
        }
    });
}
