'use strict';

var options = {enabled: false};

getObservatronDefaults();

function getObservatronDefaults(){
    chrome.storage.local.get(['observatron'], setObservatronDefaults);
}

function setObservatronDefaults(setoptions){
    if(setoptions){
        options = setoptions.observatron;
          console.log("set popup defaults from observatron");
          console.log(options);

        //document.getElementById('observatrononoff').checked = options.engaged;
        document.getElementById('onscroll').checked = options.onScrollEvent;
        document.getElementById('onresize').checked = options.onResizeEvent;
        document.getElementById('onpageload').checked = options.onPageLoad;
        document.getElementById('onpageupdated').checked = options.onPageUpdated;
        document.getElementById('filepath').value = options.filepath;
        document.getElementById('fileprefix').value = options.fileprefix;
        document.getElementById('scrolling_timeout').value = options.scrolling_timeout_milliseconds;
        document.getElementById('resize_timeout').value = options.resize_timeout_milliseconds;
    
    }
  }

function save_options() {

    //var isEngaged = document.getElementById('observatrononoff').checked;
    var isOnScroll = document.getElementById('onscroll').checked;
    var isOnResize = document.getElementById('onresize').checked;
    var isOnPageload = document.getElementById('onpageload').checked;
    var isOnPageupdate = document.getElementById('onpageupdated').checked;
    var filePath = document.getElementById('filepath').value;
    var fileprefix = document.getElementById('fileprefix').value;
    var scrollingtimeout = document.getElementById('scrolling_timeout').value;
    var resizetimeout = document.getElementById('resize_timeout').value;
    
    //options.engaged = isEngaged;
    options.onResizeEvent = isOnResize;
    options.onScrollEvent=isOnScroll;
    options.onPageLoad = isOnPageload;
    options.onPageUpdated = isOnPageupdate;
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
  
function set_defaults_on_gui(){
  document.getElementById('onscroll').checked = true;
  document.getElementById('onresize').checked = true;
  document.getElementById('onpageload').checked = true;
  document.getElementById('onpageupdated').checked = true;
  document.getElementById('filepath').value = "observatron/";
  document.getElementById('fileprefix').value = "obs_";
  document.getElementById('scrolling_timeout').value = 500;
  document.getElementById('resize_timeout').value = 500;
}

chrome.storage.onChanged.addListener(function(changes, namespace) {
  if(namespace === "local"){
    if(changes.hasOwnProperty("observatron")){
      restore_options();
    }
  }
});