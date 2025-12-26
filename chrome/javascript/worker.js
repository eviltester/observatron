// TODO: when update options, refresh code in each current tab
// https://stackoverflow.com/questions/10994324/chrome-extension-content-script-re-injection-after-upgrade-or-install/11598753#11598753

// Import other scripts
importScripts('observatron_options.js', 'context_menu.js', 'filenames.js');

console.log("Service worker started/reloaded");

var options = new Options();
var engagedDomain = null;
var sideBarSide= "left";

changedOptions();

/*
    Event Routing Configuration
*/


// https://developer.chrome.com/extensions/storage
chrome.storage.onChanged.addListener(storageHasChanged);


// TODO: add and remove listeners based on options, not just soft toggle on variables

chrome.runtime.onMessage.addListener(requested);


if (chrome && chrome.runtime && chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(() => {
    console.log("Service worker is being suspended/unloaded");
  });
}

// Enable Disable on click
chrome.action.onClicked.addListener((tab) => {
  toggle_observatron_status(tab);
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

// https://developer.chrome.com/extensions/commands
chrome.commands.onCommand.addListener(function(command) {
  commandHandler(command);
});

// context menu
var contextMenus = new ContextMenus();
contextMenus.init(downloadScreenshot, saveAsMhtml, options);

// Create context menus on install
chrome.runtime.onInstalled.addListener(() => {
  contextMenus.createMenus();
});

// Create context menus when service worker starts
chrome.runtime.onStartup.addListener(() => {
  contextMenus.createMenus();
});

// Also create menus immediately
contextMenus.createMenus();

/*

    Storage

*/

// TODO: this could be a message to set options on the backend
function storageHasChanged(changes, namespace) {
  if(namespace === "local"){
    if(changes.hasOwnProperty("observatron")){
      options = changes["observatron"].newValue;
      if(changes["observatron"].newValue.enabled != changes["observatron"].oldValue.enabled){
        toggle_observatron_status();
      }
      contextMenus.updateContextMenus();
    }
  }
}

function changedOptions(){
  chrome.storage.local.set({observatron: options});

  // Notify all content scripts of the engagement status change
  chrome.tabs.query({}, function(tabs) {
    tabs.forEach(function(tab) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          method: 'observatronStatusChanged',
          engaged: options.engaged,
          domain: engagedDomain
        }).catch(() => {
          // Ignore errors for tabs that don't have content scripts
        });
      }
    });
  });
}




/*
      Message Handling
*/

// useful info
//https://stackoverflow.com/questions/13141072/how-to-get-notified-on-window-resize-in-chrome-browser
function requested(request, sender, sendResponse){

  // Handle saveNote regardless of engagement status
  if (request.method === 'saveNote') {
    saveNoteFromMessage(request.noteText, request.withScreenshot);
    sendResponse({success: true});
    return true; // Keep the message channel open for async response
  }

  if (request.method === 'saveSelectedElementNote') {
    saveNoteFromMessage(request.noteText, request.withScreenshot);
    if (request.withElementScreenshot) {
      takeElementScreenshot(request.selector, request.rect, request.tabId);
    }
    sendResponse({success: true});
    return true;
  }

  // Handle status requests
  if (request.method === 'getStatus') {
    sendResponse({engaged: options.engaged, domain: engagedDomain});
    return true;
  }

    if (request.method === 'takeScreenshot') {
        takeScreenshot();
        return false;
    }

    if (request.method === 'savePage') {
        saveAsMhtml();
        return false;
    }

    // all methods above can be triggered manually
    // below, is automated and the observatron needs to be engaged
  if(!isObservatronEngaged()){
    return false;
  }

  if (request.method === 'logUserEvent') {
    console.log(request);
    console.log(sender);
    console.log(sendResponse);
    logEvent(request.event);
    sendResponse({success: true});
    return true;
  }

  if (request.method === 'resize') {
    if(options.onResizeEvent){
      console.log("shot on resize");
      takeScreenshotIfWeCareAboutPage();
      return false;
    }
  }

  if (request.method === 'screenshotdbl') {
    if(options.onDoubleClickShot){
      console.log("shot on doubleclick");
      takeScreenshotIfWeCareAboutPage();
      return false;
    }
  }

  if (request.method === 'scrolled') {
    if(options.onScrollEvent === true){
      console.log("shot on scrolled");
      takeScreenshotIfWeCareAboutPage();
      return false;
    }
  }

  return false;

}


function isObservatronEngaged(){
  return options.engaged;
}

function isTabOnEngagedDomain(tab) {
  if (!engagedDomain) return false;
  try {
    const tabDomain = new URL(tab.url).hostname;
    return tabDomain === engagedDomain;
  } catch (e) {
    return false;
  }
}




function toggle_observatron_status(tab){

    if(isObservatronEngaged()){
      // switch it off
      console.log("Observatron Disengaged");
      options.engaged = false;
      engagedDomain = null; // Clear the engaged domain

      changedOptions();

      chrome.action.setIcon({path: chrome.runtime.getURL("icons/red.png")});
      chrome.action.setTitle({title:"Engage The Observatron"});
      showSidePanel(tab.id,false);

    }else{
      // switch it on
      console.log("Observatron Engaged");
      options.engaged=true;

      // Record the current domain
      chrome.tabs.query({ currentWindow: true, active: true }, function(tabs) {
        if (tabs[0] && tabs[0].url) {
          try {
            engagedDomain = new URL(tabs[0].url).hostname;
            console.log("Observatron engaged on domain:", engagedDomain);
          } catch (e) {
            engagedDomain = null;
            console.log("Could not parse domain from URL:", tabs[0].url);
          }
        }
        simulatePageLoadForTab(tabs);
      });

      changedOptions();

      chrome.storage.local.set({observatron_screenshotter:
                                   {resize_timeout: options.resize_timeout_milliseconds,
                                    scrolling_timeout: options.resize_timeout_milliseconds}
                                 });

      // tabs.getCurrent provided an undefined tab  
      //chrome.tabs.getCurrent(simulatePageLoadForTab);

      
      chrome.action.setIcon({path: chrome.runtime.getURL("icons/green.png")});
      chrome.action.setTitle({title:"Disengage The Observatron"});
            // user must manually show side bar because we also have the devtools
      //showSidePanel(tab.id,true);
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

    // Check if the navigation is on the engaged domain
    chrome.tabs.get(anObject.tabId, function(tab) {
      if (tab && isTabOnEngagedDomain(tab)) {
        downloadAsLog( "url", anObject, "url");
        saveAsMhtml(anObject.tabId);
        takeScreenshotIfWeCareAboutPage();
      }
    });

  }
}

async function showSidePanel(tabId, shown){

    var useTabId = tabId;
    if(useTabId==undefined){
        const tab = await getCurrentTab();
        useTabId = tab.id;
    }

    chrome.sidePanel.setOptions({
      tabId: useTabId,
      path: 'sidepanel/sidepanel.html',
      enabled: shown
      }, ()=> {
            if(shown){
                chrome.sidePanel.open({ tabId: tabId });
            }
        }
    );
}

function configuredOnPageUpdated(tabId, changeInfo, tab){

  // https://developer.chrome.com/extensions/tabs#event-onUpdated
  if(!isObservatronEngaged()){
    showSidePanel(tabId, false);
    return;
  }

  // Check if tab is on the engaged domain
  if (!isTabOnEngagedDomain(tab)) {
    showSidePanel(tabId, false);
    return;
  }

  if(options.onPageUpdated){

    showSidePanel(tabId, true);

    if(changeInfo.hasOwnProperty("url")){
      downloadAsLog( "url", changeInfo, "url");
    }

    if (changeInfo.status == 'complete') {
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

function commandHandler(command){
  if(command === "log-a-note"){
    logANote();
  }else{
    console.log("unexpected command " + command);
  }
}

function logANote(){
  // Open note taking page
  chrome.tabs.create({url: chrome.runtime.getURL('note.html')});
}

function saveNoteFromMessage(noteText, withScreenshot) {
  var noteId = Math.floor(Date.now());

  // is it a special note?
  // ? question
  // ! bug
  // - todo
  // @type

  var noteToLog = getSpecialNoteTypeFromString(noteText);
  noteToLog.id = noteId.toString();

  // TODO store screenshot name in the note as a screenshot property
  downloadAsLog(noteToLog.type+"_"+noteToLog.id, noteToLog);
  if(withScreenshot){
    downloadScreenshot("_note_" + noteToLog.id);
  }
}

function logEvent(event) {
  var eventId = Math.floor(Date.now());

  console.log(event);
  downloadAsLog("userEvent"+"_"+eventId, event);
}

function getSpecialNoteTypeFromString(theString){
  var specialNote = "note";
  var noteText = theString;

  var firstChar = noteText.substring(0,1);

  switch(firstChar){
    case "?":
      specialNote = "question";
      noteText = noteText.substring(1);
      break;
    case "!":
      specialNote = "bug";
      noteText = noteText.substring(1);
      break;
    case "-":
      specialNote = "todo";
      noteText = noteText.substring(1);
      break;
    case "@":

      var words = noteText.split(" ");
      var specialConfig = words[0].substring(1);
      if(specialConfig.length>0){
        specialNote= specialConfig;
      }
      noteText = noteText.substring(words[0].length);
      // TODO filter custom words so that they are suitable as filename portions
  }

  noteText = noteText.trim();

  return {type: specialNote, text: noteText};
}


/*

  DOWNLOADS

*/


function saveAsMhtml(anId){

  if(anId === undefined){
      getCurrentTab().then(function(tab){
        // Check for lastError after saveAsMHTML call
        chrome.pageCapture.saveAsMHTML({tabId: tab.id}, function(mhtmlData) {
          if (chrome.runtime.lastError) {
            console.warn("MHTML generation failed:", chrome.runtime.lastError.message);
            return;
          }
          downloadMHTML(mhtmlData);
        });
      });
  }
  else{
      chrome.pageCapture.saveAsMHTML({tabId: anId}, function(mhtmlData) {
        if (chrome.runtime.lastError) {
          console.warn("MHTML generation failed:", chrome.runtime.lastError.message);
          return;
        }
        downloadMHTML(mhtmlData);
      });
  }
}

function downloadMHTML(mhtmlData){

  var downloadFileName = getFileName(options.filepath, options.fileprefix, "mhtmldata", "mhtml");

  // Check if mhtmlData is valid
  if (!mhtmlData || !(mhtmlData instanceof Blob)) {
    console.warn("MHTML capture failed or returned invalid data:", mhtmlData);
    return;
  }

  // Use data URL approach for service worker compatibility
  var reader = new FileReader();
  reader.onload = function() {
    var dataURL = reader.result;
    chrome.downloads.download(
          {
            url: dataURL,
            filename: downloadFileName
          },function(downloadId){
        console.log(downloadFileName);
        console.log("download begin, the download is:" + downloadFileName);
    });
  };
  reader.onerror = function() {
    console.warn("Failed to read MHTML blob");
  };
  reader.readAsDataURL(mhtmlData);

}

function downloadPostForm(details){
  if(!isObservatronEngaged()){
    return;
  }

  if(!options.onPostSubmit){
    return;
  }

  // Check if the request is from the engaged domain
  try {
    const requestDomain = new URL(details.url).hostname;
    if (requestDomain !== engagedDomain) {
      return;
    }
  } catch (e) {
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

  var jsonString = JSON.stringify(outputObject);
  var dataURL = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);

  var downloadFileName = getFileName(options.filepath, options.fileprefix, fileNameAppend, "json");

  chrome.downloads.download(
        {
          url: dataURL,
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

        // Check if tab is on the engaged domain
        if (!isTabOnEngagedDomain(tabs[0])) {
          return;
        }

        downloadScreenshot();
      });
}

function takeElementScreenshot(selector, rect, tabId) {
  console.log('Taking element screenshot for tabId:', tabId, 'selector:', selector);
  // Get the window ID for the tab
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      console.warn("Failed to get tab:", chrome.runtime.lastError && chrome.runtime.lastError.message);
      return;
    }
    const windowId = tab.windowId;
    console.log('Window ID:', windowId);
    // Scroll element into view and get updated rect
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: (selector) => {
        console.log('Evaluating XPath in page:', selector);
        const el = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        console.log('Found element in page:', el);
        if (el) {
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const rect = el.getBoundingClientRect();
          console.log('Rect after scroll:', rect);
          const visibleRect = {
            left: Math.max(0, rect.left),
            top: Math.max(0, rect.top),
            width: Math.min(window.innerWidth - Math.max(0, rect.left), rect.width),
            height: Math.min(window.innerHeight - Math.max(0, rect.top), rect.height)
          };
          console.log('Visible rect:', visibleRect);
          const scale = window.devicePixelRatio;
          console.log('Device pixel ratio:', scale);
          return {
            left: visibleRect.left * scale,
            top: visibleRect.top * scale,
            width: visibleRect.width * scale,
            height: visibleRect.height * scale
          };
        }
        return null;
      },
      args: [selector]
    }, (results) => {
      if (chrome.runtime.lastError || !results || !results[0]) {
        console.warn("Script execution failed:", chrome.runtime.lastError && chrome.runtime.lastError.message);
        return;
      }
      const result = results[0].result;
      if (!result) {
        console.warn("Element not found with selector:", selector);
        return;
      }
      const updatedRect = result;
      console.log('Updated rect:', updatedRect);
      // Wait for scroll, then take screenshot
      setTimeout(() => {
        console.log('Taking screenshot for windowId:', windowId);
        chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataURL) => {
          if (chrome.runtime.lastError) {
            console.warn("Failed to capture tab:", chrome.runtime.lastError.message);
            return;
          }
          console.log('Captured dataURL length:', dataURL ? dataURL.length : 'null');
          // Crop the image in the content script
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: (dataURL, rect) => {
              return new Promise((resolve) => {
                const width = Math.floor(rect.width);
                const height = Math.floor(rect.height);
                console.log('Cropping in page: rect=', rect, 'width=', width, 'height=', height);
                if (width <= 0 || height <= 0) {
                  console.log('Invalid rect, returning original');
                  resolve(dataURL); // Return original if invalid rect
                  return;
                }
                const img = new Image();
                img.onload = () => {
                  console.log('Image loaded for cropping, size:', img.width, 'x', img.height);
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = width;
                  canvas.height = height;
                  ctx.drawImage(img, rect.left, rect.top, rect.width, rect.height, 0, 0, width, height);
                  const cropped = canvas.toDataURL('image/png');
                  console.log('Cropped dataURL length:', cropped.length);
                  resolve(cropped);
                };
                img.onerror = () => {
                  console.log('Image load failed, returning original');
                  resolve(dataURL);
                };
                img.src = dataURL;
              });
            },
            args: [dataURL, updatedRect]
          }, (results) => {
            if (results && results[0] && results[0].result) {
              const croppedDataURL = results[0].result;
              console.log('Cropped dataURL start:', croppedDataURL ? croppedDataURL.substring(0, 50) : 'null');
              console.log('Cropped dataURL length:', croppedDataURL ? croppedDataURL.length : 'null');
              downloadElementScreenshot(croppedDataURL);
            } else {
              console.warn('Cropping failed');
            }
          });
        });
      }, 2000);
    });
  });
}



function downloadElementScreenshot(dataURL) {
  const downloadFileName = getFileName(options.filepath, options.fileprefix, "element_screenshot", "png");
  console.log('Download filename:', downloadFileName);
  chrome.downloads.download({
    url: dataURL,
    filename: downloadFileName
  }, function(downloadId) {
    if (chrome.runtime.lastError) {
      console.warn('Download failed:', chrome.runtime.lastError.message);
    } else {
      console.log("Downloaded element screenshot as " + downloadFileName + ", id:", downloadId);
    }
  });
}

function takeScreenshot(){
    downloadScreenshot();
}

function downloadScreenshot(additionalPrefix){

    chrome.tabs.captureVisibleTab(function(screenshotUrl) {

        if(screenshotUrl==undefined){
          console.log("screenshotUrl is undefined");
            // https://stackoverflow.com/questions/28431505/unchecked-runtime-lasterror-when-using-chrome-api
            if(chrome.runtime.lastError) {
                console.warn("An error occurred in capture visible tab " + chrome.runtime.lastError.message);
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

        // sometimes we don't get the width height, so if that happens don't write out the width height


        var dimensions = "";
        
        if(width !== undefined && height !== undefined){
          dimensions = "-" + width + "x" + height;
        }
        
        var relatedPrefix = "";  // is this screenshot related to something?
        if(additionalPrefix!==undefined){
            relatedPrefix = additionalPrefix;
        }

        var downloadFileName = getFileName(options.filepath, options.fileprefix, "screenshot"+dimensions+relatedPrefix, "jpg");


        chrome.downloads.download(
              {
                url: screenshotUrl, 
                filename: downloadFileName
              },function(downloadId){
                console.log("downloaded as " + downloadFileName);
        });

    });
}