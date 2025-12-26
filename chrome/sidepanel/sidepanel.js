'use strict';

document.getElementById('saveNote').addEventListener('click', function() {
    const noteText = document.getElementById('noteText').value;
    const withScreenshot = document.getElementById('withScreenshot').checked;
    const withElementScreenshot = document.getElementById('withElementScreenshot').checked;

    if (noteText.trim()) {
        // Send message to background script
        chrome.runtime.sendMessage({
            method: 'saveNote',
            noteText: noteText,
            withScreenshot: withScreenshot,
            withElementScreenshot: withElementScreenshot
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

document.getElementById('addSelectedElement').addEventListener('click', function() {
    // Update element data first
    chrome.runtime.sendMessage({type: 'updateElementData'});
    setTimeout(() => {
        addElementToNote();
    }, 100);
});



function addElementToNote() {
    // Get selected element from storage
    chrome.storage.local.get(['selectedElement'], function(result) {
        const element = result.selectedElement;
        if (element) {
            // Format as markdown and description
            const markdown = `\`\`\`html\n${element.outerHTML}\n\`\`\``;
            const description = element.description;

            const currentText = document.getElementById('noteText').value;
            const newText = currentText ? currentText + '\n\n' + markdown + '\n\n' + description : markdown + '\n\n' + description;
            document.getElementById('noteText').value = newText;
        } else {
            alert("No element selected in Elements panel.");
        }
    });
}

// Focus on textarea when page loads
document.getElementById('noteText').focus();