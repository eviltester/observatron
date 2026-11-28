'use strict';

const showPanelView = (() => {
    const tabs = [...document.querySelectorAll('#sidepanel-tabs [role="tab"]')];
    // Move the existing controls so the focused views share their state and handlers.
    const sharedControls = [...document.querySelectorAll('[data-focused-panel]')].map(control => {
        const home = document.createComment('Shared control position');
        control.before(home);
        return {control, home, panelId: control.dataset.focusedPanel};
    });
    let leavingOptions = false;

    async function selectPanelTab(selected) {
        const current = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
        if (current === selected) return true;
        if (leavingOptions) return false;
        if (current.id === 'options-tab' && typeof saveOptionsOnLeave === 'function') {
            leavingOptions = true;
            try {
                if (!await saveOptionsOnLeave()) {
                    current.focus();
                    window.scrollTo(0, 0);
                    return false;
                }
            } finally {
                leavingOptions = false;
            }
        }
        const panel = document.getElementById(selected.getAttribute('aria-controls'));
        for (const {control, home, panelId} of sharedControls) {
            if (panelId === panel.id) panel.append(control);
            else if (control.previousSibling !== home) home.after(control);
        }
        for (const tab of tabs) {
            const active = tab === selected;
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
        }
        window.scrollTo(0, 0);
        selected.focus({preventScroll: true});
        return true;
    }

    bindTabNavigation(tabs, selectPanelTab);
    return id => selectPanelTab(document.getElementById(id));
})();

function appendToNoteDraft(text) {
    const draft = document.getElementById('noteText');
    draft.value = draft.value ? `${draft.value}\n\n${text}` : text;
    draft.focus();
    draft.setSelectionRange(draft.value.length, draft.value.length);
}

function focusPanelTop() {
    window.scrollTo(0, 0);
    document.querySelector('#sidepanel-tabs [aria-selected="true"]').focus({preventScroll: true});
}

const panelInspectedTabId = chrome.devtools?.inspectedWindow?.tabId;
const devtoolsPageUrl = chrome.runtime.getURL('devtools/devtools.html');
const elementActionButtons = document.querySelectorAll('button[data-element-source]');
const panelActionsInProgress = new Set();
const clickedElementPorts = new Map();
let clickedElementUpdate = 0;
let elementDevtoolsChannel;
let elementDevtoolsPort;
let targetPageUpdate = 0;
let shownTargetTabId;
let shownTargetWindowId;
let shownPanelTab;
const panelTargetObservers = new Set();
const targetPageLink = document.getElementById('target-page-url');
const targetPageCopy = document.getElementById('copy-target-page-url');
const targetPageNote = document.getElementById('create-target-page-note');
const targetPageCopyFeedback = document.getElementById('target-page-copy-feedback');
let targetPageCopyTimer;

function mostRecentClick(clicks) {
    return clicks.reduce((latest, click) => Number.isFinite(click?.time) &&
        (!latest || click.time > latest.time) ? click : latest, null);
}

function updateElementActionButtons() {
    const last = mostRecentClick(Array.from(clickedElementPorts.values(), entry => entry.click));
    const availability = {
        active: Boolean(last?.available),
        selected: panelInspectedTabId !== undefined || Boolean(elementDevtoolsPort)
    };
    for (const button of elementActionButtons) {
        button.disabled = panelActionsInProgress.has(button) || !availability[button.dataset.elementSource];
    }
}

async function activePageFrames(tabId) {
    const frames = await chrome.webNavigation.getAllFrames({tabId});
    return (frames || []).filter(frame => frame.documentId &&
        (!frame.documentLifecycle || frame.documentLifecycle === 'active'));
}

async function syncClickedElementPorts(tabId, refresh = false) {
    const update = ++clickedElementUpdate;
    if (refresh) {
        for (const {port} of clickedElementPorts.values()) {
            try {
                port.postMessage('refresh');
            } catch {
                // Navigation can close a document's port before onDisconnect runs.
            }
        }
    }
    const frames = await activePageFrames(tabId).catch(() => []);
    if (update !== clickedElementUpdate || tabId !== shownTargetTabId) return;

    const documents = new Set(frames.map(frame => frame.documentId));
    for (const [documentId, entry] of clickedElementPorts) {
        if (!documents.has(documentId)) {
            clickedElementPorts.delete(documentId);
            entry.port.disconnect();
        }
    }
    for (const documentId of documents) {
        if (clickedElementPorts.has(documentId)) continue;
        const port = chrome.tabs.connect(tabId, {name: 'observatron-element-click', documentId});
        const entry = {port, click: null};
        clickedElementPorts.set(documentId, entry);
        port.onMessage.addListener(click => {
            if (clickedElementPorts.get(documentId) !== entry) return;
            entry.click = click;
            updateElementActionButtons();
        });
        port.onDisconnect.addListener(() => {
            void chrome.runtime.lastError;
            if (clickedElementPorts.get(documentId) !== entry) return;
            clickedElementPorts.delete(documentId);
            updateElementActionButtons();
        });
    }
    updateElementActionButtons();
}

function requestElementDevtoolsStatus() {
    void chrome.runtime.sendMessage({
        type: 'observatronTrackElementDevtools', tabId: shownTargetTabId, channel: elementDevtoolsChannel
    }).catch(() => {});
}

if (panelInspectedTabId === undefined) {
    chrome.runtime.onConnect.addListener(port => {
        if (port.name !== elementDevtoolsChannel || port.sender?.url !== devtoolsPageUrl) return;
        if (elementDevtoolsPort) {
            port.disconnect();
            return;
        }
        elementDevtoolsPort = port;
        updateElementActionButtons();
        port.onDisconnect.addListener(() => {
            void chrome.runtime.lastError;
            if (elementDevtoolsPort !== port) return;
            elementDevtoolsPort = undefined;
            updateElementActionButtons();
        });
    });
    chrome.runtime.onMessage.addListener((request, sender) => {
        if (request.type === 'observatronFocusSidePanel' && sender.url === chrome.runtime.getURL('javascript/worker.js') &&
            request.tabId === shownTargetTabId) {
            focusPanelTop();
        }
        if (request.type === 'observatronElementDevtoolsReady' && sender.url === devtoolsPageUrl &&
            request.tabId === shownTargetTabId && elementDevtoolsChannel) {
            requestElementDevtoolsStatus();
        }
    });
}

function setElementActionTarget(tabId) {
    if (shownTargetTabId === tabId) return;
    shownTargetTabId = tabId;
    ++clickedElementUpdate;
    const oldPorts = [...clickedElementPorts.values()];
    clickedElementPorts.clear();
    for (const {port} of oldPorts) port.disconnect();
    const oldDevtoolsPort = elementDevtoolsPort;
    elementDevtoolsPort = undefined;
    elementDevtoolsChannel = undefined;
    oldDevtoolsPort?.disconnect();
    updateElementActionButtons();
    if (panelInspectedTabId === undefined && tabId !== undefined) {
        elementDevtoolsChannel = `observatron-element-devtools:${crypto.randomUUID()}`;
        requestElementDevtoolsStatus();
    }
}

async function getPanelTab() {
    if (panelInspectedTabId !== undefined) return chrome.tabs.get(panelInspectedTabId);
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    return tab;
}

async function refreshPanelTarget() {
    const update = ++targetPageUpdate;
    const tab = await getPanelTab().catch(() => undefined);
    if (update !== targetPageUpdate) return;
    shownTargetWindowId = tab?.windowId;
    setElementActionTarget(tab?.id);
    const targetChanged = tab?.id !== shownPanelTab?.id || tab?.url !== shownPanelTab?.url;
    shownPanelTab = tab;
    renderTargetPageUrl(tab?.url);
    if (targetChanged) for (const observer of panelTargetObservers) observer(tab);
    if (tab) void syncClickedElementPorts(tab.id, true);
}

function renderTargetPageUrl(url) {
    const suffix = url?.search(/[?#]/) ?? -1;
    targetPageLink.textContent = !url ? 'Page URL unavailable' : suffix === -1 ? url : `${url.slice(0, suffix + 1)}…`;
    targetPageLink.title = url || '';
    if (/^https?:\/\//i.test(url || '')) targetPageLink.href = url;
    else targetPageLink.removeAttribute('href');
    targetPageCopy.disabled = !url;
    targetPageNote.disabled = !url;
}

function watchPanelPageReport(reportKey, render, select = (report, tab) => report?.url === tab?.url ? report : undefined) {
    let key;
    let target;
    let revision = 0;

    function applyReport(report) {
        ++revision;
        render(select(report, target));
    }

    function watchTarget(tab) {
        key = tab ? reportKey(tab.id) : undefined;
        target = tab;
        applyReport();
        if (!key) return;
        const expected = revision;
        const requestedKey = key;
        chrome.storage.session.get(requestedKey).then(result => {
            if (expected === revision) applyReport(result[requestedKey]);
        }).catch(() => {});
    }

    panelTargetObservers.add(watchTarget);
    if (shownPanelTab) watchTarget(shownPanelTab);
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'session' && key && changes[key]) applyReport(changes[key].newValue);
    });

    return {
        async save(tab, report) {
            const destination = reportKey(tab.id);
            const expected = revision;
            await chrome.storage.session.set({[destination]: report});
            if (expected === revision && key === destination && target?.url === report.url) applyReport(report);
        },
        async clear() {
            applyReport();
            if (key) await chrome.storage.session.remove(key);
        }
    };
}

document.getElementById('target-page-label').textContent = panelInspectedTabId === undefined ? 'Active Page:' : 'Inspected Page:';
if (panelInspectedTabId === undefined) {
    chrome.tabs.onActivated.addListener(({tabId, windowId}) => {
        if (shownTargetWindowId !== undefined && windowId !== shownTargetWindowId) return;
        if (tabId !== shownTargetTabId) setElementActionTarget(undefined);
        void refreshPanelTarget();
    });
}
chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url !== undefined && tabId === (panelInspectedTabId ?? shownTargetTabId)) void refreshPanelTarget();
});
chrome.tabs.onRemoved.addListener(tabId => {
    if (tabId === shownTargetTabId) void refreshPanelTarget();
});
for (const event of [chrome.webNavigation.onCommitted, chrome.webNavigation.onDOMContentLoaded]) {
    event.addListener(({tabId}) => {
        if (tabId === shownTargetTabId) void syncClickedElementPorts(tabId);
    });
}
for (const event of [chrome.webNavigation.onHistoryStateUpdated, chrome.webNavigation.onReferenceFragmentUpdated]) {
    event.addListener(({tabId}) => {
        if (tabId === shownTargetTabId) void syncClickedElementPorts(tabId, true);
    });
}
void refreshPanelTarget();

const panelActionWarnings = new WeakMap();

function warningForAction(button) {
    const anchor = button.closest('[data-action-group]') || button;
    if (panelActionWarnings.has(anchor)) return panelActionWarnings.get(anchor);

    const template = document.getElementById('panel-action-warning-template');
    const warning = template.content.firstElementChild.cloneNode(true);
    const message = warning.querySelector('[role="alert"]');
    const dismiss = warning.querySelector('button');
    let timeout;
    function clearWarning() {
        clearTimeout(timeout);
        warning.hidden = true;
        message.textContent = '';
    }
    function showWarning(text) {
        clearTimeout(timeout);
        warning.hidden = false;
        message.textContent = text;
        timeout = setTimeout(clearWarning, 15000);
    }
    dismiss.addEventListener('click', clearWarning);
    anchor.after(warning);
    const controls = {clearWarning, showWarning};
    panelActionWarnings.set(anchor, controls);
    return controls;
}

function registerPanelAction(control, action) {
    const button = typeof control === 'string' ? document.getElementById(control) : control;
    const form = button.type === 'submit' ? button.form : null;
    const hasElementSource = Boolean(button.dataset.elementSource);
    const {clearWarning, showWarning} = warningForAction(button);
    (form || button).addEventListener(form ? 'submit' : 'click', async event => {
        if (form) event.preventDefault();
        if (button.disabled) return;
        button.disabled = true;
        if (hasElementSource) panelActionsInProgress.add(button);
        clearWarning();
        try {
            const warning = await action();
            if (typeof warning === 'string') showWarning(warning);
        } catch (error) {
            showWarning(error.message);
        } finally {
            if (hasElementSource) {
                panelActionsInProgress.delete(button);
                updateElementActionButtons();
            } else {
                button.disabled = false;
            }
        }
    });
}

{
    const start = document.getElementById('start-observing');
    const stop = document.getElementById('stop-observing');
    const icon = document.getElementById('observation-icon');
    const status = document.getElementById('observation-status');
    const {clearWarning, showWarning} = warningForAction(start);
    let domain;
    let changing = false;

    function updateControls() {
        const canObserve = /^https?:\/\//i.test(shownPanelTab?.url || '');
        icon.src = domain ? '../icons/green.png' : '../icons/red.png';
        status.textContent = domain ? `Observing ${domain}` : domain === null ? 'Observation stopped' : 'Checking observation status…';
        start.disabled = changing || domain !== null || !canObserve;
        stop.disabled = changing || !domain;
    }

    async function changeObservationFromPanel(action) {
        changing = true;
        clearWarning();
        updateControls();
        try {
            const tab = action === 'start' ? await requirePanelTab() : undefined;
            await sendPanelAction('changeObservation', tab, {action});
        } catch (error) {
            showWarning(error.message);
        } finally {
            changing = false;
            updateControls();
        }
    }

    start.addEventListener('click', () => changeObservationFromPanel('start'));
    stop.addEventListener('click', () => changeObservationFromPanel('stop'));
    panelTargetObservers.add(updateControls);
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.observatronEngagedDomain) {
            domain = changes.observatronEngagedDomain.newValue || null;
            updateControls();
        }
    });
    chrome.storage.local.get('observatronEngagedDomain').then(({observatronEngagedDomain}) => {
        if (domain === undefined) domain = observatronEngagedDomain || null;
        updateControls();
    }).catch(error => {
        if (domain === undefined) status.textContent = 'Observation status unavailable';
        showWarning(error.message);
    });
}

const targetPageWarning = warningForAction(targetPageCopy);
targetPageCopy.addEventListener('click', async () => {
    const url = shownPanelTab?.url;
    if (!url) return;
    targetPageWarning.clearWarning();
    clearTimeout(targetPageCopyTimer);
    targetPageCopyFeedback.textContent = '';
    try {
        await navigator.clipboard.writeText(url);
        targetPageCopyFeedback.textContent = 'Copied';
        targetPageCopyTimer = setTimeout(() => { targetPageCopyFeedback.textContent = ''; }, 2000);
    } catch (error) {
        targetPageWarning.showWarning(`Could not copy the page URL. ${error.message}`);
    }
});

targetPageNote.addEventListener('click', async () => {
    const url = shownPanelTab?.url;
    if (url && await showPanelView('notes-tab')) appendToNoteDraft(url);
});

async function requirePanelTab() {
    const tab = await getPanelTab();
    if (!Number.isInteger(tab?.id)) throw new Error('Open a page to use this action.');
    return tab;
}

async function selectedElementForPanel(tab) {
    let element;
    if (panelInspectedTabId !== undefined) {
        element = await readInspectedElement();
    } else {
        let response;
        try {
            response = await chrome.runtime.sendMessage({type: 'observatronReadSelectedElement', tabId: tab.id});
        } catch {
            // There is no DevTools selection listener for this tab.
        }
        if (!response) throw new Error(elementDevtoolsPort
            ? 'DevTools did not return a selection. Select an element in Elements and try again.'
            : 'Open DevTools on this page and select an element in Elements.');
        if (response.error) throw new Error(response.error);
        element = response.element;
    }

    await verifyPanelElementTarget(tab, element);
    if (!element) throw new Error('Select an element in DevTools → Elements on this page.');
    return element;
}

async function verifyPanelElementTarget(tab, element) {
    const current = await getPanelTab();
    if (current?.id !== tab.id || current.url !== tab.url ||
        (current.pendingUrl && current.pendingUrl !== tab.url) || (element && element.pageUrl !== tab.url)) {
        throw new Error('The target page changed. Select the element again on the current page.');
    }
}

async function activeElementForPanel(tab) {
    if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('Open an HTTP or HTTPS page and click an element first.');

    const frames = await activePageFrames(tab.id);
    const getClick = (frame, time) => chrome.tabs.sendMessage(tab.id, {
        type: 'observatronClickedElement', pageUrl: tab.url, time
    }, {documentId: frame.documentId}).catch(() => undefined);
    const replies = (await Promise.all(frames.map(async frame => {
        const click = await getClick(frame);
        return click && {...click, frame};
    }))).filter(Boolean);
    const last = mostRecentClick(replies);
    if (!last) {
        if (!replies.length) throw new Error('Reload the target page, then click the element and try again.');
        throw new Error('Click an element on the target page, then try again.');
    }
    const element = (await getClick(last.frame, last.time))?.element;
    await verifyPanelElementTarget(tab, element);
    if (!element) throw new Error('The clicked element changed. Click it again and retry.');
    return element;
}

async function sendPanelAction(method, tab, details = {}) {
    const noResponse = method === 'capturePanelElementScreenshot'
        ? 'Observatron did not confirm the element screenshot. Reload the extension and try again.' : undefined;
    const response = await chrome.runtime.sendMessage({method, tabId: tab?.id, pageUrl: tab?.url, ...details})
        .catch(error => { throw new Error(noResponse || error.message); });
    if (!response?.success) throw new Error(response?.error || noResponse || 'Observatron could not complete this action.');
    return response;
}

const includeNoteElementScreenshot = document.getElementById('withElementScreenshot');
const noteScreenshotSource = document.getElementById('note-screenshot-source');
const noteScreenshotSourceSetting = document.getElementById('note-screenshot-source-setting');
includeNoteElementScreenshot.addEventListener('change', () => {
    noteScreenshotSourceSetting.hidden = !includeNoteElementScreenshot.checked;
    if (includeNoteElementScreenshot.checked) {
        const active = document.getElementById('addActiveElement');
        const selected = document.getElementById('addSelectedElement');
        noteScreenshotSource.value = (panelInspectedTabId !== undefined || (active.disabled && !selected.disabled))
            ? 'selected' : 'active';
    }
});

registerPanelAction('saveNote', async () => {
    const draft = document.getElementById('noteText');
    const noteText = draft.value;
    if (!noteText.trim()) return;

    const withScreenshot = document.getElementById('withScreenshot').checked;
    const withElementScreenshot = includeNoteElementScreenshot.checked;
    const warnings = [];
    let tab;
    let element;
    if (withScreenshot || withElementScreenshot) {
        try {
            tab = await requirePanelTab();
        } catch (error) {
            warnings.push(`Could not attach the requested screenshot. ${error.message}`);
        }
    }
    if (tab && withElementScreenshot) {
        const readElement = noteScreenshotSource.value === 'selected' ? selectedElementForPanel : activeElementForPanel;
        try {
            element = await readElement(tab);
        } catch (error) {
            warnings.push(`Could not attach the element screenshot. ${error.message}`);
        }
    }
    const capturePageScreenshot = Boolean(tab && withScreenshot);
    const {attachmentErrors} = await sendPanelAction('saveNote', tab, {noteText, capturePageScreenshot, element});
    if (draft.value === noteText) draft.value = '';
    if (Array.isArray(attachmentErrors)) warnings.push(...attachmentErrors);
    else if (capturePageScreenshot || element) warnings.push('Observatron did not confirm the screenshot. Reload the extension before capturing again.');
    if (warnings.length) return `Note saved. ${warnings.join(' ')}`;
});

document.getElementById('cancelNote').addEventListener('click', () => {
    document.getElementById('noteText').value = '';
});

registerPanelAction('takeScreenshot', async () => sendPanelAction('takeScreenshot', await requirePanelTab()));
registerPanelAction('savePage', async () => sendPanelAction('savePage', await requirePanelTab()));

for (const [buttonId, readElement] of [
    ['takeActiveElementScreenshot', activeElementForPanel],
    ['takeElementScreenshot', selectedElementForPanel]
]) {
    registerPanelAction(buttonId, async () => {
        const tab = await requirePanelTab();
        const element = await readElement(tab);
        await sendPanelAction('capturePanelElementScreenshot', tab, {element});
    });
}

registerPanelAction('takeSelectorScreenshot', async () => {
    const selector = document.getElementById('element-screenshot-selector').value.trim();
    if (!selector) throw new Error('Enter a CSS selector.');
    const tab = await requirePanelTab();
    await sendPanelAction('capturePanelElementScreenshot', tab, {
        element: {selector, pageUrl: tab.url, elementUrl: tab.url, singleMatch: true}
    });
});

function addElementToDraft(element) {
    const source = ['Page: ' + element.pageUrl];
    if (element.inFrame) source.push('Frame: ' + element.elementUrl);
    const html = ['```html', element.outerHTML, '```'].join('\n');
    appendToNoteDraft([source.join('\n'), html, 'CSS Selector: ' + element.selector, element.description].join('\n\n'));
}

registerPanelAction('addSelectedElement', async () => {
    addElementToDraft(await selectedElementForPanel(await requirePanelTab()));
});

registerPanelAction('addActiveElement', async () => {
    addElementToDraft(await activeElementForPanel(await requirePanelTab()));
});

// Session name functionality
function loadSessionName() {
    chrome.storage.local.get(['observatron'], function(result) {
        const options = result.observatron || getDefaultOptions();
        updateSessionDisplay(options);
    });
}



function updateSessionDisplay(options) {
    const sessionName = options && options.sessionName ? options.sessionName : '';
    const sanitizedSession = sanitizeSessionName(sessionName);
    const folderStructure = options && options.folderStructure ? options.folderStructure : 'nested';
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    let sessionPath;
    if (folderStructure === 'flat') {
        sessionPath = `${year}-${month}-${day}`;
        if (sanitizedSession) {
            sessionPath += `-${sanitizedSession}`;
        }
        sessionPath += '/';
    } else {
        sessionPath = `observatron/${year}/${month}/${day}/`;
        if (sanitizedSession) {
            sessionPath += `${sanitizedSession}/`;
        }
    }

    document.getElementById('sessionPath').textContent = sessionPath;
    document.getElementById('sidepanelSessionName').value = sessionName;
}

function showSessionNameError(message) {
    const errorDiv = document.getElementById('sessionNameError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 2000);
}



document.getElementById('editSessionName').addEventListener('click', function() {
    document.getElementById('sessionDisplay').style.display = 'none';
    document.getElementById('sessionEdit').style.display = 'block';
    document.getElementById('sidepanelSessionName').focus();
});

document.getElementById('saveSessionName').addEventListener('click', function() {
    const sessionName = document.getElementById('sidepanelSessionName').value.trim();
    if (sessionName.length <= 20) {
        chrome.storage.local.get(['observatron'], function(result) {
            const options = result.observatron || getDefaultOptions();
            options.sessionName = sessionName;
            chrome.storage.local.set({observatron: options}, function() {
                if (chrome.runtime.lastError) {
                    console.error('Storage set error:', chrome.runtime.lastError);
                    return;
                }
                // Send updated options directly to worker
                chrome.runtime.sendMessage({action: 'updateOptions', options: options});
                loadSessionName(); // Reload from storage
                document.getElementById('sessionDisplay').style.display = 'block';
                document.getElementById('sessionEdit').style.display = 'none';
            });
        });
    } else {
        showSessionNameError('Session name must be 20 characters or less');
    }
});

document.getElementById('cancelSessionEdit').addEventListener('click', function() {
    // Reload the current session name to reset any changes
    loadSessionName();
    document.getElementById('sessionDisplay').style.display = 'block';
    document.getElementById('sessionEdit').style.display = 'none';
});

focusPanelTop();

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
    const standardOptionCount = standardNoteTypes.length + 1;
    while (typeFilter.options.length > standardOptionCount) {
        typeFilter.remove(standardOptionCount);
    }

    // Get unique display types (remove [] suffix for display)
    const displayTypes = new Set();

    allNotes.forEach(note => {
        const displayType = note.type.endsWith('[]') ? note.type.slice(0, -2) : note.type;
        if (!standardNoteTypes.includes(displayType)) {
            displayTypes.add(displayType);
        }
    });

    // Add custom display types to dropdown
    Array.from(displayTypes).sort().forEach(displayType => {
        const option = document.createElement('option');
        option.value = displayType; // Use display type for filtering
        option.textContent = displayType.charAt(0).toUpperCase() + displayType.slice(1) + 's'; // Pluralize
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

    // Filter by type (handle [] suffix)
    if (typeFilter !== 'all') {
        filteredNotes = filteredNotes.filter(note => {
            const displayType = note.type.endsWith('[]') ? note.type.slice(0, -2) : note.type;
            return displayType === typeFilter;
        });
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

        // Display type without [] suffix
        const displayType = note.type.endsWith('[]') ? note.type.slice(0, -2) : note.type;
        const typeSpan = document.createElement('span');
        typeSpan.textContent = `[${displayType}] `;
        typeSpan.style.fontWeight = 'bold';

        const textSpan = document.createElement('span');
        const { truncated, isTruncated } = truncateNoteText(note.text);
        textSpan.style.whiteSpace = 'pre-wrap';
        textSpan.textContent = truncated;
        textSpan.setAttribute('data-full-text', note.text);
        textSpan.setAttribute('data-truncated', isTruncated ? 'true' : 'false');
        textSpan.setAttribute('data-expanded', 'false');

        const timestampSpan = document.createElement('small');
        timestampSpan.textContent = ` (${new Date(note.timestamp).toLocaleString()})`;
        timestampSpan.style.color = '#666';

        // Only show status button for certain note types
        const showStatusButton = isClosableNoteType(note.type);

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

        // Add status button - position depends on current status
        if (showStatusButton) {
            const statusButton = document.createElement('button');
            statusButton.textContent = note.status === 'open' ? 'Close' : 'Open';
            statusButton.onclick = () => toggleNoteStatus(note.id);

            if (note.status === 'open') {
                // "Close" button goes at the beginning
                noteDiv.insertBefore(statusButton, noteDiv.firstChild);
            } else {
                // "Open" button goes after the expand button (or text span if no expand button)
                const insertAfter = isTruncated ? noteDiv.querySelector('.expand-button') : textSpan;
                if (insertAfter) {
                    insertAfter.parentNode.insertBefore(statusButton, insertAfter.nextSibling);
                } else {
                    noteDiv.appendChild(statusButton);
                }
            }
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

        if (note.status === 'open' && note.type !== 'note') addNoteTypeEditor(noteDiv, note);

        // Style based on status - for 'note' type, always treat as closed
        const effectiveStatus = note.type === 'note' ? 'closed' : note.status;
        if (effectiveStatus === 'closed') {
            noteDiv.style.opacity = '0.6';
        }

        container.appendChild(noteDiv);
    });
}

function addNoteTypeEditor(noteDiv, note) {
    const change = document.createElement('button');
    change.type = 'button';
    change.textContent = 'Change Type';
    const form = document.createElement('form');
    form.className = 'note-type-editor';
    form.hidden = true;

    const label = document.createElement('label');
    const type = document.createElement('select');
    const existing = new Set(allNotes.map(item => item.type));
    const builtIn = {note: 'Note', question: 'Question', todo: 'To-do', bug: 'Bug'};
    for (const value of [...standardNoteTypes, ...[...existing].filter(value => !standardNoteTypes.includes(value)).sort()]) {
        const name = Object.hasOwn(builtIn, value) ? builtIn[value]
            : value.endsWith('[]') ? `${value.slice(0, -2)} (open/close)` : value;
        type.add(new Option(name + (isClosableNoteType(value) ? '' : ' (closes note)'), value));
    }
    type.add(new Option('Custom type…', ''));
    type.value = note.type;
    label.append('Type ', type);

    const customLabel = document.createElement('label');
    const custom = document.createElement('input');
    custom.maxLength = 18;
    custom.placeholder = 'e.g. task[]';
    custom.required = true;
    customLabel.append('Custom type ', custom, ' Use [] to keep the note open.');
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Save Type';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const error = document.createElement('p');
    error.className = 'note-edit-error';
    error.setAttribute('role', 'alert');
    form.append(label, customLabel, save, cancel, error);

    function showCustomInput() {
        const useCustomType = type.value === '';
        custom.disabled = !useCustomType;
        customLabel.hidden = !useCustomType;
    }

    change.addEventListener('click', () => {
        form.hidden = false;
        change.hidden = true;
        type.focus();
    });
    type.addEventListener('change', showCustomInput);
    cancel.addEventListener('click', () => {
        form.reset();
        type.value = note.type;
        showCustomInput();
        error.textContent = '';
        form.hidden = true;
        change.hidden = false;
        change.focus();
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        save.disabled = true;
        error.textContent = '';
        try {
            const customType = type.value === '';
            if (type.value === note.type) {
                cancel.click();
                return;
            }
            await sendPanelAction('changeNoteType', undefined, {noteId: note.id, noteType: customType ? custom.value : type.value, customType});
            if (form.isConnected) cancel.click();
        } catch (failure) {
            error.textContent = failure.message;
        } finally {
            save.disabled = false;
        }
    });
    showCustomInput();
    noteDiv.append(change, form);
}

async function toggleNoteStatus(noteId) {
    const noteDiv = document.querySelector(`[data-note-id="${noteId}"]`);
    const note = allNotes.find(item => item.id === noteId);
    if (!noteDiv || !note || !isClosableNoteType(note.type)) return;

    const existingInput = noteDiv.querySelector('.closing-note-input');
    if (!existingInput && note.status === 'open') {
        showClosingNoteInput(noteId);
        return;
    }

    try {
        const status = existingInput ? 'closed' : 'open';
        await sendPanelAction('setNoteStatus', undefined, {noteId, status, closingNote: existingInput?.value});
    } catch (failure) {
        let error = noteDiv.querySelector('.note-status-error');
        if (!error) {
            error = document.createElement('p');
            error.className = 'note-status-error note-edit-error';
            error.setAttribute('role', 'alert');
            noteDiv.append(error);
        }
        error.textContent = failure.message;
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
        textSpan.textContent = truncated;
        expandButton.textContent = 'Show More';
        textSpan.setAttribute('data-expanded', 'false');
    } else {
        // Expand
        textSpan.textContent = fullText;
        expandButton.textContent = 'Show Less';
        textSpan.setAttribute('data-expanded', 'true');
    }
}

// Listen for storage changes to update notes and session display
chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local') {
        if (changes.observatron_notes) {
            allNotes = changes.observatron_notes.newValue || [];
            populateTypeFilter();
            filterAndRenderNotes();
        }
        if (changes.observatron) {
            // Update session display when options change (session name or folder structure)
            const options = changes.observatron.newValue || getDefaultOptions();
            updateSessionDisplay(options);
        }
    }
});

// Background processes status
function updateQueueStatus() {
    chrome.storage.session.get(['brokenLinkQueue', 'brokenImageQueue'], function(result) {
        const linkQueue = result.brokenLinkQueue || [];
        const imageQueue = result.brokenImageQueue || [];
        document.getElementById('linkQueueLength').textContent = linkQueue.length;
        document.getElementById('imageQueueLength').textContent = imageQueue.length;
    });
}

// Load notes on page load
document.addEventListener('DOMContentLoaded', function() {
    loadNotes();
    loadSessionName();
    updateQueueStatus(); // Initial update
    setInterval(updateQueueStatus, 2000); // Update every 2 seconds
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
                // Allow all types - validation happens at creation time
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
                const displayType = note.type.endsWith('[]') ? note.type.slice(0, -2) : note.type;
                const noteType = displayType.toUpperCase();

                // Add status for special notes (question, todo, bug, custom closable)
                const isSpecialNote = ['question', 'todo', 'bug'].includes(note.type) || note.type.endsWith('[]');
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
