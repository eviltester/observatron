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
        }, function() {
            window.close();
        });
    }
});

document.getElementById('cancelNote').addEventListener('click', function() {
    window.close();
});

// Focus on textarea when page loads
document.getElementById('noteText').focus();