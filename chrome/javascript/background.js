// TODO: add observatron options amendment from a right click context menu
// TODO: when update options, refresh code in each current tab


var options = new Options();

changedOptions();

/*
    Event Routing Configuration
*/


// https://developer.chrome.com/extensions/storage
chrome.storage.onChanged.addListener(storageHasChanged);


// TODO: add and remove listeners based on options, not just soft toggle on variables

chrome.runtime.onMessage.addListener(requested);

// Enable Disable on click
chrome.browserAction.onClicked.addListener(function() {
  toggle_observatron_status();
});

chrome.webNavigation.onCompleted.addListener(configuredOnPageLoad);

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  configuredOnPageUpdated(tabId, changeInfo, tab);
});

// download any form submissions
// https://developer.chrome.com/extensions/webRequest#event-onBeforeRequest
chrome.webRequest.onBeforeRequest.addListener(
  downloadPostForm,
  {urls: ["<all_urls>"]},["requestBody"] //"blocking", 
);

var contextMenus = {};

contextMenus.takeScreenshotNow = 
  chrome.contextMenus.create(
    {"title": "Take Screenshot Now", "type": "normal", "onclick":downloadScreenshot});

contextMenus.takeScreenshotNow = 
  chrome.contextMenus.create(
    {"title": "Save as MHTML Now", "type": "normal", "onclick":contextMenuSaveAsMhtml});

   
contextMenus.line = 
    chrome.contextMenus.create(
      {"type": "separator"});    


contextMenus.toggleOnScroll = 
  chrome.contextMenus.create(
  {"title": "Screenshot on Scroll", "type": "checkbox", "checked" : options.onScrollEvent, "onclick":contextMenuScroll});

contextMenus.toggleOnResize = 
  chrome.contextMenus.create(
  {"title": "Screenshot on resize", "type": "checkbox", "checked" : options.onResizeEvent, "onclick":contextMenuResize});  

contextMenus.toggleOnPageLoad = 
  chrome.contextMenus.create(
  {"title": "Log on Page Load", "type": "checkbox", "checked" : options.onPageLoad, "onclick":contextMenuPageLoad});

contextMenus.toggleOnPageUpdated = 
  chrome.contextMenus.create(
  {"title": "Log on Page Updated", "type": "checkbox", "checked" : options.onPageUpdated, "onclick":contextMenuPageUpdated});

contextMenus.toggleDoubleClick = 
  chrome.contextMenus.create(
  {"title": "Screenshot on Double Click", "type": "checkbox", "checked" : options.onDoubleClickShot, "onclick":contextMenuDoubleClick});

contextMenus.togglePostSubmit = 
  chrome.contextMenus.create(
  {"title": "Log Post Submit", "type": "checkbox", "checked" : options.onPostSubmit, "onclick":contextMenuPostSubmit});

contextMenus.line2 = 
  chrome.contextMenus.create(
    {"type": "separator"});

contextMenus.showOptionsNow = 
    chrome.contextMenus.create(
      {"title": "Options", "type": "normal", "onclick":contextMenuShowOptions}); 


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

  if(menuName==="postsubmit"){
      options.onPostSubmit = !options.onPostSubmit;
  }
  if(menuName==="onscroll"){
    options.onScrollEvent = !options.onScrollEvent;
  }
  if(menuName==="onresize"){
    options.onResizeEvent = !options.onResizeEvent;
  }
  if(menuName==="pageload"){
    options.onPageLoad = !options.onPageLoad;
  }
  if(menuName==="pageupdated"){
    options.onPageUpdated = !options.onPageUpdated;
  }
  if(menuName==="ondoubleclick"){
    options.onDoubleClickShot = !options.onDoubleClickShot;
  }

  updateContextMenus();
  changedOptions();
}

function updateContextMenus(){
    chrome.contextMenus.update(contextMenus.togglePostSubmit, {"checked" : options.onPostSubmit});
    chrome.contextMenus.update(contextMenus.toggleOnScroll, {"checked" : options.onScrollEvent});
    chrome.contextMenus.update(contextMenus.toggleOnResize, {"checked" : options.onResizeEvent});
    chrome.contextMenus.update(contextMenus.toggleOnPageLoad, {"checked" : options.onPageLoad});
    chrome.contextMenus.update(contextMenus.toggleOnPageUpdated, {"checked" : options.onPageUpdated});
    chrome.contextMenus.update(contextMenus.toggleDoubleClick, {"checked" : options.onDoubleClickShot});
}

/*

    Storage

*/

function storageHasChanged(changes, namespace) {
  if(namespace === "local"){
    if(changes.hasOwnProperty("observatron")){
      options = changes["observatron"].newValue;
      if(changes["observatron"].newValue.enabled != changes["observatron"].oldValue.enabled){
        toggle_observatron_status();
      }
      updateContextMenus();
    }
  }
}

function changedOptions(){
  chrome.storage.local.set({observatron: options});
}



/*
      Message Handling
*/

// useful info
//https://stackoverflow.com/questions/13141072/how-to-get-notified-on-window-resize-in-chrome-browser
//https://github.com/NV/chrome-o-tile/blob/master/chrome/background.js
function requested(request){

  if(!isObservatronEngaged()){
    return false;
  }

  if (request.method === 'resize') {
    if(options.onResizeEvent){
      console.log("shot on resize");
      takeScreenshotIfWeCareAboutPage();
    }
  }

  if (request.method === 'screenshotdbl') {
    if(options.onDoubleClickShot){
      console.log("shot on doubleclick");
      takeScreenshotIfWeCareAboutPage();
    }
  }

  if (request.method === 'scrolled') {
    if(options.onScrollEvent === true){
      console.log("shot on scrolled");
      takeScreenshotIfWeCareAboutPage();
    }
  }

  return false;

}


function isObservatronEngaged(){
  return options.engaged;
}




function toggle_observatron_status(){

    if(isObservatronEngaged()){
      // switch it off
      console.log("Observatron Disengaged");
      options.engaged = false;

      changedOptions();

      chrome.browserAction.setIcon({path:"icons/red.png"});
      chrome.browserAction.setTitle({title:"Engage The Observatron"});

    }else{
      // switch it on
      console.log("Observatron Engaged");
      options.engaged=true;

      changedOptions();

      chrome.storage.local.set({observatron_screenshotter: 
                                  {resize_timeout: options.resize_timeout_milliseconds,
                                   scrolling_timeout: options.resize_timeout_milliseconds}
                                });

      chrome.tabs.query({ currentWindow: true, active: true }, simulatePageLoadForTab);

      // tabs.getCurrent provided an undefined tab  
      //chrome.tabs.getCurrent(simulatePageLoadForTab);

      
      chrome.browserAction.setIcon({path:"icons/green.png"});
      chrome.browserAction.setTitle({title:"Disengage The Observatron"});
    }
}

function simulatePageLoadForTab(tab){

  if(tab==undefined){
    return;
  }

  var fakeWindowFromTab = {};
  fakeWindowFromTab["frameId"] = 0;
  fakeWindowFromTab["tabId"] = tab[0].id;
  fakeWindowFromTab["url"] = tab[0].url;

  configuredOnPageLoad(fakeWindowFromTab);
}

function configuredOnPageLoad(anObject){

  if(!isObservatronEngaged()){
    return;
  }

  if(anObject === undefined){
    return;
  }

    console.log("page load code");
    //console.log(options);
    //console.log(anObject);

  if(options.onPageLoad){
  
    console.log("page load");
    
    if(!anObject.hasOwnProperty('frameId')){
      return;
    }

    if(anObject.frameId!=0){
      // todo: this should be configurable 0 is page root, others are 'parts' of page loaded dynamically and frames
      return;
    }    

    if(!anObject.hasOwnProperty('tabId')){
      return;
    }

    
    //console.log(anObject);

    downloadAsLog( "url", anObject, "url");
    saveAsMhtml(anObject.tabId);
    takeScreenshotIfWeCareAboutPage();

  }
}

function configuredOnPageUpdated(tabId, changeInfo, tab){

  if(!isObservatronEngaged()){
    return;
  }

  if(options.onPageUpdated){

    //console.log("page updated");

    if (changeInfo.status == 'complete') {

      downloadAsLog( "url", anObject, "url");
      saveAsMhtml(tabId);
      takeScreenshotIfWeCareAboutPage(); 

    }
  }
}




// using promises https://stackoverflow.com/questions/10413911/how-to-get-the-currently-opened-tabs-url-in-my-page-action-popup
function getCurrentTab(){
  return new Promise(function(resolve, reject){
    chrome.tabs.query(
      { currentWindow: true, active: true}
      , function(tabs) {
      resolve(tabs[0]);
    });
  });
}





/*

  DOWNLOADS

*/


function saveAsMhtml(anId){

  if(anId === undefined){   
      getCurrentTab().then(function(tab){
        chrome.pageCapture.saveAsMHTML({tabId: tab.id}, downloadMHTML);
      });
  }
  else{
      chrome.pageCapture.saveAsMHTML({tabId: anId}, downloadMHTML);
  }
}

function downloadMHTML(mhtmlData){

  var downloadFileName = getFileName(options.filepath, options.fileprefix, "mhtmldata", "mhtml");

    // convert blob to url found at https://bugzilla.mozilla.org/show_bug.cgi?format=default&id=1271345
    //console.log(mhtmlData);   

    var blobURL = window.URL.createObjectURL(mhtmlData);

    chrome.downloads.download(
          {
            url:blobURL, 
            filename: downloadFileName
          },function(downloadId){
        console.log(downloadFileName);
        console.log("download begin, the download is:" + downloadFileName);
    });

}

function downloadPostForm(details){
  if(!isObservatronEngaged()){
    return;
  }

  if(!options.onPostSubmit){
    return;
  }

  if(details.method == "POST"){
    console.log(JSON.stringify(details));

    logThis = {};
    logThis.url = details.url;
    logThis.method = details.method;
    if(details.requestBody){
      logThis.formData = details.requestBody.formData;
      downloadAsLog("form_post", logThis);
    }
  }
}

function downloadAsLog(fileNameAppend, objectToWrite, attribute){

  // https://developer.mozilla.org/en-US/docs/Web/API/Blob

  if(objectToWrite === undefined){
    return;
  }
  

  var outputObject = {};
  if(attribute!==undefined){
    if(!objectToWrite.hasOwnProperty(attribute)){
      return;
    }
    outputObject[attribute] = objectToWrite[attribute];
  }else{
    outputObject=objectToWrite;
  }

  var blob = new Blob([JSON.stringify(outputObject)], {type : 'application/json'});
  var blobURL = window.URL.createObjectURL(blob);

  var downloadFileName = getFileName(options.filepath, options.fileprefix, fileNameAppend, "json");

  chrome.downloads.download(
        {
          url:blobURL, 
          filename: downloadFileName
        },function(downloadId){
      console.log(downloadFileName);
      console.log("download begin, the download is:" + downloadFileName);
  });
  
}

var width, height;

function takeScreenshotIfWeCareAboutPage(){

      // Some pages do not screenshot well, 
      // e.g. apps and options so we do not care about those
      chrome.tabs.query({ currentWindow: true, active: true }, function(tabs){

        /* check if it is a tab we care about i.e. not apps or devtools */
        if(tabs[0]==undefined){
          return;
        }
        if(!tabs[0].hasOwnProperty("id")){
          return;
        }
        if(tabs[0].id==chrome.tabs.TAB_ID_NONE){
          return;
        }

        downloadScreenshot();
      });
}

function downloadScreenshot(){

    chrome.tabs.captureVisibleTab(function(screenshotUrl) {

        if(screenshotUrl==undefined){
          console.log("screenshotUrl is undefined");
            // https://stackoverflow.com/questions/28431505/unchecked-runtime-lasterror-when-using-chrome-api
            if(chrome.runtime.lastError) {
                    // Something went wrong
                    console.warn("An error occurred in capture visible tab " + chrome.runtime.lastError.message);
                    // Maybe explain that to the user too?
                  } else {
                    // No errors, you can use entry
                  }
          return;
        }


        //https://stackoverflow.com/questions/6718256/how-do-you-use-chrome-tabs-getcurrent-to-get-the-page-object-in-a-chrome-extensi
        // , active: true  not necessarily the active tab, just the current
        chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
          //console.log(tabs);
          width = tabs[0].width;
          height = tabs[0].height;
        });

        //console.log(screenshotUrl);

        var dimensions = "-" + width + "x" + height;

        var downloadFileName = getFileName(options.filepath, options.fileprefix, "screenshot"+dimensions, "jpg");


        chrome.downloads.download(
              {
                url: screenshotUrl, 
                filename: downloadFileName
              },function(downloadId){
                console.log("downloaded as " + downloadFileName);
        });

    });
}