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
let allNotes = [];

function loadNotes() {
    chrome.storage.local.get(['observatron_notes'], function(result) {
        allNotes = result.observatron_notes || [];
        populateTypeFilter();
        filterAndRenderNotes();
    });
}

function populateTypeFilter() {
    const typeFilter = document.getElementById('typeFilter');
    const currentValue = typeFilter.value;

    // Clear existing options except the first 5 (all, note, question, todo, bug)
    while (typeFilter.options.length > 5) {
        typeFilter.remove(5);
    }

    // Get unique custom types (types that start with @ or are not standard types)
    const standardTypes = ['note', 'question', 'todo', 'bug'];
    const customTypes = new Set();

    allNotes.forEach(note => {
        if (!standardTypes.includes(note.type)) {
            customTypes.add(note.type);
        }
    });

    // Add custom types to dropdown
    Array.from(customTypes).sort().forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type.charAt(0).toUpperCase() + type.slice(1) + 's'; // Pluralize
        typeFilter.appendChild(option);
    });

    // Restore previous selection if it still exists
    if (Array.from(typeFilter.options).some(option => option.value === currentValue)) {
        typeFilter.value = currentValue;
    } else {
        typeFilter.value = 'all';
    }
}

function filterAndRenderNotes() {
    const typeFilter = document.getElementById('typeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;

    let filteredNotes = allNotes;

    // Filter by type
    if (typeFilter !== 'all') {
        filteredNotes = filteredNotes.filter(note => note.type === typeFilter);
    }

    // Filter by status
    if (statusFilter !== 'all') {
        filteredNotes = filteredNotes.filter(note => {
            const effectiveStatus = note.type === 'note' ? 'closed' : note.status;
            return effectiveStatus === statusFilter;
        });
    }

    renderNotes(filteredNotes);
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

        // Add closing note if present
        if (note.closingNote) {
            const closingDiv = document.createElement('div');
            closingDiv.style.fontStyle = 'italic';
            closingDiv.style.color = '#666';
            closingDiv.style.marginTop = '5px';
            closingDiv.textContent = `Closed: ${note.closingNote}`;
            noteDiv.appendChild(closingDiv);
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
    const noteDiv = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!noteDiv) return;

    const existingInput = noteDiv.querySelector('.closing-note-input');
    if (existingInput) {
        // Confirm close with the entered text
        const closingNote = existingInput.value.trim();
        chrome.storage.local.get(['observatron_notes'], function(result) {
            const notes = result.observatron_notes || [];
            const note = notes.find(n => n.id === noteId);
            if (note) {
                note.closingNote = closingNote || undefined;
                note.status = 'closed';
                chrome.storage.local.set({observatron_notes: notes}, function() {
                    loadNotes(); // Re-render
                });
            }
        });
    } else {
        // Check if we're opening or closing
        chrome.storage.local.get(['observatron_notes'], function(result) {
            const notes = result.observatron_notes || [];
            const note = notes.find(n => n.id === noteId);
            if (note && note.type !== 'note') {
                if (note.status === 'open') {
                    // Closing - show input
                    showClosingNoteInput(noteId);
                } else {
                    // Opening - clear closing note and update status
                    note.status = 'open';
                    // Keep closingNote for potential re-closing
                    chrome.storage.local.set({observatron_notes: notes}, function() {
                        loadNotes(); // Re-render
                    });
                }
            }
        });
    }
}

function showClosingNoteInput(noteId) {
    const noteDiv = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!noteDiv) return;

    // Hide the status button temporarily
    const statusButton = noteDiv.querySelector('button');
    if (statusButton) statusButton.style.display = 'none';

    // Create input container
    const inputContainer = document.createElement('div');
    inputContainer.style.marginTop = '5px';

    const inputLabel = document.createElement('label');
    inputLabel.textContent = 'Closing note: ';
    inputLabel.style.fontSize = '12px';
    inputLabel.style.color = '#666';

    const input = document.createElement('textarea');
    input.className = 'closing-note-input';
    input.placeholder = 'e.g., done, raised as JIRA-123';
    input.style.width = '200px';
    input.style.height = '40px';
    input.style.marginRight = '5px';
    input.style.resize = 'vertical';

    // Get existing closing note if reopening and re-closing
    chrome.storage.local.get(['observatron_notes'], function(result) {
        const notes = result.observatron_notes || [];
        const note = notes.find(n => n.id === noteId);
        if (note && note.closingNote) {
            input.value = note.closingNote;
        }
        input.focus();
    });

    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Confirm Close';
    confirmButton.onclick = () => toggleNoteStatus(noteId);

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.marginLeft = '5px';
    cancelButton.onclick = () => {
        // Hide input and show status button again
        inputContainer.remove();
        if (statusButton) statusButton.style.display = 'inline-block';
    };

    inputContainer.appendChild(inputLabel);
    inputContainer.appendChild(input);
    inputContainer.appendChild(confirmButton);
    inputContainer.appendChild(cancelButton);

    // Insert after the timestamp
    const timestampSpan = noteDiv.querySelector('small');
    if (timestampSpan) {
        timestampSpan.parentNode.insertBefore(inputContainer, timestampSpan.nextSibling);
    } else {
        noteDiv.appendChild(inputContainer);
    }
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
        allNotes = changes.observatron_notes.newValue || [];
        populateTypeFilter();
        filterAndRenderNotes();
    }
});

// Load notes on page load
document.addEventListener('DOMContentLoaded', function() {
    loadNotes();
    document.getElementById('saveNotes').addEventListener('click', saveNotesAs);
    document.getElementById('loadNotes').addEventListener('click', () => {
        document.getElementById('notesFileInput').click();
    });
    document.getElementById('notesFileInput').addEventListener('change', loadNotesFromFile);
    document.getElementById('clearNotes').addEventListener('click', clearNotes);

    // Add filter event listeners
    document.getElementById('typeFilter').addEventListener('change', filterAndRenderNotes);
    document.getElementById('statusFilter').addEventListener('change', filterAndRenderNotes);
    document.getElementById('clearFilters').addEventListener('click', clearFilters);
});

function clearFilters() {
    document.getElementById('typeFilter').value = 'all';
    document.getElementById('statusFilter').value = 'all';
    filterAndRenderNotes();
}

function loadNotesFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const loadedNotes = JSON.parse(e.target.result);

            // Validate that it's an array
            if (!Array.isArray(loadedNotes)) {
                throw new Error('Invalid format: expected an array of notes');
            }

            // Basic validation of note structure
            for (const note of loadedNotes) {
                if (!note.id || !note.text || !note.type || !note.timestamp) {
                    throw new Error('Invalid note structure: missing required fields');
                }
                if (!['note', 'question', 'todo', 'bug'].includes(note.type) && !note.type.startsWith('@')) {
                    // Allow custom types starting with @
                }
            }

            // If validation passes, confirm replacement
            const confirmed = confirm(`Found ${loadedNotes.length} notes in the file. This will replace all existing notes. Continue?`);
            if (confirmed) {
                // Save to storage
                chrome.storage.local.set({observatron_notes: loadedNotes}, function() {
                    // Update memory
                    allNotes = loadedNotes;
                    // Update UI
                    populateTypeFilter();
                    filterAndRenderNotes();
                    console.log(`Loaded ${loadedNotes.length} notes from file`);
                    alert(`Successfully loaded ${loadedNotes.length} notes from file.`);
                });
            }
        } catch (error) {
            alert('Error loading notes: ' + error.message);
            console.error('Error loading notes:', error);
        }
    };

    reader.onerror = function() {
        alert('Error reading file');
    };

    reader.readAsText(file);

    // Clear the input so the same file can be selected again
    event.target.value = '';
}

function clearNotes() {
    const confirmed = confirm('Are you sure you want to clear all notes? This action cannot be undone.');
    if (confirmed) {
        // Clear from storage
        chrome.storage.local.remove(['observatron_notes'], function() {
            // Clear from memory
            allNotes = [];
            // Update UI
            populateTypeFilter(); // This will clear custom types from filter
            filterAndRenderNotes();
            console.log('All notes cleared');
        });
    }
}

function saveNotesAs() {
    const format = document.getElementById('exportFormat').value;

    chrome.storage.local.get(['observatron_notes'], function(result) {
        const notes = result.observatron_notes || [];

        if (notes.length === 0) {
            alert('No notes to save.');
            return;
        }

        let content, mimeType, extension;

        if (format === 'json') {
            // JSON format
            content = JSON.stringify(notes, null, 2);
            mimeType = 'application/json';
            extension = 'json';
        } else {
            // Text format (default)
            // Sort notes by creation time (oldest first)
            const sortedNotes = [...notes].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            content = '';
            sortedNotes.forEach(note => {
                const date = new Date(note.timestamp);
                const formattedDate = date.toLocaleString(); // Readable date/time
                const noteType = note.type.toUpperCase();

                // Add status for special notes (question, todo, bug, custom)
                const isSpecialNote = ['question', 'todo', 'bug'].includes(note.type) || note.type.startsWith('@');
                const statusText = isSpecialNote ? ` : ${note.status.toUpperCase()}` : '';

                content += `${formattedDate}: ${noteType}${statusText}\n\n`;
                content += `${note.text}\n`;

                // Add closing note if present
                if (note.closingNote) {
                    content += `\nClosed: ${note.closingNote}\n`;
                }

                // Add screenshot filenames if any
                if (note.screenshots && note.screenshots.length > 0) {
                    content += '\nScreenshots:\n';
                    note.screenshots.forEach(filename => {
                        content += `- ${filename}\n`;
                    });
                }

                content += '\n';
            });
            mimeType = 'text/plain';
            extension = 'txt';
        }

        // Create blob and download
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const filename = `observatron_notes_${new Date().toISOString().split('T')[0]}.${extension}`;

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