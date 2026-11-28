'use strict';

chrome.devtools.panels.create('Test Observatron', '../icons/red.png', '../sidepanel/sidepanel.html');

const inspectedTabId = chrome.devtools.inspectedWindow.tabId;
const panelUrl = chrome.runtime.getURL('sidepanel/sidepanel.html');
const trackedChannels = new Set();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.tabId !== inspectedTabId || sender.url !== panelUrl) return false;
    if (request.type === 'observatronTrackElementDevtools') {
        const channel = request.channel;
        if (typeof channel === 'string' && channel.startsWith('observatron-element-devtools:') &&
            !trackedChannels.has(channel)) {
            trackedChannels.add(channel);
            const port = chrome.runtime.connect({name: channel});
            port.onDisconnect.addListener(() => {
                void chrome.runtime.lastError;
                trackedChannels.delete(channel);
            });
        }
        return false;
    }
    if (request.type !== 'observatronReadSelectedElement') return false;

    readInspectedElement().then(
        element => sendResponse({element}),
        error => sendResponse({error: error.message})
    );
    return true;
});

chrome.runtime.sendMessage({type: 'observatronElementDevtoolsReady', tabId: inspectedTabId}).catch(() => {});
