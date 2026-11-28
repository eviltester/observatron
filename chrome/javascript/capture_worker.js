'use strict';

const captureSessions = new Map();
const captureDomains = {traffic: 'Network', 'network-errors': 'Network', console: 'Runtime'};
const childTargets = {autoAttach: true, waitForDebuggerOnStart: false, flatten: true,
    filter: [{type: 'iframe'}, {type: 'worker'}, {exclude: true}]};

function handleCaptureCommand(request, sender, sendResponse) {
    if (sender.url !== chrome.runtime.getURL('sidepanel/sidepanel.html')) return false;
    const {tabId, kind, action} = request;
    if (!Number.isInteger(tabId) || tabId < 0) return false;
    if (action === 'syncAutomatic') {
        syncAutomaticCapture(tabId).then(report => sendResponse({success: true, report}), error => sendResponse({error: error.message}));
        return true;
    }
    if (!Object.hasOwn(captureDomains, kind) || !['start', 'stop', 'clear'].includes(action)) return false;

    queueCaptureAction(tabId, async session => {
        const report = session.report[kind];
        if (action !== 'clear' && report.automatic) throw new Error('Configure automatic monitoring in Options.');
        if (action === 'start' && !report.running) await startCapture(session, request);
        if (action === 'stop' && report.running) await stopCapture(session, kind);
        if (action === 'clear') {
            if (kind === 'traffic' && session.traffic) session.traffic.revision++;
            report.items.length = 0;
            report.total = 0;
        }
    }).then(report => sendResponse({success: true, report}), error => sendResponse({error: error.message}));
    return true;
}

function queueCaptureAction(tabId, action) {
    let session = captureSessions.get(tabId);
    if (!session) {
        session = {tabId, queue: Promise.resolve(), write: Promise.resolve(), automatic: {}};
        captureSessions.set(tabId, session);
    }
    const result = session.queue.then(async () => {
        if (session.closed) throw new Error('The monitored tab is closed.');
        if (!session.report) {
            const key = captureReportKey(tabId);
            const saved = await chrome.storage.session.get(key);
            session.report = {...newCaptureReport(), ...saved[key]};
            for (const report of Object.values(session.report)) {
                report.running = false;
                report.automatic = false;
            }
        }
        await action(session);
        await writeCaptureReport(session);
        return session.report;
    });
    session.queue = result.catch(() => {});
    return result;
}

function syncAutomaticCapture(tabId) {
    return queueCaptureAction(tabId, async session => {
        const {observatron = {}} = await chrome.storage.local.get('observatron');
        for (const [kind, option] of Object.entries(automaticCaptureOptions)) {
            const report = session.report[kind];
            if (!observatron[option]) {
                if (report.automatic) await stopCapture(session, kind);
                report.automatic = false;
                if (kind === 'network-errors') report.output = 'report';
                delete session.automatic[kind];
                continue;
            }

            const rules = kind === 'traffic' ? await getSavedTrafficRules() : undefined;
            const configuration = rules ? JSON.stringify(rules) : true;
            if (kind === 'network-errors') report.output = observatron.networkErrorsOutput === 'notes' ? 'notes' : 'report';
            if (report.running && session.automatic[kind] === configuration) continue;
            report.automatic = true;
            session.automatic[kind] = configuration;

            if (report.running && kind !== 'traffic') continue;
            if (report.running) await stopCapture(session, kind);
            try {
                await startCapture(session, {kind, text: '', includeSaved: true, savedRules: rules});
            } catch (error) {
                report.error = rules?.length === 0 ? 'Add saved traffic rules in Options to start automatic monitoring.' : error.message;
            }
        }
    });
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const setting = changes.observatron;
    const toggled = setting && Object.values(automaticCaptureOptions).some(option =>
        Boolean(setting.oldValue?.[option]) !== Boolean(setting.newValue?.[option]));
    const outputChanged = setting && setting.oldValue?.networkErrorsOutput !== setting.newValue?.networkErrorsOutput;
    if (!toggled && !outputChanged && !changes[savedTrafficRulesKey]) return;
    for (const session of captureSessions.values()) {
        if (Object.keys(session.automatic).length) void syncAutomaticCapture(session.tabId).catch(() => {});
    }
});

async function startCapture(session, {kind, text, includeSaved, savedRules}) {
    let rules;
    if (kind === 'traffic') {
        const saved = savedRules ?? (includeSaved ? await getSavedTrafficRules() : []);
        rules = uniqueTrafficRules([...saved, ...parseTrafficRules(text)])
            .map(rule => ({rule, pattern: compileTrafficPattern(rule)}));
        if (!rules.length) throw new Error('Enter a session rule or add saved rules in Options.');
    }

    const isNewConnection = !session.targets;
    const targets = await connectCaptureDebugger(session);
    const root = targets.get('');
    const domain = captureDomains[kind];
    const enableDomain = !isCaptureDomainActive(session, domain);
    if (kind === 'traffic') session.traffic = {rules, requests: new Map(), revision: 0};
    else if (kind === 'network-errors') session.networkErrors = new Map();
    else session.consoleSince = Date.now();

    try {
        if (enableDomain) await chrome.debugger.sendCommand(root, `${domain}.enable`);
        if (session.targets !== targets || session.closed) throw new Error('Chrome ended the debugger session.');
        const report = session.report[kind];
        report.running = true;
        report.error = '';
        if (kind === 'traffic' && !report.automatic) Object.assign(report, {text, includeSaved});
        if (enableDomain) for (const target of targets.values()) {
            if (target.sessionId) await sendCaptureCommand(target, `${domain}.enable`);
        }
        if (isNewConnection) await sendCaptureCommand(root, 'Target.setAutoAttach', childTargets);
    } catch (error) {
        await stopCapture(session, kind);
        throw error;
    }
}

async function connectCaptureDebugger(session) {
    if (!session.targets) {
        const root = {tabId: session.tabId};
        const tab = await chrome.tabs.get(session.tabId);
        if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('Open an HTTP or HTTPS page to use this feature.');
        await chrome.debugger.attach(root, '1.3');
        session.targets = new Map([['', root]]);
    }
    return session.targets;
}

async function disconnectCaptureDebugger(session) {
    session.targets = undefined;
    await chrome.debugger.detach({tabId: session.tabId}).catch(() => {});
}

async function stopCapture(session, kind) {
    session.report[kind].running = false;
    session.report[kind].error = '';
    if (kind === 'traffic') session.traffic = undefined;
    else if (kind === 'network-errors') session.networkErrors = undefined;
    else session.consoleSince = undefined;
    if (!session.targets) return;

    const domain = captureDomains[kind];
    if (isCaptureDomainActive(session, domain)) return;
    if (isCaptureDomainActive(session, 'Network') || isCaptureDomainActive(session, 'Runtime')) {
        await Promise.all([...session.targets.values()].map(target => sendCaptureCommand(target, `${domain}.disable`)));
    } else {
        await disconnectCaptureDebugger(session);
    }
}

function isCaptureDomainActive(session, domain) {
    return domain === 'Network' ? Boolean(session.traffic || session.networkErrors) : session.consoleSince !== undefined;
}

function sendCaptureCommand(target, method, params) {
    return chrome.debugger.sendCommand(target, method, params).catch(() => undefined);
}

function writeCaptureReport(session) {
    clearTimeout(session.flushTimer);
    session.flushTimer = undefined;
    session.write = session.write.catch(() => {}).then(() => {
        if (!session.closed) return chrome.storage.session.set({[captureReportKey(session.tabId)]: session.report});
    });
    return session.write;
}

function addCaptureResults(session, kind, items) {
    if (!items.length || session.closed) return;
    const report = session.report[kind];
    report.total += items.length;
    report.items.unshift(...items.reverse().map(item => ({...item, id: crypto.randomUUID()})));
    report.items.length = Math.min(captureResultLimit, report.items.length);
    if (session.flushTimer === undefined) {
        session.flushTimer = setTimeout(() => {
            writeCaptureReport(session).catch(error => console.warn('Could not update monitor results:', error.message));
        }, 120);
    }
}

chrome.tabs.onRemoved.addListener(tabId => {
    const session = captureSessions.get(tabId);
    if (session) {
        captureSessions.delete(tabId);
        session.closed = true;
        clearTimeout(session.flushTimer);
    }
    Promise.allSettled([session?.queue, session?.write]).then(() =>
        chrome.storage.session.remove(captureReportKey(tabId))).catch(() => {});
});

chrome.debugger.onDetach.addListener(({tabId}, reason) => {
    const session = captureSessions.get(tabId);
    if (!session?.targets) return;
    session.targets = undefined;
    session.traffic = undefined;
    session.networkErrors = undefined;
    session.consoleSince = undefined;
    for (const report of Object.values(session.report)) {
        if (report.running) {
            report.running = false;
            report.error = reason === 'canceled_by_user' ? 'Monitoring cancelled in Chrome.' : 'Chrome ended the debugger session.';
        }
    }
    writeCaptureReport(session).catch(error => console.warn('Could not update monitor status:', error.message));
});

chrome.debugger.onEvent.addListener((source, method, params) => {
    const session = captureSessions.get(source.tabId);
    if (!session?.targets) return;
    if (method === 'Target.attachedToTarget') {
        const target = {tabId: source.tabId, sessionId: params.sessionId};
        session.targets.set(target.sessionId, target);
        if (isCaptureDomainActive(session, 'Network')) void sendCaptureCommand(target, 'Network.enable');
        if (session.consoleSince !== undefined) void sendCaptureCommand(target, 'Runtime.enable');
        void sendCaptureCommand(target, 'Target.setAutoAttach', childTargets);
    } else if (method === 'Target.detachedFromTarget') {
        session.targets.delete(params.sessionId);
        for (const requests of [session.traffic?.requests, session.networkErrors]) {
            for (const key of requests?.keys() || []) {
                if (key.startsWith(`${params.sessionId}:`)) requests.delete(key);
            }
        }
    } else if (method.startsWith('Network.')) {
        const key = `${source.sessionId || ''}:${params.requestId}`;
        if (session.traffic) handleNetworkCapture(session, source, method, params, key);
        if (session.networkErrors) handleNetworkError(session, method, params, key);
    } else if (session.consoleSince !== undefined && params?.timestamp >= session.consoleSince) {
        const item = consoleCaptureResult(method, params);
        if (item && !item.location.startsWith(chrome.runtime.getURL(''))) addCaptureResults(session, 'console', [item]);
    }
});

function handleNetworkCapture(session, source, method, params, key) {
    const run = session.traffic;
    const request = run.requests.get(key);
    if (method === 'Network.requestWillBeSent') {
        if (request && params.redirectResponse) {
            request.response = params.redirectResponse;
            void scanCapturedRequest(session, run, source, params.requestId, request, false);
        }
        run.requests.delete(key);
        const entry = params.request;
        if (!/^https?:\/\//i.test(entry.url)) return;
        run.requests.set(key, {url: entry.url, method: entry.method,
            contentType: captureContentType(entry.headers),
            postData: entry.postData === undefined && entry.hasPostData
                ? sendCaptureCommand(source, 'Network.getRequestPostData', {requestId: params.requestId})
                    .then(result => result?.postData)
                : entry.postData});
    } else if (request && method === 'Network.responseReceived') {
        request.response = params.response;
    } else if (request && (method === 'Network.loadingFinished' || method === 'Network.loadingFailed')) {
        run.requests.delete(key);
        const response = request.response;
        const mime = (response?.mimeType || '').split(';')[0].trim().toLowerCase();
        const hasTextBody = method === 'Network.loadingFinished' && response && response.status !== 204 &&
            (!mime || /^text\/|[+/](json|xml|javascript|graphql|x-www-form-urlencoded)$/.test(mime));
        void scanCapturedRequest(session, run, source, params.requestId, request, hasTextBody);
    }
}

function handleNetworkError(session, method, params, key) {
    const requests = session.networkErrors;
    if (method === 'Network.requestWillBeSent') {
        requests.delete(key);
        if (/^https?:\/\//i.test(params.request.url)) {
            requests.set(key, {method: params.request.method, requestUrl: params.request.url,
                pageUrl: params.documentURL, resourceType: params.type});
        }
        return;
    }

    const request = requests.get(key);
    if (!request) return;
    let problem;
    if (method === 'Network.responseReceived' && params.response.status >= 400 && params.response.status < 600) {
        const {status, statusText} = params.response;
        problem = `HTTP ${status}${statusText ? ` ${statusText}` : ''}`;
    } else if (method === 'Network.loadingFailed' && (!params.canceled || params.blockedReason || params.corsErrorStatus)) {
        problem = [params.errorText || 'Request failed', params.blockedReason, params.corsErrorStatus?.corsError]
            .filter(Boolean).join(' · ');
    }
    if (problem || method === 'Network.loadingFinished' || method === 'Network.loadingFailed') requests.delete(key);
    if (!problem) return;

    const item = {...request, resourceType: params.type || request.resourceType, problem, time: new Date().toISOString()};
    const report = session.report['network-errors'];
    if (report.output === 'notes') {
        void saveNoteFromMessage(`@AutoNote ${formatNetworkError(item)}`).catch(error => {
            report.error = `Could not save a Network Error AutoNote: ${error.message}`;
            addCaptureResults(session, 'network-errors', [item]);
        });
    } else {
        addCaptureResults(session, 'network-errors', [item]);
    }
}

function captureContentType(headers) {
    return Object.entries(headers || {}).find(([name]) => name.toLowerCase() === 'content-type')?.[1];
}

async function scanCapturedRequest(session, run, source, requestId, request, readResponse) {
    const revision = run.revision;
    const current = () => !session.closed && session.traffic === run && run.revision === revision;
    const url = new URL(request.url);
    const traffic = {method: request.method, resource: `${url.origin}${url.pathname}`, requestUrl: request.url,
        time: new Date().toISOString(), statusCode: request.response?.status};
    const body = readResponse ? sendCaptureCommand(source, 'Network.getResponseBody', {requestId}) : undefined;
    const postData = await request.postData;
    if (!current()) return;
    addCaptureResults(session, 'traffic', findTrafficMatches(postData,
        {...traffic, direction: 'Request', contentType: request.contentType}, run.rules));

    const response = await body;
    if (current() && response && !response.base64Encoded) {
        addCaptureResults(session, 'traffic', findTrafficMatches(response.body, {...traffic, direction: 'Response',
            contentType: captureContentType(request.response.headers) || request.response.mimeType}, run.rules));
    }
}

function findTrafficMatches(body, traffic, rules) {
    if (typeof body !== 'string' || !body) return [];
    const items = [];
    for (const {rule, pattern} of rules) {
        const match = pattern?.exec(body);
        const index = pattern ? (match?.index ?? -1) : body.indexOf(rule.text);
        if (index === -1) continue;

        const lines = body.slice(0, index).split(/\r\n|[\r\n]/);
        const location = `First match at line ${lines.length}, column ${lines.at(-1).length + 1}`;
        const start = Math.max(0, index - 80);
        const matchedLength = match ? match[0].length : rule.text.length;
        const matchEnd = index + matchedLength;
        const highlightEnd = Math.min(matchEnd, index + 120);
        const end = Math.min(body.length, matchEnd + 80);
        const before = `${start ? '…' : ''}${body.slice(start, index)}`;
        const found = matchedLength === 0 ? '[empty match]' :
            `${body.slice(index, highlightEnd)}${highlightEnd < matchEnd ? '…' : ''}`;
        const after = `${body.slice(matchEnd, end)}${end < body.length ? '…' : ''}`;
        items.push({rule, traffic, location, excerpt: {before, found, after}});
    }
    return items;
}

function consoleCaptureResult(method, params) {
    const exception = params.exceptionDetails;
    const isException = method === 'Runtime.exceptionThrown';
    if (!isException && method !== 'Runtime.consoleAPICalled') return;
    const frames = (isException ? exception.stackTrace : params.stackTrace)?.callFrames || [];
    const first = frames[0];
    const url = first?.url || exception?.url || '';
    const line = first?.lineNumber ?? exception?.lineNumber;
    const column = first?.columnNumber ?? exception?.columnNumber;
    const location = url && line !== undefined ? `${url}:${line + 1}:${column + 1}` : url;
    const message = isException
        ? `${exception.text} ${exception.exception?.description?.split('\n')[0] || ''}`.trim()
        : params.args.map(formatConsoleArgument).join(' ');
    const stack = frames.slice(0, 10).map(frame =>
        `${frame.functionName || '(anonymous)'} · ${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`).join('\n');
    return {level: isException ? 'JavaScript error' : `console.${params.type === 'warning' ? 'warn' : params.type}`,
        message: message.slice(0, 2000), location, stack: stack.slice(0, 2400), time: new Date(params.timestamp).toISOString()};
}

function formatConsoleArgument(value) {
    if (value.value !== undefined) return String(value.value);
    const description = value.unserializableValue ?? value.description ?? value.type;
    if (!value.preview?.properties.length) return description;
    const properties = value.preview.properties.slice(0, 5).map(property => `${property.name}: ${property.value ?? property.type}`);
    if (value.preview.overflow || value.preview.properties.length > properties.length) properties.push('…');
    return `${description} {${properties.join(', ')}}`;
}
