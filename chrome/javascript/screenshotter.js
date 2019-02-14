'use strict';

var resizing = 0;
var scrolling = 0;

window.addEventListener('resize', function() {
  if (resizing) {
    clearTimeout(resizing);
  }
  resizing = setTimeout(function() {
    chrome.runtime.sendMessage({method: 'resize'});
    console.log("resize sent");
    resizing = 0;
  }, 100);
}, false);


window.addEventListener('scroll', function(event) {
  if (scrolling) {
    clearTimeout(scrolling);
  }
  scrolling = setTimeout(function() {
    chrome.runtime.sendMessage({method: 'scrolled'});
    console.log("scrolled sent");
    scrolling = 0;
  }, 100);
}, false);