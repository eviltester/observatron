function ContextMenus() {
    const contexts = ['all', 'action'];
    let observing = false;
    let creating = false;

    this.setObserving = engaged => {
        observing = engaged;
        // The items may not exist yet on first install. Creation uses the same state.
        chrome.contextMenus.update('startObserving', {enabled: !observing}, () => { void chrome.runtime.lastError; });
        chrome.contextMenus.update('stopObserving', {enabled: observing}, () => { void chrome.runtime.lastError; });
    };

    this.createMenus = () => {
        if (creating) return;
        creating = true;
        chrome.contextMenus.removeAll(() => {
            creating = false;
            if (chrome.runtime.lastError) {
                console.warn('Could not rebuild the Observatron menu:', chrome.runtime.lastError.message);
                return;
            }
            // Chrome allows six top-level entries on the toolbar icon.
            for (const item of [
                {id: 'showSidePanel', title: 'Show Side Panel'},
                {id: 'afterSidePanel', type: 'separator'},
                {id: 'tools', title: 'Tools'},
                {id: 'startObserving', title: 'Start Observing', enabled: !observing},
                {id: 'stopObserving', title: 'Stop Observing', enabled: observing},
                {id: 'showOptionsNow', title: 'Options'},
                {id: 'takeScreenshotNow', title: 'Take Screenshot Now', parentId: 'tools'},
                {id: 'saveAsMhtmlNow', title: 'Save as MHTML Now', parentId: 'tools'},
                {id: 'logNote', title: 'Take Note', parentId: 'tools'},
                {id: 'saveComments', title: 'Save Comments', parentId: 'tools'}
            ]) {
                chrome.contextMenus.create({...item, contexts}, () => {
                    if (chrome.runtime.lastError) console.warn('Could not create the Observatron menu item:', chrome.runtime.lastError.message);
                });
            }
        });
    };

    chrome.contextMenus.onClicked.addListener((info, tab) => {
        switch (info.menuItemId) {
            case 'showSidePanel':
                if (tab?.id === undefined) return;
                // Invoke open in the context-menu click to retain the user gesture.
                Promise.all([showSidePanel(tab.id), chrome.sidePanel.open({tabId: tab.id})]).then(() => {
                    void chrome.runtime.sendMessage({type: 'observatronFocusSidePanel', tabId: tab.id}).catch(() => {});
                }).catch(error => console.warn('Could not open the Observatron side panel:', error.message));
                return;
            case 'startObserving':
                void changeObservation('start', () => tab).catch(error => console.warn(error.message));
                return;
            case 'stopObserving':
                void changeObservation('stop').catch(error => console.warn(error.message));
                return;
            case 'takeScreenshotNow':
                downloadScreenshot();
                return;
            case 'saveAsMhtmlNow':
                saveAsMhtml();
                return;
            case 'logNote':
                logANote();
                return;
            case 'saveComments':
                saveComments();
                return;
            case 'showOptionsNow':
                chrome.tabs.create({url: 'options/options_page.html'});
        }
    });
}
