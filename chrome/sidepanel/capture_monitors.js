'use strict';

{
    const traffic = setupMonitor('traffic', 'traffic-matches', 'clear-traffic-matches', 'match', 'matches', renderTrafficMatch);
    const networkErrors = setupMonitor('network-errors', 'network-errors-results', 'clear-network-errors-results',
        'error', 'errors', renderNetworkError);
    const consoleMonitor = setupMonitor('console', 'console-results', 'clear-console-results', 'entry', 'entries', renderConsoleEntry);
    const views = [traffic, networkErrors, consoleMonitor];
    const rulesInput = document.getElementById('traffic-rules');
    const includeSaved = document.getElementById('include-saved-traffic-rules');
    const saveButton = document.getElementById('save-selected-traffic-rules');
    const saveStatus = document.getElementById('traffic-save-status');
    const selected = new Map();
    const drafts = new Map();
    const inspectedTab = chrome.devtools?.inspectedWindow?.tabId;
    let tabId;
    let report = newCaptureReport();
    let loading = true;
    let tabQuery = 0;
    let reportUpdate = 0;
    let saving = false;
    let automaticOptions = {};
    let optionsLoaded = false;
    let optionsRevision = 0;

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.observatron) {
            ++optionsRevision;
            applyCaptureOptions(changes.observatron.newValue);
        }
        const update = area === 'session' && changes[captureReportKey(tabId)];
        if (update) {
            reportUpdate++;
            applyReport(update.newValue || newCaptureReport(), loading);
        }
    });
    if (inspectedTab === undefined) {
        chrome.tabs.onActivated.addListener(refreshCaptureTab);
        chrome.tabs.onRemoved.addListener(removed => drafts.delete(removed));
    }
    chrome.tabs.onUpdated.addListener((id, change) => {
        if (id === tabId && change.url !== undefined) void syncAutomatic();
    });
    chrome.storage.local.get('observatron').then(({observatron}) => {
        if (!optionsRevision) applyCaptureOptions(observatron);
    }).catch(() => {
        if (!optionsRevision) applyCaptureOptions();
    });
    void refreshCaptureTab();

    function applyCaptureOptions(options = {}) {
        const next = Object.fromEntries(Object.entries(automaticCaptureOptions).map(([kind, key]) =>
            [kind, Boolean(options[key])]));
        const changed = views.some(view => next[view.kind] !== automaticOptions[view.kind]);
        automaticOptions = next;
        optionsLoaded = true;
        updateViews();
        if (changed) void syncAutomatic();
    }

    async function syncAutomatic() {
        if (tabId === undefined || loading || !views.some(view => automaticOptions[view.kind])) return;
        const target = tabId;
        try {
            const response = await chrome.runtime.sendMessage({method: 'observatronCapture', tabId: target, action: 'syncAutomatic'});
            if (!response?.success) throw new Error(response?.error || 'Could not configure automatic monitoring.');
        } catch (error) {
            if (target !== tabId) return;
            for (const view of views) if (automaticOptions[view.kind]) view.error = error.message;
            updateViews();
        }
    }

    function setupMonitor(kind, listId, clearId, singular, plural, render) {
        const view = {kind, singular, plural, render, rows: new Map(),
            heading: document.querySelector(`#${kind}-monitor > h2`),
            list: document.getElementById(listId),
            toggle: document.getElementById(`toggle-${kind}-monitor`),
            clear: document.getElementById(clearId),
            status: document.getElementById(`${kind}-status`)};
        view.toggle.addEventListener('click', () => captureAction(view, report[kind].running ? 'stop' : 'start'));
        view.clear.addEventListener('click', () => captureAction(view, 'clear'));
        return view;
    }

    async function refreshCaptureTab() {
        const query = ++tabQuery;
        const id = inspectedTab ?? (await chrome.tabs.query({active: true, currentWindow: true}))[0]?.id;
        if (query !== tabQuery || (!loading && id === tabId)) return;
        if (tabId !== undefined) drafts.set(tabId, trafficSettings());
        tabId = id;
        loading = id !== undefined;
        report = newCaptureReport();
        for (const view of views) {
            view.operation = undefined;
            view.error = '';
        }
        saveStatus.hidden = true;
        updateViews();
        if (id === undefined) return;

        const update = reportUpdate;
        const key = captureReportKey(id);
        try {
            const saved = await chrome.storage.session.get(key);
            if (query === tabQuery && reportUpdate === update) applyReport(saved[key] || newCaptureReport(), true);
        } catch (error) {
            if (query !== tabQuery || reportUpdate !== update) return;
            for (const view of views) view.error = error.message;
            applyReport(newCaptureReport(), true);
        }
        if (query === tabQuery) void syncAutomatic();
    }

    function trafficSettings() {
        return {text: rulesInput.value, includeSaved: includeSaved.checked};
    }

    function applyReport(next, initialize) {
        next = {...newCaptureReport(), ...next};
        if (initialize || (next.traffic.running && !next.traffic.automatic && !report.traffic.running)) {
            const settings = next.traffic.running && !next.traffic.automatic ? next.traffic : drafts.get(tabId) || next.traffic;
            rulesInput.value = settings.text;
            includeSaved.checked = settings.includeSaved;
        }
        for (const view of views) {
            if (next[view.kind].running !== report[view.kind].running) view.error = '';
        }
        if (report.traffic.total && !next.traffic.total) saveStatus.hidden = true;
        report = next;
        loading = false;
        updateViews();
    }

    async function captureAction(view, action) {
        const {kind} = view;
        const operation = {action};
        const target = tabId;
        const update = reportUpdate;
        view.operation = operation;
        view.error = '';
        if (kind === 'traffic' && action === 'clear') saveStatus.hidden = true;
        updateViews();
        try {
            const next = await changeCapture({method: 'observatronCapture', tabId: target, kind, action,
                ...(kind === 'traffic' && action === 'start' ? trafficSettings() : {})});
            if (next && view.operation === operation && target === tabId && reportUpdate === update) applyReport(next, false);
        } catch (error) {
            if (view.operation === operation) view.error = error.message;
        } finally {
            if (view.operation === operation) {
                view.operation = undefined;
                updateViews();
            }
        }
    }

    async function changeCapture(request) {
        const {tabId: target, kind, action} = request;
        const key = captureReportKey(target);
        let connectionError;
        for (let attempt = 0; attempt < 2; attempt++) {
            const response = await chrome.runtime.sendMessage(request).catch(error => { connectionError = error; });
            if (response?.error) throw new Error(response.error);
            if (response?.success) return response.report;

            const saved = await chrome.storage.session.get(key);
            const next = saved[key];
            const state = next?.[kind];
            // The report can arrive even if the command reply went to a closed panel.
            if (state && (action === 'clear' ? state.total === 0 : state.running === (action === 'start'))) return next;
        }
        const task = action === 'clear' ? 'clearing the results' : `${action === 'start' ? 'starting' : 'stopping'} monitoring`;
        throw new Error(connectionError?.message || `Chrome did not confirm ${task}. Try again.`);
    }

    function updateViews() {
        for (const view of views) {
            const state = report[view.kind];
            const savesAutoNotes = view === networkErrors && state.running && state.output === 'notes';
            const count = `${state.total} ${savesAutoNotes ? 'reported ' : ''}${state.total === 1 ? view.singular : view.plural}`;
            view.heading.querySelector('.capture-count').textContent = count;
            view.heading.style.color = monitorTabs.setCount(`${view.kind}-monitor`, state.total, state.items[0]?.id);
            const automatic = automaticOptions[view.kind];
            view.toggle.textContent = automatic ? 'Monitoring On - configure via options'
                : state.running ? 'Stop Monitoring' : 'Start Monitoring';
            view.toggle.disabled = automatic || !optionsLoaded || loading || tabId === undefined || Boolean(view.operation);
            view.clear.disabled = state.total === 0 || Boolean(view.operation);
            const status = loading ? 'Loading this tab…' : view.error || state.error ||
                (state.running ? '' : view.operation?.action === 'start' ? 'Starting monitoring…' :
                    automatic ? 'Waiting to start monitoring.' : '');
            const limit = state.total > state.items.length ? `Showing latest ${state.items.length}.` : '';
            const output = savesAutoNotes ? 'New errors are saved as AutoNotes.' : '';
            view.status.textContent = [status, output, count, limit].filter(Boolean).join(' ');
            updateRows(view, state.items);
        }
        rulesInput.readOnly = loading || automaticOptions.traffic || report.traffic.running || Boolean(traffic.operation);
        includeSaved.disabled = rulesInput.readOnly;
        updateSaveButton();
    }

    function updateRows(view, items) {
        const ids = new Set(items.map(item => item.id));
        for (const [id, row] of view.rows) {
            if (!ids.has(id)) {
                view.rows.delete(id);
                row.remove();
                if (view === traffic) selected.delete(id);
            }
        }
        for (const item of [...items].reverse()) {
            if (!view.rows.has(item.id)) {
                const row = view.render(item);
                view.rows.set(item.id, row);
                view.list.prepend(row);
            }
        }
    }

    saveButton.addEventListener('click', async () => {
        const items = [...selected.entries()];
        const savingTab = tabId;
        saving = true;
        updateSaveButton();
        saveStatus.hidden = false;
        saveStatus.textContent = 'Saving selected rules…';
        try {
            await changeSavedTrafficRules('add', uniqueTrafficRules(items.map(([, rule]) => rule)));
            for (const [id] of items) {
                const checkbox = traffic.rows.get(id)?.querySelector('input');
                if (checkbox) checkbox.checked = false;
                selected.delete(id);
            }
            if (tabId === savingTab && !saveStatus.hidden) saveStatus.textContent = 'Selected rules are saved in Options.';
        } catch {
            if (tabId === savingTab && !saveStatus.hidden) saveStatus.textContent = 'Could not save selected traffic rules.';
        } finally {
            saving = false;
            updateSaveButton();
        }
    });

    function updateSaveButton() {
        saveButton.disabled = saving || selected.size === 0;
    }

    function noteButton(text) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Add to Note Draft';
        button.addEventListener('click', () => appendToNoteDraft(text));
        return button;
    }

    function renderTrafficMatch({id, rule, traffic: {direction, method, resource, requestUrl, time, statusCode, contentType}, location, excerpt}) {
        const item = document.createElement('li');
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.title = formatTrafficRule(rule);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) selected.set(id, rule);
            else selected.delete(id);
            updateSaveButton();
        });
        const destination = `${direction} · ${method} ${resource}`;
        label.append(checkbox, ` ${rule.name} · ${destination} · ${time} `);

        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'Match details';
        const request = document.createElement('p');
        request.textContent = `Request URL: ${requestUrl}`;
        const bodyInfo = document.createElement('p');
        bodyInfo.textContent = [
            `${direction} body`, statusCode > 0 ? `HTTP ${statusCode}` : '', contentType, location
        ].filter(Boolean).join(' · ');
        const snippet = document.createElement('pre');
        const highlight = document.createElement('mark');
        highlight.textContent = excerpt.found;
        snippet.append(excerpt.before, highlight, excerpt.after);
        details.append(summary, request, bodyInfo, snippet);

        item.append(label, noteButton(`Traffic Monitor match for ${rule.name}\n${destination}\n${location}\nObserved at ${time}`), details);
        return item;
    }

    function renderNetworkError(error) {
        const item = document.createElement('li');
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        const url = new URL(error.requestUrl);
        summary.textContent = `${error.problem} · ${error.method} ${url.origin}${url.pathname}`;
        const evidence = document.createElement('pre');
        const text = formatNetworkError(error);
        evidence.textContent = text;
        details.append(summary, evidence);
        item.append(details, noteButton(text));
        return item;
    }

    function renderConsoleEntry({level, message, location, stack, time}) {
        const item = document.createElement('li');
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        const preview = message.split('\n')[0].slice(0, 100);
        summary.textContent = `${level} · ${preview}${message.length > preview.length ? '…' : ''}`;
        const source = document.createElement('p');
        source.textContent = [location, time].filter(Boolean).join(' · ');
        const evidence = document.createElement('pre');
        evidence.textContent = [message, stack].filter(Boolean).join('\n\n');
        details.append(summary, source, evidence);
        item.append(details, noteButton([`Console Monitor · ${level}`, message, location, `Observed at ${time}`, stack]
            .filter(Boolean).join('\n')));
        return item;
    }
}
