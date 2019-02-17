'use strict';

var options = {enabled: false};

getObservatronDefaults();

function getObservatronDefaults(){
    chrome.storage.local.get(['observatron'], setObservatronDefaults);
}



function save_options() {

    //var isEngaged = document.getElementById('observatrononoff').checked;
    var isOnScroll = document.getElementById('onscroll').checked;
    var isOnResize = document.getElementById('onresize').checked;
    var isOnPageload = document.getElementById('onpageload').checked;
    var isOnPageupdate = document.getElementById('onpageupdated').checked;
    var isOnPageDoubleClick = document.getElementById('ondoubleclick').checked;
    
    var filePath = document.getElementById('filepath').value;
    var fileprefix = document.getElementById('fileprefix').value;
    var scrollingtimeout = document.getElementById('scrolling_timeout').value;
    var resizetimeout = document.getElementById('resize_timeout').value;
    
    
    //options.engaged = isEngaged;
    options.onResizeEvent = isOnResize;
    options.onScrollEvent=isOnScroll;
    options.onPageLoad = isOnPageload;
    options.onPageUpdated = isOnPageupdate;
    options.onDoubleClickShot = isOnPageDoubleClick;

    options.filepath = filePath;
    if(!options.filepath){
      options.filepath = "";
    }
    options.fileprefix = fileprefix;
    if(!options.fileprefix){
      options.filepath = "";
    }

    if(isNaN(scrollingtimeout)){
      scrollingtimeout=500;
    }
    if(scrollingtimeout<0){
      scrollingtimeout=0;
    }

    if(isNaN(resizetimeout)){
      resizetimeout=500;
    }
    if(resizetimeout<0){
      resizetimeout=0;
    }

    options.scrolling_timeout_milliseconds = scrollingtimeout;
    options.resize_timeout_milliseconds = resizetimeout;

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

  document.addEventListener('DOMContentLoaded', restore_options);
  document.getElementById('save').addEventListener('click', save_options);

  document.getElementById('defaults').addEventListener('click', set_defaults_on_gui);
  document.getElementById('optionsheading').innerHTML = "The Observatron - version " + chrome.runtime.getManifest().version;



function setObservatronDefaults(setoptions){
  if(setoptions){
      options = setoptions.observatron;
        console.log("set popup defaults from observatron");
        displayObservatronOptionsOnGUI(options);
  
  }
}

function displayObservatronOptionsOnGUI(options){
  console.log(options);

  //document.getElementById('observatrononoff').checked = options.engaged;
  document.getElementById('onscroll').checked = options.onScrollEvent;
  document.getElementById('onresize').checked = options.onResizeEvent;
  document.getElementById('onpageload').checked = options.onPageLoad;
  document.getElementById('onpageupdated').checked = options.onPageUpdated;
  document.getElementById('ondoubleclick').checked = options.onDoubleClickShot;
  document.getElementById('filepath').value = options.filepath;
  document.getElementById('fileprefix').value = options.fileprefix;
  document.getElementById('scrolling_timeout').value = options.scrolling_timeout_milliseconds;
  document.getElementById('resize_timeout').value = options.resize_timeout_milliseconds;
}

function set_defaults_on_gui(){

  var defaultOptions = {
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

  };

  displayObservatronOptionsOnGUI(defaultOptions);
}

chrome.storage.onChanged.addListener(function(changes, namespace) {
  if(namespace === "local"){
    if(changes.hasOwnProperty("observatron")){
      restore_options();
    }
  }
});