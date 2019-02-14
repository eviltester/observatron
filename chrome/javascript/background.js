

var engaged = false;

var filepath = "observatron/";
var fileprefix = "obs_";

var onScrollEvent = true;
var onResizeEvent = true;
var onPageLoad = true;
var onPageUpdated = true;

// useful info
//https://stackoverflow.com/questions/13141072/how-to-get-notified-on-window-resize-in-chrome-browser
//https://github.com/NV/chrome-o-tile/blob/master/chrome/background.js





function requested(request){

  if(!engaged){
    return;
  }

  if (request.method === 'resize') {
    if(onResizeEvent){
      console.log("shot on resize");
      downloadScreenshot();
    }
  }
  if (request.method === 'scrolled') {
    if(onScrollEvent === true){
      console.log("shot on scrolled");
      downloadScreenshot();
    }
  }
}

chrome.runtime.onMessage.addListener(requested);

// Listen for a click on the camera icon. On that click, take a screenshot.
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
      

    var downloadFileName =  filepath+folderpath+fileprefix+
                            dateString+
                            "-" + filetype + "." + extension;
    
    return downloadFileName;                            
}


function downloadMHTML(mhtmlData){

    if(!engaged){
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
          return;
        }

        //https://stackoverflow.com/questions/6718256/how-do-you-use-chrome-tabs-getcurrent-to-get-the-page-object-in-a-chrome-extensi
        // , active: true  not necessarily the active tab, just the current
        chrome.tabs.query({ currentWindow: true}, function (tabs) {
          //console.log(tabs);
          width = tabs[0].width;
          height = tabs[0].height;
        });

        console.log(screenshotUrl);

        var dimensions = "-" + width + "x" + height;

        var downloadFileName = getFileName("screenshot"+dimensions, "jpg");

        chrome.downloads.download(
              {
                url: screenshotUrl, 
                filename: downloadFileName
              },function(downloadId){
            console.log("download as " + downloadFileName);
            
        });

    });
}



function toggle_observatron_status(){
    if(engaged){
      // switch it off
      console.log("Observatron Disengaged");
      engaged = false;

      chrome.browserAction.setIcon({path:"icons/red.png"});
      chrome.browserAction.setTitle({title:"Engage The Observatron"});

    }else{
      // switch it on
      console.log("Observatron Engaged");
      engaged=true;

      downloadScreenshot();
      saveAsMhtml();
      
      chrome.browserAction.setIcon({path:"icons/green.png"});
      chrome.browserAction.setTitle({title:"Disengage The Observatron"});
    }
}

function configuredOnPageLoad(anObject){

  if(!engaged){
    return;
  }

  if(anObject === undefined){
    return;
  }

  if(onPageLoad){
  
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

  if(!engaged){
    return;
  }

  if(onPageUpdated){
    if (changeInfo.status == 'complete') {

      saveAsMhtml(tabId);
      downloadScreenshot(); 

    }
  }
}