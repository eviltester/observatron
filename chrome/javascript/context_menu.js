// https://developer.chrome.com/extensions/contextMenus

function ContextMenus(){

    contextMenus = {};
    contextTypes = ["all", "page", "browser_action"];

    // BUG - don't seem to be passing in functions seems to use globals from background.js, which works, but was not as intended
    this.init = function(downloadScreenshotFunction, saveAsMhtmlFunction, options){
        this.saveAsMhtml = saveAsMhtmlFunction;
        this.options = options;
        this.downloadScreenshot = downloadScreenshotFunction;
    }

    function createSeparator(id){
        return chrome.contextMenus.create(
            {"id": id, "type": "separator", "contexts": ["page"]});
    }

    function createMenu(id, title){
        return chrome.contextMenus.create(
            {"id": id, "title": title, "type": "normal", "contexts": contextTypes});
    }

    function createParentMenu(id, title){
        return chrome.contextMenus.create(
            {"id": id, "title": title, "type": "normal", "contexts": contextTypes});
    }

    function createCheckboxMenu(id, title, currentStatus, parent){
        var menuDetails = {"id": id, "title": title, "type": "checkbox", "checked" : currentStatus, "contexts": contextTypes};
        if(parent !== undefined){
            menuDetails.parentId = parent;
        }
        return chrome.contextMenus.create(menuDetails);
    }

    this.createMenus = function(){
        // Remove all existing menus to prevent duplicates
        chrome.contextMenus.removeAll(function() {
            // Create menus after removal is complete
            try {
                contextMenus.takeScreenshotNow = createMenu("takeScreenshotNow", "Take Screenshot Now");
                contextMenus.saveAsMhtmlNow = createMenu("saveAsMhtmlNow", "Save as MHTML Now");
                contextMenus.logNote = createMenu("logNote", "Take Note");
                contextMenus.line = createSeparator("separator1");
                contextMenus.screenshots = createParentMenu("screenshots", "Screenshot");
                    contextMenus.toggleOnScroll = createCheckboxMenu("toggleOnScroll", "on Scroll", options.onScrollEvent, contextMenus.screenshots);
                    contextMenus.toggleOnResize = createCheckboxMenu("toggleOnResize", "on resize", options.onResizeEvent, contextMenus.screenshots);
                    contextMenus.toggleDoubleClick = createCheckboxMenu("toggleDoubleClick", "Screenshot on Double Click", options.onDoubleClickShot, contextMenus.screenshots);
                contextMenus.log = createParentMenu("log", "Log");
                    contextMenus.toggleOnPageLoad = createCheckboxMenu("toggleOnPageLoad", "on Page Load", options.onPageLoad, contextMenus.log);
                    contextMenus.toggleOnPageUpdated = createCheckboxMenu("toggleOnPageUpdated", "on Page Updated", options.onPageUpdated, contextMenus.log);
                    contextMenus.togglePostSubmit = createCheckboxMenu("togglePostSubmit", "POST form contents to a file", options.onPostSubmit, contextMenus.log);
                //contextMenus.note = createParentMenu("Note");

                contextMenus.line2 = createSeparator("separator2");
                contextMenus.showOptionsNow = createMenu("showOptionsNow", "Options");

                console.log("Context menus created successfully");

                // Register click handler after menus are created
                chrome.contextMenus.onClicked.addListener(contextMenuClickHandler);
            } catch (error) {
                console.error("Failed to create context menus:", error);
            }
        });
    }

    function contextMenuClickHandler(info, tab){

        switch(info.menuItemId){
            case "takeScreenshotNow":
                downloadScreenshot();
                return;
            case "saveAsMhtmlNow":
                saveAsMhtml();
                return;
            case "showOptionsNow":
                contextMenuShowOptions();
                return;
            case "logNote":
                logANote();
                return;
            case "togglePostSubmit":
                options.onPostSubmit = !options.onPostSubmit;
                break;
            case "toggleOnScroll":
                options.onScrollEvent = !options.onScrollEvent;
                break;
            case "toggleOnResize":
                options.onResizeEvent = !options.onResizeEvent;
                break;
            case "toggleOnPageLoad":
                options.onPageLoad = !options.onPageLoad;
                break;
            case "toggleOnPageUpdated":
                options.onPageUpdated = !options.onPageUpdated;
                break;
            case "toggleDoubleClick":
                options.onDoubleClickShot = !options.onDoubleClickShot;
                break;
        }

        updateTheContextMenus();
        changedOptions();
    }

    function contextMenuShowOptions(){
        chrome.tabs.create({url:"options/options_page.html"});
    }  


    function updateTheContextMenus(){
        try {
            chrome.contextMenus.update("togglePostSubmit", {"checked" : options.onPostSubmit});
        } catch (e) { /* Menu might not exist */ }
        try {
            chrome.contextMenus.update("toggleOnScroll", {"checked" : options.onScrollEvent});
        } catch (e) { /* Menu might not exist */ }
        try {
            chrome.contextMenus.update("toggleOnResize", {"checked" : options.onResizeEvent});
        } catch (e) { /* Menu might not exist */ }
        try {
            chrome.contextMenus.update("toggleOnPageLoad", {"checked" : options.onPageLoad});
        } catch (e) { /* Menu might not exist */ }
        try {
            chrome.contextMenus.update("toggleOnPageUpdated", {"checked" : options.onPageUpdated});
        } catch (e) { /* Menu might not exist */ }
        try {
            chrome.contextMenus.update("toggleDoubleClick", {"checked" : options.onDoubleClickShot});
        } catch (e) { /* Menu might not exist */ }
    }

    this.updateContextMenus = function(){
        updateTheContextMenus();
    }

    // Register click handler
    chrome.contextMenus.onClicked.addListener(contextMenuClickHandler);
}
