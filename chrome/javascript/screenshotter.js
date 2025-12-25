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

var isObservatronEngaged = false;
var engagedDomain = null;
var isRuntimeConnected = true;
var isPageFromCache = false;

// Detect if page is loaded from back/forward cache
window.addEventListener('pageshow', function(event) {
  if (event.persisted) {
    isPageFromCache = true;
    console.log("Page loaded from back/forward cache");
  }
});

// Listen for disconnection from background script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.method === 'observatronStatusChanged') {
    isObservatronEngaged = request.engaged;
    engagedDomain = request.domain;
  }
});

// Check if runtime is still connected
function checkRuntimeConnection() {
  // Simple check without triggering runtime calls
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    isRuntimeConnected = false;
    return false;
  }

  // If runtime exists, assume it's connected (we'll handle errors in sendMessage)
  if (!isRuntimeConnected) {
    isRuntimeConnected = true;
    // Try to refresh status, but don't fail if it doesn't work
    try {
      chrome.storage.local.get(['observatron'], function(result) {
        if (result.observatron) {
          isObservatronEngaged = result.observatron.engaged;
        }
      });
    } catch (e) {
      // Ignore storage errors
    }
  }
  return true;
}

chrome.storage.onChanged.addListener(function(changes, namespace) {
  if(namespace === "local"){
    if(changes.hasOwnProperty("observatron")){
      isObservatronEngaged = changes["observatron"].newValue.engaged;
      // Note: domain changes are sent via message, not storage
    }
  }
});

// Load initial engagement status
chrome.storage.local.get(['observatron'], function(result) {
  if (result && result.observatron) {
    isObservatronEngaged = result.observatron.engaged;
    console.log("Initial observatron status loaded:", isObservatronEngaged);
  } else {
    console.log("No observatron status found in storage");
  }
});

// Request current status from background script
if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
  try {
    chrome.runtime.sendMessage({method: 'getStatus'}, function(response) {
      if (response) {
        isObservatronEngaged = response.engaged;
        engagedDomain = response.domain;
        console.log("Status received from background:", {engaged: isObservatronEngaged, domain: engagedDomain});
      }
      if (chrome.runtime.lastError) {
        console.log("Error requesting status:", chrome.runtime.lastError.message);
      }
    });
  } catch (e) {
    console.log("Failed to request status:", e);
  }
}

// Keep the original call for screenshotter settings
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

Not really screenshot - event capture
*/

window.addEventListener(
  "input",
  (e) => {
    const el = e.target;

    if (el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement) {

        try{
            chrome.runtime.sendMessage({
                method: "logUserEvent",
                event: {
                    eventType: "inputValueChanged",
                    tag: el.tagName,
                    name: el.name,
                    id: el.id,
                    value: el.value
                  }
                }, function(response) {
                    if (chrome.runtime.lastError) {
                       console.log("Error logging event status:", chrome.runtime.lastError.message);
                     }
                }
            );
        } catch (e) {
               console.log("Failed to request status:", e);
        }
    }
  },
  true // capture phase (important!)
);

window.addEventListener(
  "click",
  (e) => {
    const el = e.target;

        try{
            chrome.runtime.sendMessage({
                method: "logUserEvent",
                event: {
                    eventType: "clickedElement",
                    tag: el.tagName,
                    name: el.name,
                    id: el.id,
                    value: el.value,
                    text: el.innerText.substring(0,50)
                  }
                }, function(response) {
                    if (chrome.runtime.lastError) {
                       console.log("Error logging event status:", chrome.runtime.lastError.message);
                     }
                }
            );
        } catch (e) {
               console.log("Failed to request status:", e);
        }
  },
  true // capture phase (important!)
);



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
  // Only send if all conditions are met
  if (!isObservatronEngaged) return;
  if (!engagedDomain) return;
  if (isPageFromCache) return;
  if (!checkRuntimeConnection()) return;
  if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) return;

  // Check if current page domain matches engaged domain
  try {
    const currentDomain = window.location.hostname;
    if (currentDomain !== engagedDomain) return;

    // All checks passed, send the message
    chrome.runtime.sendMessage({method: timeoutVariable.messageName}, function(response) {
      // Handle response or errors
      if (chrome.runtime.lastError) {
        // Mark runtime as disconnected on persistent errors
        if (chrome.runtime.lastError.message.includes('Extension context invalidated') ||
            chrome.runtime.lastError.message.includes('message port closed')) {
          isRuntimeConnected = false;
        }
        // Don't log expected errors
      }
    });
    console.log(timeoutVariable.messageName + " sent");
    timeoutVariable.timeout = 0;
  } catch (error) {
    // Extension context may be invalidated (service worker terminated)
    isRuntimeConnected = false;
  }
}

