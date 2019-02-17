

var options = {

  engaged: false,

  // which events are we responding to
  onScrollEvent: true,
  onResizeEvent: true,
  onPageLoad: true,
  onPageUpdated: false,
  onDoubleClickShot: true,

  // where are the files stored?
  filepath: "observatron/",
  fileprefix: "obs_",

  // 
  scrolling_timeout_milliseconds: 500,
  resize_timeout_milliseconds: 500
}

function changedOptions(){
  chrome.storage.local.set({observatron: options});
}

changedOptions();

// https://developer.chrome.com/extensions/storage
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if(namespace === "local"){
    if(changes.hasOwnProperty("observatron")){
      options = changes["observatron"].newValue;
      if(changes["observatron"].newValue.enabled != changes["observatron"].oldValue.enabled){
        toggle_observatron_status();
      }
    }
  }
});




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
      downloadScreenshot();
    }
  }

  if (request.method === 'screenshotdbl') {
    if(options.onDoubleClickShot){
      console.log("shot on doubleclick");
      downloadScreenshot();
    }
  }

  if (request.method === 'scrolled') {
    if(options.onScrollEvent === true){
      console.log("shot on scrolled");
      downloadScreenshot();
    }
  }

  return false;

}

chrome.runtime.onMessage.addListener(requested);

// Enable Disable on click
chrome.browserAction.onClicked.addListener(function() {
  toggle_observatron_status();
});

chrome.webNavigation.onCompleted.addListener(configuredOnPageLoad);

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  configuredOnPageUpdated(tabId, changeInfo, tab);
});



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
    downloadScreenshot();

  }
}

function configuredOnPageUpdated(tabId, changeInfo, tab){

  if(!isObservatronEngaged()){
    return;
  }

  if(options.onPageUpdated){

    //console.log("page updated");

    if (changeInfo.status == 'complete') {

      saveAsMhtml(tabId);
      downloadScreenshot(); 

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

  if(anId == undefined){   
      getCurrentTab().then(function(tab){
        chrome.pageCapture.saveAsMHTML({tabId: tab.id}, downloadMHTML);
      });
  }
  else{
      chrome.pageCapture.saveAsMHTML({tabId: anId}, downloadMHTML);
  }
}

function downloadMHTML(mhtmlData){

  if(!isObservatronEngaged()){
    return;
  }

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

function downloadAsLog(fileNameAppend, objectToWrite, attribute){

  // https://developer.mozilla.org/en-US/docs/Web/API/Blob

  if(objectToWrite === undefined){
    return;
  }
  if(!objectToWrite.hasOwnProperty(attribute)){
    return;
  }

  var outputObject = {};
  outputObject[attribute] = objectToWrite[attribute];

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