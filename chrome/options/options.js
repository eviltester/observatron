'use strict';

var options = new Options();


chrome.storage.onChanged.addListener(function(changes, namespace) {
  if(namespace === "local"){
    if(changes.hasOwnProperty("observatron")){
      restore_options();
    }
  }
});



function getObservatronDefaults(){
    chrome.storage.local.get(['observatron'], setObservatronDefaults);
}

function save_options() {

    var newOptions = new Options(); // defaults are set so only set if valid

    newOptions.setOnResizeEvent(document.getElementById('onresize').checked);
    newOptions.setOnScrollEvent(document.getElementById('onscroll').checked);
    newOptions.setOnPageLoad(document.getElementById('onpageload').checked);
    newOptions.setOnPageUpdated(document.getElementById('onpageupdated').checked);
    newOptions.setOnDoubleClickShot(document.getElementById('ondoubleclick').checked);
    newOptions.setOnPostSubmit(document.getElementById('onpostformsubmit').checked);
    
    newOptions.setScrollingTimeoutMilliseconds(document.getElementById('scrolling_timeout').value);
    newOptions.setResizeTimeoutMilliseconds(document.getElementById('resize_timeout').value);
    
    newOptions.setFilePath(document.getElementById('filepath').value);
    newOptions.setFilePrefix(document.getElementById('fileprefix').value);    

    options = newOptions;

    chrome.storage.local.set({observatron: options}, function() {
      // Update status to let user know options were saved.
      var status = document.getElementById('status');
      status.textContent = 'Options saved.';
      setTimeout(function() {
        status.textContent = '';
      }, 750);
    });
  }
  
  // Restores select box and checkbox state using the preferences
  // stored in chrome.storage.
  function restore_options() {
        getObservatronDefaults();
  }

 



function setObservatronDefaults(setoptions){
  if(setoptions){
      options = setoptions.observatron;
        //console.log("set popup defaults from observatron");
        displayObservatronOptionsOnGUI(options);
  
  }
}

function displayObservatronOptionsOnGUI(options){
  //console.log(options);

  document.getElementById('onscroll').checked = options.onScrollEvent;
  document.getElementById('onresize').checked = options.onResizeEvent;
  document.getElementById('onpageload').checked = options.onPageLoad;
  document.getElementById('onpageupdated').checked = options.onPageUpdated;
  document.getElementById('ondoubleclick').checked = options.onDoubleClickShot;
  document.getElementById('onpostformsubmit').checked = options.onPostSubmit;
  document.getElementById('filepath').value = options.filepath;
  document.getElementById('fileprefix').value = options.fileprefix;
  document.getElementById('scrolling_timeout').value = options.scrolling_timeout_milliseconds;
  document.getElementById('resize_timeout').value = options.resize_timeout_milliseconds;
  
  setHeadingOnPage();

}

function set_defaults_on_gui(){

  // todo have the defaults in a shared file if possible
  var defaultOptions = new Options();

  displayObservatronOptionsOnGUI(defaultOptions);
}

function setHeadingOnPage(){

    var textToRender = "The Observatron - version " + chrome.runtime.getManifest().version;
    textToRender = textToRender + (options.engaged ? " (On)" : " (Off)");

    document.getElementById('optionsheading').innerHTML = textToRender;
}

/*
  Setup the page
*/

getObservatronDefaults();

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
document.getElementById('defaults').addEventListener('click', set_defaults_on_gui);
