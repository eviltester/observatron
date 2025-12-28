// TODO: when update options, refresh code in each current tab
// https://stackoverflow.com/questions/10994324/chrome-extension-content-script-re-injection-after-upgrade-or-install/11598753#11598753

// Import other scripts
importScripts('observatron_options.js', 'context_menu.js', 'filenames.js');

console.log("Service worker started/reloaded");

var options = new Options();
var engagedDomain = null;
var sideBarSide= "left";

// Load saved options on startup
chrome.storage.local.get(['observatron'], function(result) {
  if (result.observatron) {
    // Merge saved options with defaults
    options = Object.assign(new Options(), result.observatron);
  } else {
    options = new Options();
  }
  changedOptions();
});

/*
    Event Routing Configuration
*/


// https://developer.chrome.com/extensions/storage
chrome.storage.onChanged.addListener(storageHasChanged);


// TODO: add and remove listeners based on options, not just soft toggle on variables

chrome.runtime.onMessage.addListener(requestMethodHandler);


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
      console.log('Worker.js: Storage changed, sessionName:', changes["observatron"].newValue.sessionName);
      options = changes["observatron"].newValue;
      // Update context menus when options change
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
function requestMethodHandler(request, sender, sendResponse){

  // Handle update options request
  if (request.action === 'updateOptions') {
    options = Object.assign(new Options(), request.options);
    sendResponse({success: true});
    return true;
  }

  // Handle saveNote regardless of engagement status
  if (request.method === 'saveNote') {
    saveNoteFromMessage(request.noteText, request.withScreenshot, request.withElementScreenshot);
    if (request.withElementScreenshot) {
      // Refresh element data first
      chrome.runtime.sendMessage({type: 'updateElementData'});
      setTimeout(() => {
        // Get updated selected element data and take screenshot
        chrome.storage.local.get(['selectedElement', 'inspectedTabId'], function(result) {
          const element = result.selectedElement;
          const tabId = result.inspectedTabId;
          if (element && tabId) {
            takeElementScreenshot(element.selector, element.rect, tabId);
          }
        });
      }, 500);
    }
    sendResponse({success: true});
    return true; // Keep the message channel open for async response
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
                try{
                    chrome.sidePanel.open({ tabId: tabId });
                }catch(e){
                    console.log("showSidePanel: " + e);
                }
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
  chrome.tabs.create({url: chrome.runtime.getURL('sidepanel/sidepanel.html')});
}

function saveNoteFromMessage(noteText, withScreenshot, withElementScreenshot) {
  var noteId = Math.floor(Date.now());

  // is it a special note?
  // ? question
  // ! bug
  // - todo
  // @type

  var noteToLog = getSpecialNoteTypeFromString(noteText);
   noteToLog.id = noteId.toString();
   noteToLog.timestamp = new Date().toISOString();
   // Set default status: closed for notes and non-closable types, open for closable types
   var isClosable = ['question', 'todo', 'bug'].includes(noteToLog.type) || noteToLog.type.endsWith('[]');
   noteToLog.status = isClosable ? 'open' : 'closed';

  // Add screenshot filenames if requested
  noteToLog.screenshots = [];
  if (withScreenshot) {
    var screenshotFilename = getFileName(options.filepath, options.fileprefix, "screenshot_note_" + noteToLog.id, "jpg", options.sessionName, options.folderStructure);
    noteToLog.screenshots.push(screenshotFilename);
  }
  if (withElementScreenshot) {
    var elementScreenshotFilename = getFileName(options.filepath, options.fileprefix, "element_screenshot", "png", options.sessionName, options.folderStructure);
    noteToLog.screenshots.push(elementScreenshotFilename);
  }

  // Store note in local storage
  chrome.storage.local.get(['observatron_notes'], function(result) {
    var notes = result.observatron_notes || [];
    notes.push(noteToLog);
    chrome.storage.local.set({observatron_notes: notes});
  });

  // TODO store screenshot name in the note as a screenshot property
  downloadAsLog(noteToLog.type+"_"+noteToLog.id, noteToLog);
  if(withScreenshot){
    downloadScreenshot("_note_" + noteToLog.id);
  }
  if (withElementScreenshot) {
    // Element screenshot handling is done in the message handler
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
        // Check if it ends with [] for closable custom types
        var isClosable = specialConfig.endsWith('[]');
        if(isClosable){
          specialConfig = specialConfig.slice(0, -2); // Remove []
        }
        // Truncate custom type names to 15 characters maximum
        specialConfig = specialConfig.substring(0, 15);

        // Check if it's actually a standard type name
        var standardTypes = ['note', 'question', 'todo', 'bug'];
        if(standardTypes.includes(specialConfig)){
          specialNote = specialConfig; // Treat as standard type
        } else {
          // It's a custom type
          specialNote = specialConfig;
          if(isClosable){
            specialNote += '[]'; // Add [] back for custom closable types
          }
        }
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

  var downloadFileName = getFileName(options.filepath, options.fileprefix, "mhtmldata", "mhtml", options.sessionName, options.folderStructure);

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

  var downloadFileName = getFileName(options.filepath, options.fileprefix, fileNameAppend, "json", options.sessionName, options.folderStructure);

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

function sanitizeRect(rect) {
  return {
    left: isFinite(rect.left) ? Math.max(0, Math.min(rect.left, 10000)) : 0,
    top: isFinite(rect.top) ? Math.max(0, Math.min(rect.top, 10000)) : 0,
    width: isFinite(rect.width) ? Math.max(1, Math.min(rect.width, 10000)) : 1,
    height: isFinite(rect.height) ? Math.max(1, Math.min(rect.height, 10000)) : 1
  };
}

function getUpdatedRect(selector, tabId, callback) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    function: (selector) => {
      const el = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (el) {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = el.getBoundingClientRect();
        if (!isFinite(rect.left) || !isFinite(rect.top) || !isFinite(rect.width) || !isFinite(rect.height)) {
          return null;
        }
        const visibleRect = {
          left: Math.max(0, rect.left),
          top: Math.max(0, rect.top),
          width: Math.min(window.innerWidth - Math.max(0, rect.left), rect.width),
          height: Math.min(window.innerHeight - Math.max(0, rect.top), rect.height)
        };
        const scale = window.devicePixelRatio;
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
      callback(null);
      return;
    }
    const result = results[0].result;
    if (!result || typeof result !== 'object' ||
        typeof result.left !== 'number' || !isFinite(result.left) ||
        typeof result.top !== 'number' || !isFinite(result.top) ||
        typeof result.width !== 'number' || !isFinite(result.width) ||
        typeof result.height !== 'number' || !isFinite(result.height)) {
      callback(null);
      return;
    }
    callback(sanitizeRect(result));
  });
}

function cropElementScreenshot(dataURL, rect, tabId, callback) {
  chrome.storage.local.set({tempDataURL: dataURL}, () => {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: (left, top, width, height) => {
        return new Promise((resolve) => {
          chrome.storage.local.get(['tempDataURL'], (result) => {
            const dataURL = result.tempDataURL;
            chrome.storage.local.remove('tempDataURL');
            const w = Math.floor(width);
            const h = Math.floor(height);
            if (w <= 0 || h <= 0) {
              resolve(dataURL);
              return;
            }
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(img, left, top, width, height, 0, 0, w, h);
              resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => {
              resolve(dataURL);
            };
            img.src = dataURL;
          });
        });
      },
      args: [rect.left, rect.top, rect.width, rect.height]
    }, (results) => {
      callback(results && results[0] && results[0].result ? results[0].result : null);
    });
  });
}

function takeElementScreenshot(selector, rect, tabId) {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      console.warn("Failed to get tab");
      return;
    }
    const windowId = tab.windowId;
    getUpdatedRect(selector, tabId, (updatedRect) => {
      if (!updatedRect) {
        return;
      }
      setTimeout(() => {
        chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataURL) => {
          if (chrome.runtime.lastError) {
            return;
          }
          cropElementScreenshot(dataURL, updatedRect, tabId, (croppedDataURL) => {
            if (croppedDataURL) {
              downloadElementScreenshot(croppedDataURL);
            }
          });
        });
      }, 500);
    });
  });
}



function downloadElementScreenshot(dataURL) {
  const downloadFileName = getFileName(options.filepath, options.fileprefix, "element_screenshot", "png", options.sessionName, options.folderStructure);
  chrome.downloads.download({
    url: dataURL,
    filename: downloadFileName
  }, function(downloadId) {
    if (chrome.runtime.lastError) {
      console.warn('Download failed');
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

        var downloadFileName = getFileName(options.filepath, options.fileprefix, "screenshot"+dimensions+relatedPrefix, "jpg", options.sessionName, options.folderStructure);


        chrome.downloads.download(
              {
                url: screenshotUrl, 
                filename: downloadFileName
              },function(downloadId){
                console.log("downloaded as " + downloadFileName);
        });

    });
}