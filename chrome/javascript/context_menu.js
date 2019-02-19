// https://developer.chrome.com/extensions/contextMenus

function ContextMenus(){


    contextMenus = {};
    contextTypes = ["all", "page", "browser_action"];

    this.init = function(downloadScreenshotFunction, saveAsMhtmlFunction, options){
        this.saveAsMhtml = saveAsMhtmlFunction;
        this.options = options;
        this.downloadScreenshot = downloadScreenshotFunction;
    }

    function createSeparator(){
    // since there is a limit to the number of options in the browser top level item, do not include separators in that menu
    // console.log(chrome.contextMenus.ACTION_MENU_TOP_LEVEL_LIMIT);
    return chrome.contextMenus.create(
        {"type": "separator", "contexts": ["page"]}); 
    }

    function createMenu(title, onclickfunction){
        return chrome.contextMenus.create(
            {"title": title, "type": "normal", "contexts": contextTypes, "onclick":onclickfunction});
    }

    function createParentMenu(title){
        return chrome.contextMenus.create(
            {"title": title, "type": "normal", "contexts": contextTypes});
    }

    function createCheckboxMenu(title, currentStatus, onclickfunction, parent){
        var menuDetails = {"title": title, "type": "checkbox", "checked" : currentStatus, "contexts": contextTypes, "onclick": onclickfunction};
        if(parent !== undefined){
            menuDetails.parentId = parent;
        }
        return chrome.contextMenus.create(menuDetails);
    }

    this.createMenus = function(){

        contextMenus.takeScreenshotNow = createMenu("Take Screenshot Now", downloadScreenshot);
        contextMenus.saveAsMhtmlNow = createMenu("Save as MHTML Now", contextMenuSaveAsMhtml);   
        contextMenus.line = createSeparator();
        contextMenus.screenshots = createParentMenu("Screenshot");  
            contextMenus.toggleOnScroll = createCheckboxMenu("on Scroll", options.onScrollEvent, contextMenuScroll, contextMenus.screenshots);
            contextMenus.toggleOnResize = createCheckboxMenu("on resize", options.onResizeEvent, contextMenuResize, contextMenus.screenshots);
            contextMenus.toggleDoubleClick = createCheckboxMenu("Screenshot on Double Click", options.onDoubleClickShot, contextMenuDoubleClick, contextMenus.screenshots);
        contextMenus.log = createParentMenu("Log");  
            contextMenus.toggleOnPageLoad = createCheckboxMenu("on Page Load", options.onPageLoad, contextMenuPageLoad, contextMenus.log);
            contextMenus.togglePostSubmit = createCheckboxMenu("on Post Submit", options.onPostSubmit, contextMenuPostSubmit, contextMenus.log);
            contextMenus.toggleOnPageUpdated = createCheckboxMenu("on Page Updated", options.onPageUpdated, contextMenuPageUpdated, contextMenus.log);            
        contextMenus.line2 = createSeparator();
        contextMenus.showOptionsNow = createMenu("Options", contextMenuShowOptions);
    }


    function contextMenuSaveAsMhtml(){
    saveAsMhtml();
    }   

    function contextMenuShowOptions(){
    chrome.tabs.create({url:"options/options_page.html"});
    }  



    function contextMenuPostSubmit(){
    contextMenuHandler("postsubmit");
    }

    function contextMenuPageLoad(){
    contextMenuHandler("pageload");
    }

    function contextMenuPageUpdated(){
    contextMenuHandler("pageupdated");
    }

    function contextMenuScroll(){
    contextMenuHandler("onscroll");
    }

    function contextMenuResize(){
    contextMenuHandler("onresize");
    }

    function contextMenuDoubleClick(){
    contextMenuHandler("ondoubleclick");
    }

    function contextMenuHandler(menuName){

        switch(menuName){
            case "postsubmit":
            options.onPostSubmit = !options.onPostSubmit;
            break;
            case "onscroll":
            options.onScrollEvent = !options.onScrollEvent;
            break;
            case "onresize":
            options.onResizeEvent = !options.onResizeEvent;
            break;
            case "pageload":
            options.onPageLoad = !options.onPageLoad;
            break;
            case "pageupdated":
            options.onPageUpdated = !options.onPageUpdated;
            break;
            case "ondoubleclick":
            options.onDoubleClickShot = !options.onDoubleClickShot;
            break;
        }

        updateTheContextMenus();
        changedOptions();
    }

    function updateTheContextMenus(){
        chrome.contextMenus.update(contextMenus.togglePostSubmit, {"checked" : options.onPostSubmit});
        chrome.contextMenus.update(contextMenus.toggleOnScroll, {"checked" : options.onScrollEvent});
        chrome.contextMenus.update(contextMenus.toggleOnResize, {"checked" : options.onResizeEvent});
        chrome.contextMenus.update(contextMenus.toggleOnPageLoad, {"checked" : options.onPageLoad});
        chrome.contextMenus.update(contextMenus.toggleOnPageUpdated, {"checked" : options.onPageUpdated});
        chrome.contextMenus.update(contextMenus.toggleDoubleClick, {"checked" : options.onDoubleClickShot});
    }

    this.updateContextMenus = function(){
        updateTheContextMenus();
    }
}
