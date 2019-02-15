'use strict';

var resizing = 0;
var scrolling = 0;
var scrolling_timeout_milliseconds=300;
var resize_timeout_milliseconds=300;

chrome.storage.local.get(['observatron_screenshotter'], setObservatronDefaults);


function setObservatronDefaults(options){
  if(options){
    scrolling_timeout_milliseconds = options.observatron_screenshotter.resize_timeout;
    resize_timeout_milliseconds = options.observatron_screenshotter.scrolling_timeout;
    console.log("set defaults from observatron");
    console.log(options);
  }
}



window.addEventListener('resize', function() {
  if (resizing) {
    clearTimeout(resizing);
  }
  if(chrome.runtime!=undefined){
    resizing = setTimeout(function() {
      chrome.runtime.sendMessage({method: 'resize'});
      console.log("resize sent");
      
      resizing = 0;
    }, resize_timeout_milliseconds);
  }
}, false);


window.addEventListener('scroll', function(event) {

  if (scrolling) {
    clearTimeout(scrolling);
  }

  if(chrome.runtime!=undefined){
    console.log("current timeout " +  scrolling_timeout_milliseconds);
    scrolling = setTimeout(function() {
      chrome.runtime.sendMessage({method: 'scrolled'});
      console.log("scrolled sent");
      scrolling = 0;
    }, scrolling_timeout_milliseconds);
  }

}, false);

window.addEventListener('dblclick', function(event) {

  if(chrome.runtime!=undefined){
      chrome.runtime.sendMessage({method: 'screenshotdbl'});
      console.log("screenshot sent from double click");
  }

}, false);