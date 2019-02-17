'use strict';

/*
  create the timeout event objects
*/
var resizingTimeout = {timeout: 0, milliseconds: 300};
var scrollingTimeout = {timeout: 0, milliseconds: 300};
var dblClickTimeout = {timeout: 0, milliseconds: 0};

/*
  SETUP THE DEFAULTS FROM THE OBSERVATRON
*/

chrome.storage.local.get(['observatron_screenshotter'], setObservatronDefaults);


function setObservatronDefaults(options){
  if(options){
    scrollingTimeout["milliseconds"] = options.observatron_screenshotter.resize_timeout;
    resizingTimeout["milliseconds"] = options.observatron_screenshotter.scrolling_timeout;
    console.log("set defaults from observatron");
    console.log(options);
  }
}

/*
  Configure the event listeners to pass messages back to the background.js
*/
window.addEventListener('resize', sendResizeMessage, false);
window.addEventListener('scroll', sendScrollMessage, false);
window.addEventListener('dblclick', sendDblClickMessage, false);

function sendResizeMessage(){
  sendAMessageWhenTimeoutComplete(resizingTimeout, "resize");
}

function sendDblClickMessage(){
  sendAMessageWhenTimeoutComplete(dblClickTimeout, "screenshotdbl");
}

function sendScrollMessage(){
  sendAMessageWhenTimeoutComplete(scrollingTimeout, "scrolled");
}

/*
  Generic implementation for the message sending using timeouts
*/
function sendAMessageWhenTimeoutComplete( timeoutVariable, messageName){
  if (timeoutVariable.timeout) {
    clearTimeout(timeoutVariable.timeout);
  }

  timeoutVariable.timeout = setTimeout(function() {
    sendAMessage(timeoutVariable, messageName);
  }, timeoutVariable.milliseconds);
}

function sendAMessage( timeoutVariable, messageName){
  if(chrome.runtime!=undefined){
    chrome.runtime.sendMessage({method: messageName});
    console.log(messageName + " sent");
    timeoutVariable.timeout = 0;
  }
}

