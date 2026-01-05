// TODO: when update options, refresh code in each current tab
// https://stackoverflow.com/questions/10994324/chrome-extension-content-script-re-injection-after-upgrade-or-install/11598753#11598753

  // Import other scripts
 importScripts('observatron_options.js', 'context_menu.js', 'filenames.js', 'shared.js');

 // Import testable utility functions
 importScripts('note_parser.js', 'geometry_utils.js', 'worker_screenshot_utils.js');

console.log("Service worker started/reloaded");

var options = new Options();
var engagedDomain = null;
var sideBarSide= "left";
var sidepanelShown = false;

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
   STORAGE
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
   manageSidepanelOnTabUpdate(tabId, changeInfo, tab);
});

chrome.tabs.onCreated.addListener(function(tab) {
   manageSidepanelOnTabCreate(tab);
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
   manageSidepanelOnTabActivate(activeInfo.tabId);
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
contextMenus.init(downloadScreenshot, saveAsMhtml, saveComments, options);

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
          domain: engagedDomain,
          onPageMutation: options.onPageMutation,
          onInputChanges: options.onInputChanges,
          onClickEvents: options.onClickEvents
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
         chrome.storage.local.get(['selectedElement'], function(result) {
           const element = result.selectedElement;
           // Use the tab ID from the request (sent by sidepanel)
           const tabId = request.tabId;
           if (element && tabId) {
             takeElementScreenshot(element.selector, element.rect, tabId);
           } else if (!tabId) {
             console.warn("No tab ID available for element screenshot");
           }
         });
       }, 500);
     }
     sendResponse({success: true});
     return true; // Keep the message channel open for async response
   }

   // Handle brokenLinksFound regardless of engagement status
   if (request.method === 'brokenLinksFound') {
     handleBrokenLinks(request.links);
     return false;
   }

   // Handle brokenImagesFound regardless of engagement status
   if (request.method === 'brokenImagesFound') {
     handleBrokenAssets(request.images, 'Image');
     return false;
   }



  // Handle status requests
  if (request.method === 'getStatus') {
    sendResponse({engaged: options.engaged, domain: engagedDomain, onClickEvents: options.onClickEvents, onInputChanges: options.onInputChanges, onPageMutation: options.onPageMutation});
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

    if (request.method === 'takeElementScreenshot') {
        // Refresh element data first
        chrome.runtime.sendMessage({type: 'updateElementData'});
        setTimeout(() => {
            // Get updated selected element data and take screenshot
            chrome.storage.local.get(['selectedElement'], function(result) {
                const element = result.selectedElement;
                const tabId = request.tabId;
                if (element && tabId) {
                    takeElementScreenshot(element.selector, element.rect, tabId);
                } else if (!tabId) {
                    console.warn("No tab ID available for element screenshot");
                } else if (!element) {
                    console.warn("No element selected for screenshot");
                }
            });
        }, 500);
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

    if (request.method === 'htmlCommentsFound') {
      handleHtmlComments(request.comments, request.url);
      return true;
    }



   return false;

}


function isObservatronEngaged(){
  return options.engaged;
}

function isTabOnEngagedDomain(taburl) {
  if (!engagedDomain) return false;
  try {
    const tabDomain = new URL(taburl).hostname;
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

       // Clear HTML comment hashes
       chrome.storage.session.set({htmlCommentHashes: []});
       // Clear broken link queue and hashes
       console.log('Observatron: Clearing broken link queue and hashes on disengage');
       chrome.storage.session.set({brokenLinkQueue: [], brokenLinkHashes: []});
       // Clear broken image queue and hashes
       console.log('Observatron: Clearing broken image queue and hashes on disengage');
       chrome.storage.session.set({brokenImageQueue: [], brokenImageHashes: []});

      changedOptions();

      chrome.action.setIcon({path: chrome.runtime.getURL("icons/red.png")});
      chrome.action.setTitle({title:"Engage The Observatron"});
      showSidePanel(tab.id,false);

    }else{
      // switch it on
      console.log("Observatron Engaged");
      options.engaged=true;

       // Clear HTML comment hashes for new session
       chrome.storage.session.set({htmlCommentHashes: []});
       // Clear broken link queue and hashes for new session
       console.log('Observatron: Clearing broken link queue and hashes for new session');
       chrome.storage.session.set({brokenLinkQueue: [], brokenLinkHashes: []});
       // Clear broken image queue and hashes for new session
       console.log('Observatron: Clearing broken image queue and hashes for new session');
       chrome.storage.session.set({brokenImageQueue: [], brokenImageHashes: []});

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
       showSidePanel(tab.id,true);
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

  if(options.onPageLoad || options.onPageLoadDetectHtmlComments || options.onPageLoadLogHtmlCommentsAsNotes){

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
       if (tab && isTabOnEngagedDomain(tab.url)) {
         if(options.onPageLoad){
           console.log("page load");
           downloadAsLog( "url", anObject, "url");
           saveAsMhtml(anObject.tabId);
           takeScreenshotIfWeCareAboutPage();
         }

          if (options.onPageLoadDetectHtmlComments || options.onPageLoadLogHtmlCommentsAsNotes) {
            chrome.storage.session.get(['htmlCommentHashes'], function(result) {
              const seenHashes = result.htmlCommentHashes || [];
              chrome.tabs.sendMessage(anObject.tabId, {
                method: 'scanHtmlComments',
                detectEnabled: options.onPageLoadDetectHtmlComments,
                seenHashes: seenHashes
              });
            });
          }

          if (options.reportBrokenLinks) {
            chrome.storage.session.get(['brokenLinkHashes'], function(result) {
              const checkedHashes = result.brokenLinkHashes || [];
              chrome.tabs.sendMessage(anObject.tabId, {
                method: 'scanBrokenLinks',
                checkedHashes: checkedHashes
              });
            });
          }

          if (options.reportBrokenImages) {
            chrome.storage.session.get(['brokenImageHashes'], function(result) {
              const checkedHashes = result.brokenImageHashes || [];
              chrome.tabs.sendMessage(anObject.tabId, {
                method: 'scanBrokenImages',
                checkedHashes: checkedHashes
              });
            });
          }
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
      }
    );

    sidepanelShown = shown;
}

function configuredOnPageUpdated(tabId, changeInfo, tab){

   // https://developer.chrome.com/extensions/tabs#event-onUpdated
   if(!isObservatronEngaged()){
     showSidePanel(tabId, false);
     return;
   }

   // Check if tab is on the engaged domain
   if (!isTabOnEngagedDomain(tab.url)) {
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

function manageSidepanelOnTabUpdate(tabId, changeInfo, tab) {
   if (!isObservatronEngaged()) {
     return;
   }

   if (sidepanelShown) {
     if (isTabOnEngagedDomain(tab.url)) {
       showSidePanel(tabId, true);
     } else {
       showSidePanel(tabId, false);
     }
   }
}

function manageSidepanelOnTabCreate(tab) {
   if (!isObservatronEngaged()) {
     return;
   }

   if (sidepanelShown) {
     if (isTabOnEngagedDomain(tab.url)) {
       showSidePanel(tab.id, true);
     }
   }
}

function manageSidepanelOnTabActivate(tabId) {
   if (!isObservatronEngaged() || !sidepanelShown) {
     return;
   }

   chrome.tabs.get(tabId, function(tab) {
     if (chrome.runtime.lastError) {
       console.warn('Error getting tab:', chrome.runtime.lastError);
       return;
     }
     if (isTabOnEngagedDomain(tab.url)) {
       showSidePanel(tabId, true);
     }
   });
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

function simpleHash(str) {
   let hash = 5381;
   for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
   }
   return hash;
}

// Shared functions for broken assets (links/images)
async function checkAsset(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let headResponse = null;
    let headStatus = null;
    try {
        console.log('Observatron: Sending HEAD request to:', url);
        headResponse = await fetch(url, { method: 'HEAD', signal: controller.signal });
        headStatus = headResponse.status;
        console.log('Observatron: HEAD response status:', headStatus);
        if (headResponse.redirected) {
            console.log('Observatron: Redirect detected:', url, '->', headResponse.url);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            headStatus = 'timeout';
            console.log('Observatron: HEAD request timed out');
        } else {
            headStatus = 'error';
            console.log('Observatron: HEAD request failed:', error.message);
        }
    }
    clearTimeout(timeoutId);

    let getStatus = null;
    if (headStatus === 'error' || headStatus === 'timeout' || headStatus >= 400) {
        // Try GET
        const getController = new AbortController();
        const getTimeoutId = setTimeout(() => getController.abort(), timeoutMs);
        try {
            console.log('Observatron: Sending GET request to:', url);
            const getResponse = await fetch(url, { method: 'GET', signal: getController.signal });
            getStatus = getResponse.status;
            console.log('Observatron: GET response status:', getStatus);
            if (getResponse.redirected) {
                console.log('Observatron: Redirect detected:', url, '->', getResponse.url);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                getStatus = 'timeout';
                console.log('Observatron: GET request timed out');
            } else {
                getStatus = 'error';
                console.log('Observatron: GET request failed:', error.message);
            }
        }
        clearTimeout(getTimeoutId);
    }

    return { headStatus, getStatus };
}

function createBrokenAssetNote(assetType, source, url, text, headStatus, getStatus) {
    console.log('Observatron: Asset is broken, creating note');
    const assetName = assetType.toLowerCase();
    const noteText = `! Broken ${assetName} found on ${source}\n- ${url}\n- "${text}"\n- HEAD status: ${headStatus}\n- GET status: ${getStatus}`;
    saveNoteFromMessage(noteText, false, false);
}

async function handleBrokenAssets(assets, assetType) {
    console.log('Observatron: Handling broken', assetType + 's, received count:', assets.length);
    const queueKey = `broken${assetType}Queue`;
    const hashesKey = `broken${assetType}Hashes`;

    // Load existing queue and checked hashes
    const result = await chrome.storage.session.get([queueKey, hashesKey]);
    let queue = result[queueKey] || [];
    const checkedHashes = new Set(result[hashesKey] || []);

    console.log('Observatron: Existing queue length:', queue.length, 'checked hashes:', checkedHashes.size);

    // Add new assets to queue if not already checked
    let added = 0;
    for (const asset of assets) {
        if (!checkedHashes.has(asset.hash)) {
            queue.push(asset);
            checkedHashes.add(asset.hash);
            added++;
        }
    }

    console.log('Observatron: Added', added, 'new', assetType + 's to queue. New queue length:', queue.length);

    // Save updated queue and hashes
    const update = {};
    update[queueKey] = queue;
    update[hashesKey] = Array.from(checkedHashes);
    chrome.storage.session.set(update);

    // Start processing if not already running
    processBrokenAssetQueue(assetType);
}

async function processBrokenAssetQueue(assetType) {
    const queueKey = `broken${assetType}Queue`;
    const timeoutKey = `reportBroken${assetType}sTimeoutMs`;
    const delayKey = `reportBroken${assetType}sCheckDelayMs`;

    const result = await chrome.storage.session.get([queueKey]);
    let queue = result[queueKey] || [];

    console.log('Observatron: Processing broken', assetType, 'queue, current length:', queue.length);

    if (queue.length === 0) {
        console.log('Observatron: Queue empty, stopping processing');
        return;
    }

    const asset = queue.shift(); // Process first item
    console.log('Observatron: Processing', assetType + ':', asset.url, 'from', asset.source);

    const timeout = options[timeoutKey] || 10000;
    const { headStatus, getStatus } = await checkAsset(asset.url, timeout);

    if ((headStatus === 'error' || headStatus === 'timeout' || headStatus >= 400) && (getStatus === 'error' || getStatus === 'timeout' || getStatus >= 400)) {
        createBrokenAssetNote(assetType, asset.source, asset.url, asset.text, headStatus, getStatus);
    } else {
        console.log('Observatron: Asset is OK');
    }

    // Save updated queue
    const update = {};
    update[queueKey] = queue;
    chrome.storage.session.set(update);
    console.log('Observatron: Saved updated queue, new length:', queue.length);

    // Schedule next check after delay
    const delay = options[delayKey] || 1000;
    console.log('Observatron: Scheduling next check in', delay, 'ms');
    setTimeout(() => processBrokenAssetQueue(assetType), delay);
}

async function handleHtmlComments(comments, url) {
    // Load existing seen hashes
    const result = await chrome.storage.session.get(['htmlCommentHashes']);
    const seenHashes = new Set(result.htmlCommentHashes || []);

    // Comments received are already filtered to be new
    for (const comment of comments) {
       const hash = simpleHash(comment);
       seenHashes.add(hash);
    }

    // Save all new comments in a single note
    if (options.onPageLoadLogHtmlCommentsAsNotes && comments.length > 0) {
       const noteText = `@AutoNote HTML Comments (${comments.length}) found at URL ${url} :\n\n- ${comments.join('\n- ')}`;
       saveNoteFromMessage(noteText, false, false);
    }

    // Save updated hashes
    chrome.storage.session.set({htmlCommentHashes: Array.from(seenHashes)});
}

async function handleBrokenLinks(links) {
    await handleBrokenAssets(links, 'Link');
}



function logEvent(event) {
  var eventId = Math.floor(Date.now());
  console.log(event);
  downloadAsLog("userEvent"+"_"+eventId, event);
}


function saveComments() {
  getCurrentTab().then(function(tab){
          chrome.tabs.sendMessage(tab.id, { method: 'scanCommentsForSave' }, function(response) {
              if (response) {
                  saveCommentsAsMarkdown(response.comments, response.url);
              }
          });
    });
}


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
        if (!isTabOnEngagedDomain(tabs[0].url)) {
          return;
        }

        downloadScreenshot();
      });
}









function takeElementScreenshot(selector, rect, tabId) {
  console.log('Taking element screenshot for selector:', selector, 'on tab:', tabId);
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      console.warn("Failed to get tab:", chrome.runtime.lastError);
      return;
    }
    const windowId = tab.windowId;
    console.log('Tab info:', { tabId, windowId, url: tab.url });
    
    // First, try to get the updated rect
    getUpdatedRect(selector, tabId, (updatedRect) => {
      if (!updatedRect) {
        console.warn('No updated rect received for selector:', selector);
        return;
      }
      console.log('Updated rect for cropping:', updatedRect);
      
      // Wait a bit more to ensure scrolling is complete
      setTimeout(() => {
        console.log('Capturing visible tab...');
        chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataURL) => {
          if (chrome.runtime.lastError) {
            console.warn('Screenshot capture failed:', chrome.runtime.lastError);
            return;
          }
          if (!dataURL) {
            console.warn('No screenshot data URL received');
            return;
          }
          console.log('Screenshot captured, cropping...');
          cropElementScreenshot(dataURL, updatedRect, tabId, (croppedDataURL) => {
            if (croppedDataURL) {
              console.log('Element screenshot cropped successfully');
              downloadElementScreenshot(croppedDataURL);
            } else {
              console.warn('Element screenshot cropping failed');
            }
          });
        });
      }, 400); // Increased delay to ensure scrolling is complete
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