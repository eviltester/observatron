// TODO: when update options, refresh code in each current tab
// https://stackoverflow.com/questions/10994324/chrome-extension-content-script-re-injection-after-upgrade-or-install/11598753#11598753


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

// https://developer.chrome.com/extensions/commands
chrome.commands.onCommand.addListener(function(command) {
  commandHandler(command);
});

// context menu
var contextMenus = new ContextMenus();
contextMenus.init(downloadScreenshot, saveAsMhtml, options);
contextMenus.createMenus();

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
      contextMenus.updateContextMenus();
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

  // https://developer.chrome.com/extensions/tabs#event-onUpdated
  if(!isObservatronEngaged()){
    return;
  }

  if(options.onPageUpdated){

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
  // simple note taking experiment
  var noteText = window.prompt("Add Note to log \n(? question, ! bug, - todo, @customtype)","");
  var withScreenshot = false;
  var noteId = Math.floor(Date.now());

  if(noteText != null){

    withScreenshot = window.confirm("Do you want a screenshot with that?");
    
    // is it a special note?
    // ? question
    // ! bug
    // - todo
    // @type

    noteToLog = getSpecialNoteTypeFromString(noteText);
    noteToLog.id = noteId.toString();

    // TODO store screenshot name in the note as a screenshot property
    downloadAsLog(noteToLog.type+"_"+noteToLog.id, noteToLog);
    if(withScreenshot){
      downloadScreenshot("_note_" + noteToLog.id);
    }
  }
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