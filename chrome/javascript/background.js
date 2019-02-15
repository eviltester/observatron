

var options = {

  engaged: false,

  // which events are we responding to
  onScrollEvent: true,
  onResizeEvent: true,
  onPageLoad: true,
  onPageUpdated: true,
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



chrome.webNavigation.onCompleted.addListener(function(){
  configuredOnPageLoad();
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  configuredOnPageUpdated(tabId, changeInfo, tab);
});



function zeropadDigits(padthis, padding){
  return ("000000" + padthis).slice((-1 * padding));
}

function getFileName(filetype, extension){

    var datePart = new Date();

    var dateString = datePart.getFullYear() +
                      "-" + zeropadDigits(datePart.getMonth()+1,2) +
                      "-" + zeropadDigits(datePart.getDate(),2) +
                      "-" + zeropadDigits(datePart.getHours(),2) + 
                      "-" + zeropadDigits(datePart.getMinutes(),2) + 
                      "-" + zeropadDigits(datePart.getSeconds(),2) +
                      "-" + zeropadDigits(datePart.getMilliseconds(),3);

    var folderpath = datePart.getFullYear() + "/" + 
                    zeropadDigits(datePart.getMonth()+1,2) + "/" +
                    zeropadDigits(datePart.getDate(),2) + "/";
      

    var downloadFileName =  options.filepath+
                            folderpath+
                            options.fileprefix+
                            dateString+
                            "-" + filetype + "." + extension;
    
    return downloadFileName;                            
}

function isObservatronEngaged(){
  return options.engaged;
}

function downloadMHTML(mhtmlData){

    if(!isObservatronEngaged()){
      return;
    }

    var downloadFileName = getFileName("mhtmldata", "mhtml");

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

        var downloadFileName = getFileName("screenshot"+dimensions, "jpg");


        chrome.downloads.download(
              {
                url: screenshotUrl, 
                filename: downloadFileName
              },function(downloadId){
                console.log("downloaded as " + downloadFileName);

        });

    });
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

      downloadScreenshot();
      saveAsMhtml();
      
      chrome.browserAction.setIcon({path:"icons/green.png"});
      chrome.browserAction.setTitle({title:"Disengage The Observatron"});
    }
}

function configuredOnPageLoad(anObject){

  if(!isObservatronEngaged()){
    return;
  }

  if(anObject === undefined){
    return;
  }

  if(options.onPageLoad){
  
    if(!anObject.hasOwnProperty('tabId')){
      return;
    }

    console.log(anObject);

    saveAsMhtml(anObject.tabId);
    downloadScreenshot();

  }
}

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


function configuredOnPageUpdated(tabId, changeInfo, tab){

  if(!isObservatronEngaged()){
    return;
  }

  if(options.onPageUpdated){
    if (changeInfo.status == 'complete') {

      saveAsMhtml(tabId);
      downloadScreenshot(); 

    }
  }
}