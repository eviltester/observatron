// TODO: when update options, refresh code in each current tab
// https://stackoverflow.com/questions/10994324/chrome-extension-content-script-re-injection-after-upgrade-or-install/11598753#11598753

  // Import other scripts
 importScripts('observatron_options.js', 'context_menu.js', 'filenames.js', 'shared.js', 'traffic_rules.js',
   'capture_report.js', 'capture_worker.js', 'accessibility_scan.js');

 // Import testable utility functions
 importScripts('note_parser.js', 'geometry_utils.js', 'worker_screenshot_utils.js');

console.log("Service worker started/reloaded");

var options = new Options();
var engagedDomain = null;
var sideBarSide= "left";
var sidepanelShown = false;
let optionsLoaded = false;

const optionsReady = restoreOptions();
let engagementChange = optionsReady;
let trafficRulesWrite = Promise.resolve();
let noteWrite = Promise.resolve();
let lastNoteId = 0;
const pendingHtmlCommentReports = new Map();
const pendingAccessibilityReviews = new Map();
const pendingBrokenAssetReviews = new Map();
const pendingReviewNotes = new Map();
const brokenAssetOptions = {
  Link: {enabled: 'reportBrokenLinks', output: 'brokenLinksOutput'},
  Image: {enabled: 'reportBrokenImages', output: 'brokenImagesOutput'}
};
 
/*
   STORAGE
   */



// https://developer.chrome.com/extensions/storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  optionsReady.then(() => storageHasChanged(changes, namespace));
});


// TODO: add and remove listeners based on options, not just soft toggle on variables

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'observatronReadSelectedElement' || request.type === 'observatronTrackElementDevtools' ||
      request.type === 'observatronElementDevtoolsReady') return false;
  if (request.method === 'observatronCapture') return handleCaptureCommand(request, sender, sendResponse);
  if (request.method === 'scanResponsiveAccessibility') {
    if (sender.url !== chrome.runtime.getURL('sidepanel/sidepanel.html')) return false;
    const {tabId, pageUrl} = request;
    if (!Number.isInteger(tabId) || !/^https?:\/\//i.test(pageUrl || '')) return false;
    scanResponsiveAccessibility(tabId, pageUrl).then(
      report => sendResponse({success: true, report}), error => sendResponse({error: error.message})
    );
    return true;
  }
  if (optionsLoaded) return requestMethodHandler(request, sender, sendResponse);

  optionsReady.then(() => {
    if (!requestMethodHandler(request, sender, sendResponse)) sendResponse();
  });
  return true;
});


if (chrome && chrome.runtime && chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(() => {
    console.log("Service worker is being suspended/unloaded");
  });
}

// Enable Disable on click
chrome.action.onClicked.addListener((tab) => {
  void changeObservation('toggle', () => tab).catch(error => {
    console.error('Could not change Observatron engagement:', error);
  });
});

chrome.webNavigation.onCompleted.addListener(details => {
  optionsReady.then(() => configuredOnPageLoad(details));
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
   optionsReady.then(() => {
     configuredOnPageUpdated(tabId, changeInfo, tab);
     manageSidepanelOnTabUpdate(tabId, changeInfo, tab);
   });
});

chrome.tabs.onCreated.addListener(function(tab) {
   optionsReady.then(() => manageSidepanelOnTabCreate(tab));
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
   optionsReady.then(() => manageSidepanelOnTabActivate(activeInfo.tabId));
});

chrome.tabs.onRemoved.addListener(tabId => {
  pendingHtmlCommentReports.delete(tabId);
  pendingAccessibilityReviews.delete(tabId);
  const assetKeys = Object.keys(brokenAssetOptions).map(type => brokenAssetReportKey(tabId, type));
  for (const key of assetKeys) pendingBrokenAssetReviews.delete(key);
  const reviewKeys = [htmlCommentsReportKey(tabId), accessibilityReportKey(tabId)];
  const noteKeys = reviewKeys.map(reviewNotesActivityKey);
  for (const key of noteKeys) pendingReviewNotes.delete(key);
  chrome.storage.session.remove([...reviewKeys, ...noteKeys, ...assetKeys]).catch(() => {});
});

// download any form submissions
// https://developer.chrome.com/extensions/webRequest#event-onBeforeRequest
chrome.webRequest.onBeforeRequest.addListener(
  details => { optionsReady.then(() => downloadPostForm(details)); },
  {urls: ["<all_urls>"]},["requestBody"] //"blocking", 
);

// https://developer.chrome.com/extensions/commands
chrome.commands.onCommand.addListener(function(command) {
  commandHandler(command);
});

// context menu
var contextMenus = new ContextMenus();

// Create context menus on install
chrome.runtime.onInstalled.addListener(() => {
  contextMenus.createMenus();
});

// Create context menus when service worker starts
chrome.runtime.onStartup.addListener(() => {
  contextMenus.createMenus();
});

/*

    Storage

*/

// TODO: this could be a message to set options on the backend

async function restoreOptions() {
  try {
    const saved = await chrome.storage.local.get(['observatron', 'observatronEngagedDomain']);
    engagedDomain = saved.observatronEngagedDomain || null;
    options = Object.assign(new Options(), migratePageReviewOptions(saved.observatron), {engaged: Boolean(engagedDomain)});

    if (saved.observatron?.engaged !== options.engaged) {
      await chrome.storage.local.set({observatron: options});
    }
    await updateActionStatus();
  } catch (error) {
    console.error('Could not restore Observatron options:', error);
  } finally {
    optionsLoaded = true;
  }
}

async function updateSavedTrafficRules(action, rules) {
  if (!['add', 'remove'].includes(action) || !Array.isArray(rules) || !rules.length ||
      !rules.every(rule => typeof rule?.name === 'string' && rule.name.trim() &&
          typeof rule.text === 'string' && rule.text &&
          (rule.mode === undefined || rule.mode === 'regex'))) throw new Error('Invalid traffic rules.');

  const selected = rules.map(({name, text, mode}) => mode === 'regex' ? {name, text, mode} : {name, text});
  if (action === 'add') selected.forEach(compileTrafficPattern);
  const saved = await getSavedTrafficRules();
  const selectedKeys = new Set(selected.map(trafficRuleKey));
  const next = action === 'add'
    ? uniqueTrafficRules([...saved, ...selected])
    : saved.filter(rule => !selectedKeys.has(trafficRuleKey(rule)));
  if (next.length !== saved.length) await chrome.storage.local.set({[savedTrafficRulesKey]: next});
}

function storageHasChanged(changes, namespace) {
  if(namespace === "local"){
    if(changes.hasOwnProperty("observatron")){
      options = Object.assign(new Options(), migratePageReviewOptions(changes.observatron.newValue), {engaged: Boolean(engagedDomain)});
    }
  }
}

function notifyEngagementChanged(){
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

  if (request.method === 'changeObservation') {
    if (sender.url !== chrome.runtime.getURL('sidepanel/sidepanel.html') ||
        !['start', 'stop'].includes(request.action)) return false;
    changeObservation(request.action, () => requireMatchingPanelTab(request.tabId, request.pageUrl)).then(
      () => sendResponse({success: true}), error => sendResponse({error: error.message})
    );
    return true;
  }

  if (request.method === changeSavedTrafficRulesMethod) {
    if (sender.url !== chrome.runtime.getURL('sidepanel/sidepanel.html') &&
        sender.url !== chrome.runtime.getURL('options/options_page.html')) return false;

    const write = trafficRulesWrite.then(() => updateSavedTrafficRules(request.action, request.rules));
    trafficRulesWrite = write.catch(() => {});
    write.then(() => sendResponse({success: true}), () => sendResponse({success: false}));
    return true;
  }

  // Handle update options request
  if (request.action === 'updateOptions') {
    options = Object.assign(new Options(), migratePageReviewOptions(request.options), {engaged: Boolean(engagedDomain)});
    sendResponse({success: true});
    return true;
  }

   // Handle brokenLinksFound regardless of engagement status
   if (request.method === 'brokenLinksFound') {
     if (brokenAssetOutput('Link') === 'notes') void handleBrokenAssets(request.links, 'Link', sender.tab?.id);
     return false;
   }

   // Handle brokenImagesFound regardless of engagement status
   if (request.method === 'brokenImagesFound') {
     if (brokenAssetOutput('Image') === 'notes') void handleBrokenAssets(request.images, 'Image', sender.tab?.id);
     return false;
   }

   if (['startBrokenAssetReview', 'clearBrokenAssetReview'].includes(request.method)) {
     const {tabId, assetType} = request;
     if (sender.url !== chrome.runtime.getURL('sidepanel/sidepanel.html') ||
         !Object.hasOwn(brokenAssetOptions, assetType) || !Number.isInteger(tabId)) return false;
     if (request.method === 'clearBrokenAssetReview') {
       const key = brokenAssetReportKey(tabId, assetType);
       pendingBrokenAssetReviews.delete(key);
       chrome.storage.session.remove(key).then(() => sendResponse({success: true}), error => sendResponse({error: error.message}));
     } else {
       requireMatchingPanelTab(tabId, request.pageUrl).then(tab => {
         void reviewBrokenAssets(tab, assetType);
         sendResponse({success: true});
       }, error => sendResponse({error: error.message}));
     }
     return true;
   }


  // Handle status requests
  if (request.method === 'getStatus') {
    sendResponse({engaged: options.engaged, domain: engagedDomain, onClickEvents: options.onClickEvents, onInputChanges: options.onInputChanges, onPageMutation: options.onPageMutation});
    return true;
  }

    if (['saveNote', 'takeScreenshot', 'savePage', 'takeElementScreenshot',
      'capturePanelElementScreenshot'].includes(request.method)) {
        if (sender.url !== chrome.runtime.getURL('sidepanel/sidepanel.html')) return false;
        handlePanelPageAction(request).then(
            result => sendResponse({success: true, ...result}),
            error => sendResponse({error: error.message})
        );
        return true;
    }

    if (['changeNoteType', 'setNoteStatus'].includes(request.method)) {
      if (sender.url !== chrome.runtime.getURL('sidepanel/sidepanel.html')) return false;
      updateNotes(notes => updateSavedNote(notes, request)).then(
        () => sendResponse({success: true}), error => sendResponse({error: error.message})
      );
      return true;
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
      void handleHtmlComments(request.comments, request.url).catch(error => console.warn('Could not log HTML comments:', error.message));
      return false;
    }



   return false;

}


function isObservatronEngaged(){
  return options.engaged;
}

function isTabOnEngagedDomain(taburl) {
  return Boolean(engagedDomain) && getHostname(taburl) === engagedDomain;
}

function getHostname(url) {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}




function changeObservation(action, getTab) {
  const change = engagementChange.then(async () => {
    const start = action === 'toggle' ? !isObservatronEngaged() : action === 'start';
    if (start !== isObservatronEngaged()) await setObserving(start ? await getTab() : null);
  });
  engagementChange = change.catch(() => {});
  return change;
}

async function setObserving(tab) {
  const domain = tab ? getHostname(tab.url) : null;
  if (tab !== null && (!domain || !/^https?:\/\//i.test(tab.url))) {
    throw new Error('Open an HTTP or HTTPS page to start observing.');
  }

  await chrome.storage.session.set({
    htmlCommentHashes: [],
    brokenLinkQueue: [],
    brokenLinkHashes: [],
    brokenImageQueue: [],
    brokenImageHashes: []
  });
  const engaged = Boolean(domain);
  await chrome.storage.local.set({observatron: {...options, engaged}, observatronEngagedDomain: domain});

  engagedDomain = domain;
  options.engaged = engaged;
  notifyEngagementChanged();
  await updateActionStatus();

  if (engaged) {
    await showSidePanel(tab.id).catch(error => console.warn('Could not enable the side panel:', error.message));
    configuredOnPageLoad({frameId: 0, tabId: tab.id, url: tab.url});
  }
}

function updateActionStatus(){
  contextMenus.setObserving(Boolean(engagedDomain));
  const icon = engagedDomain ? 'icons/green.png' : 'icons/red.png';
  const title = engagedDomain ? `Disengage The Observatron from ${engagedDomain}` : 'Engage The Observatron';
  return Promise.all([
    chrome.action.setIcon({path: chrome.runtime.getURL(icon)}),
    chrome.action.setTitle({title})
  ]);
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

  if(options.onPageLoad || options.onPageLoadDetectHtmlComments || options.onPageLoadAccessibilityReview ||
      options.reportBrokenLinks || options.reportBrokenImages){

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

          if (options.onPageLoadDetectHtmlComments && options.htmlCommentsOutput === 'notes') {
            if (!anObject.url || anObject.url === tab.url) void scanHtmlCommentsForNotes(tab, anObject.documentId);
          } else if (options.onPageLoadDetectHtmlComments && (!anObject.url || anObject.url === tab.url)) {
            void scanHtmlCommentsForReport(tab, anObject.documentId);
          }

          if (options.onPageLoadAccessibilityReview && (!anObject.url || anObject.url === tab.url)) {
            void reviewAccessibilityOnPageLoad(tab, anObject.documentId);
          }

          if (!anObject.url || anObject.url === tab.url) {
            for (const type of Object.keys(brokenAssetOptions)) {
              const output = brokenAssetOutput(type);
              if (output === 'report') void reviewBrokenAssets(tab, type, anObject.documentId, true);
              if (output === 'notes') void collectBrokenAssetsForNotes(tab.id, type, anObject.documentId);
            }
          }
       }
     });

   }
}

async function showSidePanel(tabId){

    var useTabId = tabId;
    if(useTabId==undefined){
        const tab = await getCurrentTab();
        useTabId = tab.id;
    }

    await chrome.sidePanel.setOptions({
      tabId: useTabId,
      path: 'sidepanel/sidepanel.html',
      enabled: true
      }
    );

    sidepanelShown = true;
}

function configuredOnPageUpdated(tabId, changeInfo, tab){

   // https://developer.chrome.com/extensions/tabs#event-onUpdated
   if (!isTabOnEngagedDomain(tab.url)) return;

   if(options.onPageUpdated){

     showSidePanel(tabId).catch(() => {});

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

   if (sidepanelShown && isTabOnEngagedDomain(tab.url)) {
     showSidePanel(tabId).catch(() => {});
   }
}

function manageSidepanelOnTabCreate(tab) {
   if (!isObservatronEngaged()) {
     return;
   }

   if (sidepanelShown) {
     if (isTabOnEngagedDomain(tab.url)) {
       showSidePanel(tab.id).catch(() => {});
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
       showSidePanel(tabId).catch(() => {});
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

function nextNoteId() {
    lastNoteId = Math.max(Date.now(), lastNoteId + 1);
    return lastNoteId;
}

function saveNoteFromMessage(noteText, screenshots = [], noteId = nextNoteId()) {

  // is it a special note?
  // ? question
  // ! bug
  // - todo
  // @type

  var noteToLog = getSpecialNoteTypeFromString(noteText);
   noteToLog.id = noteId.toString();
   noteToLog.timestamp = new Date().toISOString();
   // Set default status: closed for notes and non-closable types, open for closable types
   noteToLog.status = isClosableNoteType(noteToLog.type) ? 'open' : 'closed';

  noteToLog.screenshots = screenshots;

  downloadAsLog(noteToLog.type+"_"+noteToLog.id, noteToLog);
  return updateNotes(notes => notes.push(noteToLog));
}

function updateNotes(edit) {
    // Keep user edits and findings from concurrent page-load checks in the same collection.
    const saved = noteWrite.then(async () => {
        const {observatron_notes = []} = await chrome.storage.local.get('observatron_notes');
        edit(observatron_notes);
        await chrome.storage.local.set({observatron_notes});
    });
    noteWrite = saved.catch(() => {});
    return saved;
}

function updateSavedNote(notes, request) {
    const note = notes.find(note => note.id === request.noteId);
    if (!note) throw new Error('This note is no longer in the collection.');

    if (request.method === 'setNoteStatus') {
        if (!isClosableNoteType(note.type) || !['open', 'closed'].includes(request.status)) {
            throw new Error('This note cannot change status.');
        }
        note.status = request.status;
        if (note.status === 'closed') note.closingNote = typeof request.closingNote === 'string' ? request.closingNote.trim() || undefined : undefined;
        return;
    }

    if (note.status !== 'open' || note.type === 'note') throw new Error('Open the note before changing its type.');
    let type = request.noteType;
    if (request.customType) {
        const name = typeof type === 'string' ? type.trim().replace(/^@/, '') : '';
        if (!name.replace(/\[\]$/, '') || /\s/.test(name)) throw new Error('Enter a custom type with no spaces.');
        type = getSpecialNoteTypeFromString(`@${name}`).type;
    } else if (!standardNoteTypes.includes(type) && !notes.some(note => note.type === type)) {
        throw new Error('Select a note type.');
    }
    note.type = type;
    note.status = isClosableNoteType(type) ? 'open' : 'closed';
}

function simpleHash(str) {
   let hash = 5381;
   for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
   }
   return hash;
}

// Shared functions for broken assets (links/images)
function brokenAssetOutput(assetType) {
    const {enabled, output} = brokenAssetOptions[assetType];
    return options[enabled] ? options[output] : undefined;
}

async function collectBrokenAssetsForNotes(tabId, assetType, documentId) {
    try {
        const hashKey = `broken${assetType}Hashes`;
        const hashes = await chrome.storage.session.get(hashKey);
        await chrome.tabs.sendMessage(tabId, {method: `scanBroken${assetType}s`, checkedHashes: hashes[hashKey] || []},
            documentId ? {documentId} : {frameId: 0});
    } catch {
        // The page may have navigated while getting the observation settings.
    }
}

async function reviewBrokenAssets(tab, assetType, documentId, automatic = false) {
    const key = brokenAssetReportKey(tab.id, assetType);
    const report = {id: crypto.randomUUID(), url: tab.url, findings: [], checked: 0, total: 0, running: true, error: ''};
    pendingBrokenAssetReviews.set(key, report.id);
    const isLatest = () => pendingBrokenAssetReviews.get(key) === report.id;
    const canContinue = () => isLatest() && (!automatic ||
        (brokenAssetOutput(assetType) === 'report' && isTabOnEngagedDomain(tab.url)));
    const publish = () => chrome.storage.session.set({[key]: report});

    try {
        await publish();
        if (!canContinue()) return;
        const result = await chrome.tabs.sendMessage(tab.id, {method: `scanBroken${assetType}s`, review: true},
            documentId ? {documentId} : {frameId: 0}).catch(() => undefined);
        if (!result) throw new Error('Open or reload an HTTP or HTTPS page and try again.');
        if (result.url !== tab.url) throw new Error('The target page changed. Run the check again.');
        const {assets} = result;
        report.total = assets.length;
        if (canContinue() && report.total) await publish();

        for (const asset of assets) {
            if (!canContinue()) break;
            const {headStatus, getStatus, broken, delay} = await checkBrokenAsset(asset.url, assetType);
            if (!canContinue()) break;
            report.checked++;
            if (broken) report.findings.push({...asset, headStatus, getStatus});
            if (report.checked < report.total) {
                await publish();
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        if (automatic && isLatest() && !canContinue()) report.error = 'Review stopped by the current options.';
    } catch (error) {
        report.error = error.message;
    } finally {
        if (isLatest()) {
            report.running = false;
            await publish().catch(error => console.warn('Could not save the broken resource review:', error.message));
            if (isLatest()) pendingBrokenAssetReviews.delete(key);
        }
    }
}

function assetCheckFailed(status) {
    return status === 'error' || status === 'timeout' || status >= 400;
}

async function checkBrokenAsset(url, assetType) {
    const timeout = options[`reportBroken${assetType}sTimeoutMs`] || 10000;
    const {headStatus, getStatus} = await checkAsset(url, timeout);
    return {
        headStatus, getStatus,
        broken: assetCheckFailed(headStatus) && assetCheckFailed(getStatus),
        delay: options[`reportBroken${assetType}sCheckDelayMs`] || 1000
    };
}

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
    if (assetCheckFailed(headStatus)) {
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
    return saveNoteFromMessage(noteText);
}

async function handleBrokenAssets(assets, assetType, tabId) {
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
            queue.push({...asset, tabId});
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

    const result = await chrome.storage.session.get([queueKey]);
    let queue = result[queueKey] || [];

    console.log('Observatron: Processing broken', assetType, 'queue, current length:', queue.length);

    if (queue.length === 0) {
        console.log('Observatron: Queue empty, stopping processing');
        return;
    }

    const asset = queue.shift(); // Process first item
    console.log('Observatron: Processing', assetType + ':', asset.url, 'from', asset.source);

    const {headStatus, getStatus, broken, delay} = await checkBrokenAsset(asset.url, assetType);

    if (broken && brokenAssetOutput(assetType) === 'notes' && isTabOnEngagedDomain(asset.source)) {
        await createBrokenAssetNote(assetType, asset.source, asset.url, asset.text, headStatus, getStatus)
            .catch(error => console.warn('Could not log a broken resource:', error.message));
    } else {
        console.log('Observatron: Asset is OK');
    }

    // Save updated queue
    const update = {};
    update[queueKey] = queue;
    chrome.storage.session.set(update);
    console.log('Observatron: Saved updated queue, new length:', queue.length);

    // Schedule next check after delay
    console.log('Observatron: Scheduling next check in', delay, 'ms');
    setTimeout(() => processBrokenAssetQueue(assetType), delay);
}

async function handleHtmlComments(comments, url) {
    if (!options.onPageLoadDetectHtmlComments || options.htmlCommentsOutput !== 'notes') return;
    // Load existing seen hashes
    const result = await chrome.storage.session.get(['htmlCommentHashes']);
    const seenHashes = new Set(result.htmlCommentHashes || []);

    // Comments received are already filtered to be new
    for (const comment of comments) {
       const hash = simpleHash(comment);
       seenHashes.add(hash);
    }

    // Save all new comments in a single note
    if (comments.length > 0) {
       const noteText = `@AutoNote HTML Comments (${comments.length}) found at URL ${url} :\n\n- ${comments.join('\n- ')}`;
       await saveNoteFromMessage(noteText);
    }

    // Save updated hashes
    chrome.storage.session.set({htmlCommentHashes: Array.from(seenHashes)});
}

function scanHtmlCommentsForReport(tab, documentId) {
    return runPageLoadReport(tab, htmlCommentsReportKey(tab.id), pendingHtmlCommentReports,
        () => options.onPageLoadDetectHtmlComments && options.htmlCommentsOutput === 'report',
        () => chrome.tabs.sendMessage(tab.id, {method: 'scanCommentsForSave'}, documentId ? {documentId} : {frameId: 0}));
}

function scanHtmlCommentsForNotes(tab, documentId) {
    return runReviewNotes(tab, htmlCommentsReportKey(tab.id), async isCurrent => {
        const {htmlCommentHashes = []} = await chrome.storage.session.get('htmlCommentHashes');
        const result = await chrome.tabs.sendMessage(tab.id, {
            method: 'scanHtmlComments', detectEnabled: true, seenHashes: htmlCommentHashes, returnResult: true
        }, documentId ? {documentId} : {frameId: 0});
        if (isCurrent() && result?.url === tab.url && isTabOnEngagedDomain(tab.url)) {
            await handleHtmlComments(result.comments, result.url);
        }
    });
}

function reviewAccessibilityOnPageLoad(tab, documentId) {
    if (options.accessibilityOutput === 'report') {
        return runPageLoadReport(tab, accessibilityReportKey(tab.id), pendingAccessibilityReviews,
            () => options.onPageLoadAccessibilityReview && options.accessibilityOutput === 'report',
            () => scanPageAccessibility(tab.id, documentId));
    }

    return runReviewNotes(tab, accessibilityReportKey(tab.id), async isCurrent => {
        const report = await scanPageAccessibility(tab.id, documentId, false);
        if (isCurrent() && report.url === tab.url && options.onPageLoadAccessibilityReview &&
            options.accessibilityOutput === 'notes' && isTabOnEngagedDomain(tab.url)) {
            await logAccessibilityAutoNote(report);
        }
    });
}

async function runReviewNotes(tab, reportKey, run) {
    const key = reviewNotesActivityKey(reportKey);
    const revision = Symbol();
    const isCurrent = () => pendingReviewNotes.get(key) === revision;
    pendingReviewNotes.set(key, revision);
    try {
        await chrome.storage.session.set({[key]: {url: tab.url}});
        if (isCurrent()) await run(isCurrent);
    } catch (error) {
        console.debug('Could not save findings from the page-load review:', error.message);
    } finally {
        if (isCurrent()) {
            pendingReviewNotes.delete(key);
            await chrome.storage.session.remove(key).catch(() => {});
        }
    }
}

async function runPageLoadReport(tab, key, pending, enabled, run) {
    const revision = Symbol();
    pending.set(tab.id, revision);
    const isCurrent = () => pending.get(tab.id) === revision;
    const isEnabled = () => enabled() && isTabOnEngagedDomain(tab.url);
    try {
        await chrome.storage.session.set({[key]: {url: tab.url, running: true}});
        if (!isCurrent()) return;
        const report = isEnabled() ? await run() : undefined;
        if (!isCurrent()) return;
        if (!isEnabled()) {
            await chrome.storage.session.remove(key);
            return;
        }
        if (report?.url !== tab.url) throw new Error('The scanned page is no longer available.');
        await chrome.storage.session.set({[key]: report});
    } catch (error) {
        if (isCurrent()) {
            await chrome.storage.session.set({[key]: {url: tab.url, error: error.message}}).catch(() => {});
        }
    } finally {
        if (isCurrent()) pending.delete(tab.id);
    }
}

function logAccessibilityAutoNote({url, violations, needsReview}) {
    if (!violations.length && !needsReview.length) return;
    const findings = [`@AutoNote Axe Accessibility Review`, `Page: ${url}`];
    for (const [label, rules] of [['Issues', violations], ['Needs Manual Review', needsReview]]) {
        if (!rules.length) continue;
        findings.push(`\n${label} (${rules.length})`);
        for (const {help, id, elements} of rules) {
            findings.push(`- ${help} (${id})`);
            for (const {selector, guidance} of elements) {
                findings.push(`  - ${selector}${guidance ? ` — ${guidance.replace(/\s+/g, ' ')}` : ''}`);
            }
        }
    }
    return saveNoteFromMessage(findings.join('\n'));
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
                  saveCommentsAsMarkdown(response.comments, response.url).catch(error => {
                      console.warn('Could not save HTML comments:', error.message);
                  });
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









async function requireMatchingPanelTab(tabId, pageUrl) {
  if (!Number.isInteger(tabId) || typeof pageUrl !== 'string' || !pageUrl) {
    throw new Error('The target page URL is unavailable.');
  }
  const tab = await chrome.tabs.get(tabId);
  if (tab.url !== pageUrl || (tab.pendingUrl && tab.pendingUrl !== pageUrl)) {
    throw new Error('The target page changed. Try again on the current page.');
  }
  return tab;
}

async function capturePanelTab(tabId, pageUrl, format) {
  const tab = await requireMatchingPanelTab(tabId, pageUrl);
  if (!tab.active) throw new Error('Activate the target page before taking its screenshot.');

  let switched = false;
  const onActivated = active => {
    if (active.windowId === tab.windowId && active.tabId !== tabId) switched = true;
  };
  chrome.tabs.onActivated.addListener(onActivated);
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {format});
    const current = await requireMatchingPanelTab(tabId, pageUrl);
    if (switched || !current.active) throw new Error('The active tab changed during capture. Try again.');
    return {dataUrl, tab};
  } finally {
    chrome.tabs.onActivated.removeListener(onActivated);
  }
}

async function captureSelectedElement(tabId, pageUrl, element) {
  await requireMatchingPanelTab(tabId, pageUrl);
  if ((!element?.selector && !element?.finding) || element.pageUrl !== pageUrl) {
    throw new Error('Select an element on the target page before taking its screenshot.');
  }
  if (element.inShadowRoot) throw new Error('This element is inside a shadow root. Use Take Screenshot to capture the page.');
  const {rect, problem, documentId} = await new Promise(resolve => getUpdatedRect(element.selector || '', tabId,
    (rect, problem, documentId) => resolve({rect, problem, documentId}), {
    pageUrl, elementUrl: element.elementUrl, inFrame: element.inFrame, finding: element.finding, singleMatch: element.singleMatch
  }));
  if (problem) throw new Error(problem);
  if (!rect) throw new Error(element.inFrame
    ? 'Could not find a visible element in the frame. Element screenshots support direct, same-origin frames.'
    : 'The selected element has no visible area on the target page. Select a visible element and try again.');
  const {dataUrl} = await capturePanelTab(tabId, pageUrl, 'png');
  const cropped = await new Promise(resolve => cropElementScreenshot(dataUrl, rect, tabId, resolve, documentId));
  if (!cropped) throw new Error('Could not crop the selected element screenshot.');
  return cropped;
}

function panelImageFilename(name, extension) {
  return getFileName(options.filepath, options.fileprefix, name, extension, options.sessionName, options.folderStructure);
}

function panelScreenshotAsset({dataUrl, tab}, suffix = '') {
  const dimensions = tab.width && tab.height ? '-' + tab.width + 'x' + tab.height : '';
  return {url: dataUrl, filename: panelImageFilename('screenshot' + dimensions + suffix, 'jpg')};
}

async function handlePanelPageAction({method, tabId, pageUrl, noteText, withScreenshot, withElementScreenshot, capturePageScreenshot, element}) {
  if (method === 'savePage') {
    await requireMatchingPanelTab(tabId, pageUrl);
    saveAsMhtml(tabId);
    return;
  }
  if (method === 'takeScreenshot') {
    await chrome.downloads.download(panelScreenshotAsset(await capturePanelTab(tabId, pageUrl, 'jpeg')));
    return;
  }
  if (method === 'takeElementScreenshot' || method === 'capturePanelElementScreenshot') {
    const url = await captureSelectedElement(tabId, pageUrl, element);
    await chrome.downloads.download({url, filename: panelImageFilename('element_screenshot', 'png')});
    return;
  }

  const noteId = nextNoteId();
  const screenshots = [];
  const attachmentErrors = [];
  async function attachScreenshot(label, makeAsset) {
    try {
      const asset = await makeAsset();
      await chrome.downloads.download(asset);
      screenshots.push(asset.filename);
    } catch (error) {
      attachmentErrors.push(`Could not attach the ${label} screenshot. ${error.message}`);
    }
  }
  if (capturePageScreenshot || withScreenshot) {
    await attachScreenshot('page', async () =>
      panelScreenshotAsset(await capturePanelTab(tabId, pageUrl, 'jpeg'), '_note_' + noteId));
  }
  if (withElementScreenshot || element) {
    await attachScreenshot('element', async () => ({
      url: await captureSelectedElement(tabId, pageUrl, element),
      filename: panelImageFilename('element_screenshot_note_' + noteId, 'png')
    }));
  }
  await saveNoteFromMessage(noteText, screenshots, noteId);
  return {attachmentErrors};
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
