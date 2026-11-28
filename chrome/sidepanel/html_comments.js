'use strict';

{
    const scanButton = document.getElementById('scan-html-comments');
    const clearButton = document.getElementById('clear-html-comments');
    const exportButton = document.getElementById('export-html-comments');
    const status = document.getElementById('html-comments-status');
    const findings = document.getElementById('html-comment-findings');
    const headingCount = document.getElementById('html-comments-count');
    let report;
    let manualScan = false;
    let noteReviewRunning = false;
    const pageReport = watchPanelPageReport(htmlCommentsReportKey, renderReport);
    watchPanelPageReport(tabId => reviewNotesActivityKey(htmlCommentsReportKey(tabId)), activity => {
        noteReviewRunning = Boolean(activity);
        updateProgress();
    });

    function renderReport(next) {
        report = next;
        findings.replaceChildren();
        updateProgress();
        const count = next?.comments?.length ?? 0;
        const label = `${count} ${count === 1 ? 'comment' : 'comments'}`;
        headingCount.textContent = count ? ` (${label})` : '';
        headingCount.hidden = count === 0;
        headingCount.style.color = monitorTabs.setCount('html-comments-review', count,
            count ? JSON.stringify([next.url, next.comments]) : undefined);
        clearButton.disabled = !next || scanButton.disabled;
        exportButton.disabled = count === 0;
        if (!next) {
            status.textContent = '';
            return;
        }
        if (next.running || next.error) {
            status.textContent = next.running ? 'Scanning for HTML comments…' : `Could not scan for HTML comments. ${next.error}`;
            return;
        }

        const {comments, url} = next;
        status.textContent = `${count ? `${label} found` : 'No HTML comments found'} on ${url}`;
        for (const [index, comment] of comments.entries()) {
            const item = document.createElement('li');
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = comment;
            pre.append(code);

            const add = document.createElement('button');
            add.type = 'button';
            add.textContent = 'Add to Note Draft';
            add.setAttribute('aria-label', `Add to Note Draft (comment ${index + 1})`);
            add.addEventListener('click', () => appendToNoteDraft(`HTML comment\nPage: ${url}\n\n${comment}`));
            item.append(pre, add);
            findings.append(item);
        }
    }

    function updateProgress() {
        scanButton.disabled = manualScan || Boolean(report?.running);
        monitorTabs.setRunning('html-comments-review', scanButton.disabled || noteReviewRunning);
    }

    clearButton.addEventListener('click', async () => {
        scanButton.focus();
        try {
            await pageReport.clear();
        } catch (error) {
            status.textContent = `Could not clear the report. ${error.message}`;
        }
    });

    scanButton.addEventListener('click', async () => {
        manualScan = true;
        renderReport();
        status.textContent = 'Scanning for HTML comments…';

        try {
            const tab = await requirePanelTab();
            const result = await chrome.tabs.sendMessage(tab.id, {method: 'scanCommentsForSave'}, {frameId: 0});
            if (result?.url !== tab.url) throw new Error('The target page changed. Run the check again.');
            await pageReport.save(tab, result);
        } catch {
            status.textContent = 'Could not scan for HTML comments. Open or reload an HTTP or HTTPS page and try again.';
        } finally {
            manualScan = false;
            updateProgress();
            clearButton.disabled = scanButton.disabled;
        }
    });

    exportButton.addEventListener('click', async () => {
        const currentReport = report;
        exportButton.disabled = true;
        try {
            await saveCommentsAsMarkdown(currentReport.comments, currentReport.url);
            if (currentReport === report) status.textContent = `Markdown download started for ${currentReport.url}`;
        } catch (error) {
            if (currentReport === report) status.textContent = `Could not save Markdown. ${error.message}`;
        } finally {
            if (currentReport === report) exportButton.disabled = false;
        }
    });
}
