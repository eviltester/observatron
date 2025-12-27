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
            } else {
                // Clear the textarea after saving
                document.getElementById('noteText').value = '';
                // Notes will be re-rendered via storage change listener
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

// Notes collection functionality
function loadNotes() {
    chrome.storage.local.get(['observatron_notes'], function(result) {
        const notes = result.observatron_notes || [];
        renderNotes(notes);
    });
}

function truncateNoteText(text) {
    const maxLength = 60;
    if (text.length <= maxLength) {
        return { truncated: text, isTruncated: false };
    }

    // Check for newline within first 60 chars
    const newlineIndex = text.indexOf('\n');
    if (newlineIndex !== -1 && newlineIndex <= maxLength) {
        const truncated = text.substring(0, newlineIndex);
        return { truncated: truncated, isTruncated: text.length > truncated.length };
    }

    // Truncate at 60 chars, but try to break at word boundary
    let truncated = text.substring(0, maxLength);
    const lastSpaceIndex = truncated.lastIndexOf(' ');
    if (lastSpaceIndex > maxLength * 0.7) { // Only break at space if it's not too far back
        truncated = truncated.substring(0, lastSpaceIndex);
    }

    return { truncated: truncated + '...', isTruncated: true };
}

function renderNotes(notes) {
    const container = document.getElementById('notes-container');
    container.innerHTML = '';

    if (notes.length === 0) {
        container.innerHTML = '<p>No notes yet.</p>';
        return;
    }

    // Sort notes by timestamp in descending order (most recent first)
    notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    notes.forEach(note => {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'note-item';
        noteDiv.style.border = '1px solid #ccc';
        noteDiv.style.margin = '5px 0';
        noteDiv.style.padding = '5px';
        noteDiv.setAttribute('data-note-id', note.id);

        const typeSpan = document.createElement('span');
        typeSpan.textContent = `[${note.type}] `;
        typeSpan.style.fontWeight = 'bold';

        const textSpan = document.createElement('span');
        const { truncated, isTruncated } = truncateNoteText(note.text);
        textSpan.innerHTML = truncated.replace(/\n/g, '<br>');
        textSpan.setAttribute('data-full-text', note.text);
        textSpan.setAttribute('data-truncated', isTruncated ? 'true' : 'false');
        textSpan.setAttribute('data-expanded', 'false');

        const timestampSpan = document.createElement('small');
        timestampSpan.textContent = ` (${new Date(note.timestamp).toLocaleString()})`;
        timestampSpan.style.color = '#666';

        // Only show status button for certain note types
        const showStatusButton = ['question', 'todo', 'bug'].includes(note.type) || note.type.startsWith('@');

        if (showStatusButton) {
            const statusButton = document.createElement('button');
            statusButton.textContent = note.status === 'open' ? 'Close' : 'Open';
            statusButton.onclick = () => toggleNoteStatus(note.id);
            noteDiv.appendChild(statusButton);
        }

        noteDiv.appendChild(typeSpan);
        noteDiv.appendChild(textSpan);

        // Add expand/collapse button if text was truncated
        if (isTruncated) {
            const expandButton = document.createElement('button');
            expandButton.textContent = 'Show More';
            expandButton.style.marginLeft = '5px';
            expandButton.className = 'expand-button';
            expandButton.setAttribute('data-note-id', note.id);
            expandButton.addEventListener('click', () => toggleNoteExpansion(note.id));
            noteDiv.appendChild(expandButton);
        }

        noteDiv.appendChild(timestampSpan);

        // Style based on status - for 'note' type, always treat as closed
        const effectiveStatus = note.type === 'note' ? 'closed' : note.status;
        if (effectiveStatus === 'closed') {
            noteDiv.style.opacity = '0.6';
        }

        container.appendChild(noteDiv);
    });
}

function toggleNoteStatus(noteId) {
    chrome.storage.local.get(['observatron_notes'], function(result) {
        const notes = result.observatron_notes || [];
        const note = notes.find(n => n.id === noteId);
        if (note && note.type !== 'note') { // Don't allow toggling for 'note' type
            note.status = note.status === 'open' ? 'closed' : 'open';
            chrome.storage.local.set({observatron_notes: notes}, function() {
                loadNotes(); // Re-render
            });
        }
    });
}

function toggleNoteExpansion(noteId) {
    const noteDiv = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!noteDiv) return;

    const textSpan = noteDiv.querySelector('span[data-full-text]');
    const expandButton = noteDiv.querySelector('.expand-button');

    if (!textSpan || !expandButton) return;

    const isExpanded = textSpan.getAttribute('data-expanded') === 'true';
    const fullText = textSpan.getAttribute('data-full-text');

    if (isExpanded) {
        // Collapse
        const { truncated } = truncateNoteText(fullText);
        textSpan.innerHTML = truncated.replace(/\n/g, '<br>');
        expandButton.textContent = 'Show More';
        textSpan.setAttribute('data-expanded', 'false');
    } else {
        // Expand
        textSpan.innerHTML = fullText.replace(/\n/g, '<br>');
        expandButton.textContent = 'Show Less';
        textSpan.setAttribute('data-expanded', 'true');
    }
}

// Listen for storage changes to update notes display
chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local' && changes.observatron_notes) {
        loadNotes();
    }
});

// Load notes on page load
document.addEventListener('DOMContentLoaded', function() {
    loadNotes();
    document.getElementById('saveNotes').addEventListener('click', saveNotesAs);
});

function saveNotesAs() {
    chrome.storage.local.get(['observatron_notes'], function(result) {
        const notes = result.observatron_notes || [];

        if (notes.length === 0) {
            alert('No notes to save.');
            return;
        }

        // Sort notes by creation time (oldest first)
        notes.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Format notes
        let content = '';
        notes.forEach(note => {
            const date = new Date(note.timestamp);
            const formattedDate = date.toLocaleString(); // Readable date/time
            const noteType = note.type.toUpperCase();

            // Add status for special notes (question, todo, bug, custom)
            const isSpecialNote = ['question', 'todo', 'bug'].includes(note.type) || note.type.startsWith('@');
            const statusText = isSpecialNote ? ` : ${note.status.toUpperCase()}` : '';

            content += `${formattedDate}: ${noteType}${statusText}\n\n`;
            content += `${note.text}\n`;

            // Add screenshot filenames if any
            if (note.screenshots && note.screenshots.length > 0) {
                content += '\nScreenshots:\n';
                note.screenshots.forEach(filename => {
                    content += `- ${filename}\n`;
                });
            }

            content += '\n';
        });

        // Create blob and download
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const filename = `observatron_notes_${new Date().toISOString().split('T')[0]}.txt`;

        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: true
        }, function(downloadId) {
            if (chrome.runtime.lastError) {
                console.warn('Download failed:', chrome.runtime.lastError.message);
            } else {
                console.log('Notes saved as:', filename);
            }
        });
    });
}