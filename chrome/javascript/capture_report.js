'use strict';

const captureResultLimit = 100;
const captureReportKey = tabId => `observatron-capture:${tabId}`;
const captureResultColors = ['#b91c1c', '#166534', '#1d4ed8', '#6d28d9', '#9a3412', '#0e7490'];
const automaticCaptureOptions = {
    traffic: 'autoTrafficMonitoring',
    'network-errors': 'autoNetworkErrors',
    console: 'autoConsoleLogging'
};

function newCaptureReport() {
    return {
        traffic: {running: false, total: 0, items: [], error: '', text: '', includeSaved: true},
        'network-errors': {running: false, total: 0, items: [], error: '', output: 'report'},
        console: {running: false, total: 0, items: [], error: ''}
    };
}

function formatNetworkError({problem, requestUrl, method, pageUrl, resourceType, time}) {
    return [
        `Network Error · ${problem}`,
        `${method} ${requestUrl}`,
        pageUrl && `Page: ${pageUrl}`,
        resourceType && `Resource type: ${resourceType}`,
        `Observed at ${time}`
    ].filter(Boolean).join('\n');
}
