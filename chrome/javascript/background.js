

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







function downloadMHTML(mhtmlData){

  if(!engaged){
    return;
  }

      // resolution?

      var datePart = new Date();

      var dateString = datePart.toLocaleDateString().replace(new RegExp("(/|,| |:)", "g"),"-") 
                      + "-" + datePart.getHours() + 
                        "-" + datePart.getMinutes() + 
                        "-" + datePart.getSeconds() +
                        "-" + datePart.getMilliseconds();
      
      var filetype = "-mhtmldata-";

      // convert blob to url found at https://bugzilla.mozilla.org/show_bug.cgi?format=default&id=1271345
      console.log(mhtmlData);      
      var blobURL = window.URL.createObjectURL(mhtmlData);

      var downloadFileName = filepath+fileprefix+dateString+filetype+".mhtml";



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

  if(!engaged){
    return;
  }

    chrome.tabs.captureVisibleTab(function(screenshotUrl) {

      // resolution?

      var datePart = new Date();

      var dateString = datePart.toLocaleDateString().replace(new RegExp("(/|,| |:)", "g"),"-") 
                      + "-" + datePart.getHours() + 
                        "-" + datePart.getMinutes() + 
                        "-" + datePart.getSeconds() +
                        "-" + datePart.getMilliseconds();
      
      var filetype = "-screenshot-";
      
      //https://stackoverflow.com/questions/6718256/how-do-you-use-chrome-tabs-getcurrent-to-get-the-page-object-in-a-chrome-extensi
      chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
        console.log(tabs[0]);
        width = tabs[0].width;
        height = tabs[0].height;
      });

      var dimensions = "-" + width + "x" + height;

      var downloadFileName = filepath+fileprefix+dateString+filetype+dimensions+".jpg";

      chrome.downloads.download(
            {
              url:screenshotUrl, 
              filename: downloadFileName
            },function(downloadId){
          console.log(downloadFileName);
          console.log("download begin, the download is:" + downloadFileName);
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
      downloadScreenshot();
      engaged=true;
      chrome.browserAction.setIcon({path:"icons/green.png"});
      chrome.browserAction.setTitle({title:"Disengage The Observatron"});
    }
}

function configuredOnPageLoad(anObject){

  if(!engaged){
    return;
  }

  if(onPageLoad){
  
    console.log(anObject);

    chrome.pageCapture.saveAsMHTML({tabId: anObject.tabId}, downloadMHTML);
    // TODO: pass in the id of the newly opened tab
    downloadScreenshot();
  }
}


function configuredOnPageUpdated(tabId, changeInfo, tab){

  if(!engaged){
    return;
  }

  if(onPageUpdated){
    if (changeInfo.status == 'complete') {
      chrome.pageCapture.saveAsMHTML({tabId: tabId}, downloadMHTML);
      // TODO: pass in the id of the newly opened tab
      downloadScreenshot(); 

    }
  }
}