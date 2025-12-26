'use strict';

document.getElementById('saveNote').addEventListener('click', function() {
    const noteText = document.getElementById('noteText').value;
    const withScreenshot = document.getElementById('withScreenshot').checked;

    if (noteText.trim()) {
        // Send message to background script
        chrome.runtime.sendMessage({
            method: 'saveNote',
            noteText: noteText,
            withScreenshot: withScreenshot
        }, function(response) {
            if (chrome.runtime.lastError) {
                console.warn("Failed to save note:", chrome.runtime.lastError.message);
            }
        });
    }
});

document.getElementById('cancelNote').addEventListener('click', function() {
    const noteText = document.getElementById('noteText');
    noteText.value="";
});

document.getElementById('takeScreenshot').addEventListener('click', function() {
    // Send message to background script
    chrome.runtime.sendMessage({
        method: 'takeScreenshot'
    }, function(response) {
        if (chrome.runtime.lastError) {
            console.warn("Failed to take screenshot:", chrome.runtime.lastError.message);
        }
    });
});

document.getElementById('savePage').addEventListener('click', function() {
    // Send message to background script
    chrome.runtime.sendMessage({
        method: 'savePage'
    }, function(response) {
        if (chrome.runtime.lastError) {
            console.warn("Failed to savePage:", chrome.runtime.lastError.message);
        }
    });
});

document.getElementById('saveSelectedElement').addEventListener('click', function() {
    const withElementScreenshot = document.getElementById('withElementScreenshot').checked;

    // Update element data if screenshot is requested
    if (withElementScreenshot) {
        window.parent.postMessage({type: 'updateElementData'}, '*');
    }

    // Wait a bit for update, then get from storage
    setTimeout(() => {
        chrome.storage.local.get(['selectedElement', 'inspectedTabId'], function(result) {
            const element = result.selectedElement;
            const tabId = result.inspectedTabId;
            if (element && tabId) {
                // Format as markdown and description
                const markdown = `\`\`\`html\n${element.outerHTML}\n\`\`\``;
                const description = element.description;

                const noteText = `${markdown}\n\n${description}`;

                // Send message to background script
                chrome.runtime.sendMessage({
                    method: 'saveSelectedElementNote',
                    noteText: noteText,
                    withScreenshot: false,
                    withElementScreenshot: withElementScreenshot,
                    selector: element.selector,
                    rect: element.rect,
                    tabId: tabId
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.warn("Failed to save selected element note:", chrome.runtime.lastError.message);
                    }
                });
            } else {
                alert("No element selected in Elements panel or tab ID not available.");
            }
        });
    }, 200);
});

// Focus on textarea when page loads
document.getElementById('noteText').focus();