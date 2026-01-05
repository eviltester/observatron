// https://developer.chrome.com/extensions/contextMenus

function ContextMenus(){

    contextMenus = {};
    contextTypes = ["all", "page", "browser_action"];

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
                contextMenus.showSidePanel = createMenu("showSidePanel", "Show Side Panel");

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
            case "showSidePanel":
                showSidePanel(tab.id, true);
                return;
        }

        // only if the menu contains options changing items
        //updateTheContextMenus();
        //changedOptions();
    }

    function contextMenuShowOptions(){
        chrome.tabs.create({url:"options/options_page.html"});
    }  


    function updateTheContextMenus(){
        // add any menu updates here if options shown in context menu

        // e.g.
        // try {
        //     chrome.contextMenus.update("togglePostSubmit", {"checked" : options.onPostSubmit});
        // } catch (e) { /* Menu might not exist */ }
    }

    this.updateContextMenus = function(){
        updateTheContextMenus();
    }

    // Register click handler
    chrome.contextMenus.onClicked.addListener(contextMenuClickHandler);
}
