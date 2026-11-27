'use strict';

const trafficNetwork = chrome.devtools?.network;
const trafficMatchColors = ['#b91c1c', '#166534', '#1d4ed8', '#6d28d9', '#9a3412', '#0e7490'];
const trafficCountChannelPrefix = 'observatron-traffic-count:';
const trafficExcerptContext = 80;
const trafficExcerptMatchLimit = 120;

function renderTrafficMatchCount(heading, count) {
    const countText = `${count} ${count === 1 ? 'match' : 'matches'}`;
    heading.querySelector('.traffic-match-count').textContent = countText;
    heading.style.color = count ? trafficMatchColors[(count - 1) % trafficMatchColors.length] : '';
    return countText;
}

if (trafficNetwork) {
    const monitor = document.getElementById('traffic-monitor');
    const monitorHeading = monitor.querySelector('summary');
    const inspectedTabId = chrome.devtools.inspectedWindow.tabId;
    const countPorts = new Map();
    const rulesInput = document.getElementById('traffic-rules');
    const includeSaved = document.getElementById('include-saved-traffic-rules');
    const toggleButton = document.getElementById('toggle-traffic-monitor');
    const clearButton = document.getElementById('clear-traffic-matches');
    const saveButton = document.getElementById('save-selected-traffic-rules');
    const saveStatus = document.getElementById('traffic-save-status');
    const status = document.getElementById('traffic-status');
    const matchList = document.getElementById('traffic-matches');
    const selectedRules = new Map();
    let activeRun;
    let reportVersion = 0;
    let saving = false;

    document.getElementById('traffic-monitor-sidebar-note').hidden = true;
    monitor.hidden = false;

    chrome.runtime.onMessage.addListener((message, sender) => {
        if (message?.type !== 'observatron-traffic-subscribe' || message.tabId !== inspectedTabId ||
            sender.url !== chrome.runtime.getURL('sidepanel/sidepanel.html') ||
            typeof message.channel !== 'string' || !message.channel.startsWith(trafficCountChannelPrefix) ||
            countPorts.has(message.channel)) return;

        const port = chrome.runtime.connect({name: message.channel});
        countPorts.set(port.name, port);
        port.onDisconnect.addListener(() => {
            void chrome.runtime.lastError;
            countPorts.delete(port.name);
        });
        sendMatchCount(port, matchList.childElementCount);
    });
    chrome.runtime.sendMessage({type: 'observatron-traffic-ready', tabId: inspectedTabId}).catch(() => {});

    toggleButton.addEventListener('click', async () => {
        toggleButton.disabled = true;
        rulesInput.readOnly = true;
        includeSaved.disabled = true;
        try {
            if (activeRun) {
                trafficNetwork.onRequestFinished.removeListener(scanFinishedRequest);
                activeRun = undefined;
            } else {
                const sessionRules = parseTrafficRules(rulesInput.value);
                const savedRules = includeSaved.checked ? await getSavedTrafficRules() : [];
                const rules = uniqueTrafficRules([...savedRules, ...sessionRules])
                    .map(rule => ({rule, pattern: compileTrafficPattern(rule)}));
                if (!rules.length) throw new Error('Enter a session rule or add saved rules in Options.');
                trafficNetwork.onRequestFinished.addListener(scanFinishedRequest);
                activeRun = {rules};
            }
            toggleButton.textContent = activeRun ? 'Stop Monitoring' : 'Start Monitoring';
            updateStatus();
        } catch (error) {
            status.textContent = error.message;
            rulesInput.focus();
        } finally {
            toggleButton.disabled = false;
            rulesInput.readOnly = Boolean(activeRun);
            includeSaved.disabled = Boolean(activeRun);
        }
    });

    clearButton.addEventListener('click', () => {
        reportVersion++;
        matchList.replaceChildren();
        selectedRules.clear();
        saveStatus.hidden = true;
        updateSaveButton();
        updateStatus();
        toggleButton.focus();
    });

    saveButton.addEventListener('click', async () => {
        const selection = [...selectedRules.entries()];
        const version = reportVersion;
        saving = true;
        updateSaveButton();
        saveStatus.hidden = false;
        saveStatus.textContent = 'Saving selected rules…';
        try {
            await changeSavedTrafficRules('add', uniqueTrafficRules(selection.map(([, rule]) => rule)));
            for (const [checkbox] of selection) {
                checkbox.checked = false;
                selectedRules.delete(checkbox);
            }
            if (version === reportVersion) saveStatus.textContent = 'Selected rules are saved in Options.';
        } catch {
            if (version === reportVersion) saveStatus.textContent = 'Could not save selected traffic rules.';
        } finally {
            saving = false;
            updateSaveButton();
        }
    });

    function updateSaveButton() {
        saveButton.disabled = saving || selectedRules.size === 0;
    }

    function scanFinishedRequest(entry) {
        const run = activeRun;
        if (!run) return;

        const url = new URL(entry.request.url);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

        const version = reportVersion;
        const resource = `${url.origin}${url.pathname}`;
        const traffic = {
            method: entry.request.method,
            resource,
            requestUrl: entry.request.url,
            time: new Date().toISOString(),
            statusCode: entry.response.status
        };
        const postData = entry.request.postData;
        const response = entry.response.content;
        addMatches(postData?.text, {...traffic, direction: 'Request', contentType: postData?.mimeType}, run.rules);

        const mime = response?.mimeType?.split(';')[0].trim().toLowerCase();
        if (response?.size === 0 || (mime && !/^text\/|[+/](json|xml|javascript|graphql|x-www-form-urlencoded)$/.test(mime))) return;

        entry.getContent((body, encoding) => {
            if (run !== activeRun || version !== reportVersion || encoding === 'base64') return;
            addMatches(body, {...traffic, direction: 'Response', contentType: response?.mimeType}, run.rules);
        });
    }

    function addMatches(body, traffic, rules) {
        if (typeof body !== 'string' || !body) return;

        let added = false;
        for (const {rule, pattern} of rules) {
            const match = pattern?.exec(body);
            const index = pattern ? (match?.index ?? -1) : body.indexOf(rule.text);
            if (index === -1) continue;

            const lines = body.slice(0, index).split(/\r\n|[\r\n]/);
            const location = `First match at line ${lines.length}, column ${lines.at(-1).length + 1}`;
            const start = Math.max(0, index - trafficExcerptContext);
            const matchedLength = match ? match[0].length : rule.text.length;
            const matchEnd = index + matchedLength;
            const highlightEnd = Math.min(matchEnd, index + trafficExcerptMatchLimit);
            const end = Math.min(body.length, matchEnd + trafficExcerptContext);
            const before = `${start ? '…' : ''}${body.slice(start, index)}`;
            const found = matchedLength === 0 ? '[empty match]' :
                `${body.slice(index, highlightEnd)}${highlightEnd < matchEnd ? '…' : ''}`;
            const after = `${body.slice(matchEnd, end)}${end < body.length ? '…' : ''}`;
            matchList.prepend(renderMatch(rule, traffic, location, {before, found, after}));
            added = true;
        }

        if (added) updateStatus();
    }

    function renderMatch(rule, {direction, method, resource, requestUrl, time, statusCode, contentType}, location, excerpt) {
        const {name} = rule;
        const item = document.createElement('li');
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.title = formatTrafficRule(rule);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) selectedRules.set(checkbox, rule);
            else selectedRules.delete(checkbox);
            updateSaveButton();
        });
        const destination = `${direction} · ${method} ${resource}`;
        label.append(checkbox, ` ${name} · ${destination} · ${time} `);

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.textContent = 'Add to Note Draft';
        addButton.addEventListener('click', () => appendToNoteDraft(
            `Traffic Monitor match for ${name}\n${destination}\n${location}\nObserved at ${time}`
        ));

        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'Match details';
        const request = document.createElement('p');
        request.textContent = `Request URL: ${requestUrl}`;
        const bodyInfo = document.createElement('p');
        bodyInfo.textContent = [
            `${direction} body`,
            statusCode > 0 ? `HTTP ${statusCode}` : '',
            contentType,
            location
        ].filter(Boolean).join(' · ');
        const snippet = document.createElement('pre');
        const highlight = document.createElement('mark');
        highlight.textContent = excerpt.found;
        snippet.append(excerpt.before, highlight, excerpt.after);
        details.append(summary, request, bodyInfo, snippet);

        item.append(label, addButton, details);
        return item;
    }

    function updateStatus() {
        const count = matchList.childElementCount;
        const countText = renderTrafficMatchCount(monitorHeading, count);
        clearButton.disabled = count === 0;
        const state = activeRun ? 'Monitoring this tab.' : 'Monitoring stopped.';
        status.textContent = `${state} ${countText}.`;
        for (const port of countPorts.values()) sendMatchCount(port, count);
    }

    function sendMatchCount(port, count) {
        try {
            port.postMessage(count);
        } catch {
            countPorts.delete(port.name);
        }
    }
} else {
    const sidebarHeading = document.getElementById('traffic-monitor-sidebar-title');
    let activeTabId;
    let countChannel;
    let countPort;
    let tabQuery = 0;

    chrome.runtime.onConnect.addListener(port => {
        if (port.name !== countChannel) return;
        countPort = port;
        port.onMessage.addListener(count => {
            if (port === countPort && Number.isSafeInteger(count) && count >= 0) {
                renderTrafficMatchCount(sidebarHeading, count);
            }
        });
        port.onDisconnect.addListener(() => {
            if (port !== countPort) return;
            countPort = undefined;
            renderTrafficMatchCount(sidebarHeading, 0);
        });
    });

    chrome.runtime.onMessage.addListener(message => {
        if (message?.type === 'observatron-traffic-ready' && message.tabId === activeTabId) subscribeToMatchCount();
    });
    chrome.tabs.onActivated.addListener(refreshActiveTab);
    refreshActiveTab();

    async function refreshActiveTab() {
        const query = ++tabQuery;
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        if (query !== tabQuery || tab?.id === activeTabId) return;

        countPort?.disconnect();
        countPort = undefined;
        activeTabId = tab?.id;
        countChannel = trafficCountChannelPrefix + crypto.randomUUID();
        renderTrafficMatchCount(sidebarHeading, 0);
        if (activeTabId !== undefined) subscribeToMatchCount();
    }

    function subscribeToMatchCount() {
        chrome.runtime.sendMessage({type: 'observatron-traffic-subscribe', tabId: activeTabId, channel: countChannel}).catch(() => {});
    }
}
