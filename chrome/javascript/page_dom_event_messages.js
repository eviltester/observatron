'use strict';

/*
  create the timeout event objects
  this prevents too many messages so we wait till the action is complete, e.g. stopped resizing
*/
var resizingTimeout = {timeout: 0, milliseconds: 300, message: {method: "resize"}};
var scrollingTimeout = {timeout: 0, milliseconds: 300, message: {method: "scrolled"}};
var dblClickTimeout = {timeout: 0, milliseconds: 0, message: {method: "screenshotdbl"}};

/*
  SETUP THE DEFAULTS FROM THE OBSERVATRON
*/

var isObservatronEngaged = false;
var engagedDomain = null;


// Listen for disconnection from background script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.method === 'observatronStatusChanged') {
    isObservatronEngaged = request.engaged;
    engagedDomain = request.domain;
  }
});


// TODO: other options might also have changed should handle that too
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
  console.log("requesting current status");
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
  Configure the event listeners to pass messages back to the worker.js

  NOTE: this does not capture element.value='value' changes because the attribute did not change
  e.g. in 7charVal - can't detect the output message for invalid and valid
*/

// capture input events
window.addEventListener(
  "input",
  (e) => {
    const el = e.target;

    if (el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement) {

            sendAMessage(
                {
                    method: "logUserEvent",
                    event: {
                        eventType: "inputValueChanged",
                        tag: el.tagName,
                        name: el.name,
                        id: el.id,
                        value: el.value
                      }
                }
            );
    }
  },
  true // capture phase (important!)
);

// click, anywhere
window.addEventListener(
  "click",
  (e) => {
    const el = e.target;

    sendAMessage(
        {
            method: "logUserEvent",
            event: {
                eventType: "clickedElement",
                tag: el.tagName,
                name: el.name,
                id: el.id,
                value: el.value,
                text: el.innerText.substring(0,50)
              }
        }
    );

  },
  true // capture phase (important!)
);




// MutationObserver for DOM changes
var mutationObserver = new MutationObserver(function(mutations) {
  // Only log if observatron is engaged and on correct domain
  if (!isObservatronEngaged) return;
  if (!engagedDomain) return;

  try {
    const currentDomain = window.location.hostname;
    if (currentDomain !== engagedDomain) return;

    // Serialize mutations to avoid DOM element serialization issues
    var serializedMutations = mutations.map(function(mutation) {
      return {
        type: mutation.type,
        targetTag: mutation.target.tagName,
        targetId: mutation.target.id,
        targetClass: mutation.target.className,
        addedNodesCount: mutation.addedNodes.length,
        removedNodesCount: mutation.removedNodes.length,
        attributeName: mutation.attributeName,
        oldValue: mutation.oldValue ? mutation.oldValue.substring(0, 100) : null,
        newValue: mutation.attributeName ? mutation.target.getAttribute(mutation.attributeName) : (mutation.target.innerText ? mutation.target.innerText.substring(0, 100) : null)
      };
    });

    sendAMessage(
        {
          method: "logUserEvent",
          event: {
            eventType: "domMutation",
            mutations: serializedMutations
          }
        }
    );
  } catch (e) {
    console.log("Failed to log mutation event:", e);
  }
});

// Start observing mutations on document body
if (document.body) {
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true
  });
} else {
  // If body not ready, wait for DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function() {
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true
    });
  });
}

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
      sendAMessage(timeoutVariable.message);
      timeoutVariable.timeout=0;
  }, timeoutVariable.milliseconds);
}

/*
    Generic sender for DOM based events to backend
    implements all checks to make sure we only auto track the enabled and engaged domains
*/
function sendAMessage( message){
  // Only send if all conditions are met
  if (!isObservatronEngaged) return;
  if (!engagedDomain) return;

  // Check if current page domain matches engaged domain
  try {
    const currentDomain = window.location.hostname;

    // TODO: engagedDomain should be a class and support multiple domains
    if (currentDomain !== engagedDomain) return;

    // All checks passed, send the message
    chrome.runtime.sendMessage(message, function(response) {
      // Handle response or errors
      if (chrome.runtime.lastError) {
        if (chrome.runtime.lastError.message.includes('Extension context invalidated') ||
            chrome.runtime.lastError.message.includes('message port closed')) {
            // ignore errors
        }
        // Don't log expected errors
        console.log("observatron lastError " + chrome.runtime.lastError)
      }
    });

  } catch (error) {
    // Extension context may be invalidated (service worker terminated)
    console.error("observatron error sending message: " + message.method);
  }
}

