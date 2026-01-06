function saveCommentsAsMarkdown(comments, pageUrl) {
    if (comments.length === 0) {
        console.log('No HTML comments found on this page.');
        return;
    }

    const now = new Date();
    const dateTime = now.toLocaleString();

    let markdown = '# HTML Comments\n\n';
    markdown += `**URL:** ${pageUrl}\n\n`;
    markdown += `**Date:** ${dateTime}\n\n`;

    comments.forEach((comment, index) => {
        // Format multi-line comments with proper indentation
        const formattedComment = comment.replace(/\n/g, '\n   ');
        markdown += `${index + 1}. ${formattedComment}\n\n`;
    });

    const dataURL = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(markdown);
    const filename = `html_comments_${now.toISOString().split('T')[0]}.md`;

    chrome.downloads.download({
        url: dataURL,
        filename: filename,
        saveAs: true
    }, function(downloadId) {
        if (chrome.runtime.lastError) {
            console.warn('Download failed:', chrome.runtime.lastError.message);
        } else {
            console.log('Comments saved as:', filename);
        }
    });
}