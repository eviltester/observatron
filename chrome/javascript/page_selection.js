'use strict';

{
    let lastClick;
    let publishedClick;
    const ports = new Set();
    const panelUrl = chrome.runtime.getURL('sidepanel/sidepanel.html');
    const observer = new MutationObserver(publishClickAvailability);

    function clickAvailability() {
        return {
            time: lastClick?.time ?? null,
            available: Boolean(lastClick?.element.isConnected && lastClick.url === window.location.href)
        };
    }

    function publishClickAvailability() {
        const click = clickAvailability();
        if (click.time === publishedClick?.time && click.available === publishedClick.available) return;
        publishedClick = click;
        for (const port of ports) port.postMessage(click);
    }

    function watchClickedElement() {
        observer.disconnect();
        if (!ports.size || !lastClick) return;
        const options = {childList: true, subtree: true};
        observer.observe(document, options);
        for (let root = lastClick.element.getRootNode(); root.host; root = root.host.getRootNode()) {
            observer.observe(root, options);
        }
    }

    window.addEventListener('click', event => {
        if (!event.isTrusted) return;
        const element = event.composedPath().find(node => node.nodeType === 1);
        if (!element) return;
        lastClick = {element, url: window.location.href, time: performance.timeOrigin + event.timeStamp};
        if (ports.size) {
            watchClickedElement();
            publishClickAvailability();
        }
    }, true);

    chrome.runtime.onConnect.addListener(port => {
        if (port.name !== 'observatron-element-click' || port.sender?.url !== panelUrl) return;
        ports.add(port);
        if (ports.size === 1) {
            watchClickedElement();
            publishClickAvailability();
        } else {
            port.postMessage(clickAvailability());
        }
        port.onMessage.addListener(() => {
            watchClickedElement();
            publishClickAvailability();
        });
        port.onDisconnect.addListener(() => {
            ports.delete(port);
            if (!ports.size) {
                observer.disconnect();
                publishedClick = undefined;
            }
        });
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type !== 'observatronClickedElement' || sender.url !== panelUrl) return false;

        const pageMatches = window !== window.top || request.pageUrl === window.location.href;
        if (request.time === undefined) {
            sendResponse({time: pageMatches ? (lastClick?.time ?? null) : null});
        } else {
            const current = pageMatches && clickAvailability().available;
            sendResponse({element: current && lastClick.time === request.time
                ? describeSelectedElement(lastClick.element, request.pageUrl) : null});
        }
        return false;
    });
}
