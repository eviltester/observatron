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

// Focus on textarea when page loads
document.getElementById('noteText').focus();