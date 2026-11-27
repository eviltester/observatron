'use strict';

{
    const scanButton = document.getElementById('scan-html-comments');
    const clearButton = document.getElementById('clear-html-comments');
    const exportButton = document.getElementById('export-html-comments');
    const status = document.getElementById('html-comments-status');
    const findings = document.getElementById('html-comment-findings');
    let report;

    function clearResults() {
        report = undefined;
        findings.replaceChildren();
        status.textContent = '';
        clearButton.disabled = true;
        exportButton.disabled = true;
    }

    clearButton.addEventListener('click', () => {
        clearResults();
        scanButton.focus();
    });

    scanButton.addEventListener('click', async () => {
        clearResults();
        scanButton.disabled = true;
        status.textContent = 'Scanning for HTML comments…';

        try {
            const tabId = chrome.devtools?.inspectedWindow?.tabId ??
                (await chrome.tabs.query({active: true, currentWindow: true}))[0]?.id;
            if (tabId === undefined) throw new Error('There is no page to scan.');

            const result = await chrome.tabs.sendMessage(tabId, {method: 'scanCommentsForSave'}, {frameId: 0});
            if (!result) throw new Error('The page did not respond to the scan.');

            const {comments, url} = result;
            const count = comments.length;
            status.textContent = `${count ? `${count} HTML ${count === 1 ? 'comment' : 'comments'} found` : 'No HTML comments found'} on ${url}`;
            const items = document.createDocumentFragment();
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
                items.append(item);
            }
            findings.append(items);
            report = result;
            clearButton.disabled = false;
            exportButton.disabled = count === 0;
        } catch {
            status.textContent = 'Could not scan for HTML comments. Open or reload an HTTP or HTTPS page and try again.';
            clearButton.disabled = false;
        } finally {
            scanButton.disabled = false;
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
