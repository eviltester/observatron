'use strict';

/*
  create the timeout event objects
*/
var resizingTimeout = {timeout: 0, milliseconds: 300, messageName: "resize"};
var scrollingTimeout = {timeout: 0, milliseconds: 300, messageName: "scrolled"};
var dblClickTimeout = {timeout: 0, milliseconds: 0, messageName: "screenshotdbl"};

/*
  SETUP THE DEFAULTS FROM THE OBSERVATRON
*/

chrome.storage.local.get(['observatron_screenshotter'], setObservatronDefaults);


function setObservatronDefaults(options){
  if(options){
    scrollingTimeout.milliseconds = options.observatron_screenshotter.resize_timeout;
    resizingTimeout.milliseconds = options.observatron_screenshotter.scrolling_timeout;
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
  sendAMessageWhenTimeoutComplete(resizingTimeout);
}

function sendDblClickMessage(){
  sendAMessageWhenTimeoutComplete(dblClickTimeout);
}

function sendScrollMessage(){
  sendAMessageWhenTimeoutComplete(scrollingTimeout);
}

/*
  Generic implementation for the message sending using timeouts
*/
function sendAMessageWhenTimeoutComplete( timeoutVariable){
  if (timeoutVariable.timeout) {
    clearTimeout(timeoutVariable.timeout);
  }

  timeoutVariable.timeout = setTimeout(function() {
      sendAMessage(timeoutVariable);
  }, timeoutVariable.milliseconds);
}

function sendAMessage( timeoutVariable){
  if(chrome.runtime!=undefined && chrome.runtime.sendMessage){
    try {
      chrome.runtime.sendMessage({method: timeoutVariable.messageName});
      console.log(timeoutVariable.messageName + " sent");
      timeoutVariable.timeout = 0;
    } catch (error) {
      // Extension context may be invalidated (service worker terminated)
      console.log("Failed to send message - extension context invalidated:", error);
    }
  }
}

