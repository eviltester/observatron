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
var eventListenersActive = false;

// Store references to event listeners for removal
var eventListeners = {
  input: null,
  click: null,
  resize: null,
  scroll: null,
  dblclick: null
};

// Listen for disconnection from background script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.method === 'observatronStatusChanged') {
    isObservatronEngaged = request.engaged;
    engagedDomain = request.domain;
    updateEventListeners();
  }
});

// TODO: other options might also have changed should handle that too
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if(namespace === "local"){
    if(changes.hasOwnProperty("observatron")){
      isObservatronEngaged = changes["observatron"].newValue.engaged;
      // Note: domain changes are sent via message, not storage
      updateEventListeners();
    }
  }
});

// Load initial engagement status
chrome.storage.local.get(['observatron'], function(result) {
  if (result && result.observatron) {
    isObservatronEngaged = result.observatron.engaged;
    console.log("Initial observatron status loaded:", isObservatronEngaged);
    updateEventListeners();
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
        updateEventListeners();
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
  if(options && options.observatron_screenshotter){
    scrollingTimeout.milliseconds = options.observatron_screenshotter.resize_timeout;
    resizingTimeout.milliseconds = options.observatron_screenshotter.scrolling_timeout;
    console.log("set defaults from observatron");
    console.log(options);
  } else {
    console.log("No observatron_screenshotter options found, using defaults");
  }
}

/*
  Configure the event listeners to pass messages back to the worker.js

  NOTE: this does not capture element.value='value' changes because the attribute did not change
  e.g. in 7charVal - can't detect the output message for invalid and valid
*/

// Create event listener functions
function createInputEventListener() {
  return function(e) {
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
  };
}

function createClickEventListener() {
  return function(e) {
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
  };
}

function createResizeEventListener() {
  return function() {
    sendResizeMessage();
  };
}

function createScrollEventListener() {
  return function() {
    sendScrollMessage();
  };
}

function createDblClickEventListener() {
  return function() {
    sendDblClickMessage();
  };
}

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

// Function to add or remove event listeners based on observatron status
function updateEventListeners() {
  // Remove existing listeners if they exist
  if (eventListenersActive) {
    removeEventListeners();
  }

  // Add listeners if observatron is engaged
  if (isObservatronEngaged) {
    addEventListeners();
    eventListenersActive = true;
  } else {
    eventListenersActive = false;
  }
}

function addEventListeners() {
  // Create and store event listeners
  eventListeners.input = createInputEventListener();
  eventListeners.click = createClickEventListener();
  eventListeners.resize = createResizeEventListener();
  eventListeners.scroll = createScrollEventListener();
  eventListeners.dblclick = createDblClickEventListener();

  // Add event listeners
  window.addEventListener("input", eventListeners.input, true);
  window.addEventListener("click", eventListeners.click, true);
  window.addEventListener("resize", eventListeners.resize, false);
  window.addEventListener("scroll", eventListeners.scroll, false);
  window.addEventListener("dblclick", eventListeners.dblclick, false);
}

function removeEventListeners() {
  // Remove event listeners
  if (eventListeners.input) {
    window.removeEventListener("input", eventListeners.input, true);
  }
  if (eventListeners.click) {
    window.removeEventListener("click", eventListeners.click, true);
  }
  if (eventListeners.resize) {
    window.removeEventListener("resize", eventListeners.resize, false);
  }
  if (eventListeners.scroll) {
    window.removeEventListener("scroll", eventListeners.scroll, false);
  }
  if (eventListeners.dblclick) {
    window.removeEventListener("dblclick", eventListeners.dblclick, false);
  }

  // Clear references
  eventListeners.input = null;
  eventListeners.click = null;
  eventListeners.resize = null;
  eventListeners.scroll = null;
  eventListeners.dblclick = null;
}

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
            // ignore expected errors
            return;
        }
        // Log unexpected errors
        console.log("observatron lastError " + chrome.runtime.lastError)
      }
    });

  } catch (error) {
    // Extension context may be invalidated (service worker terminated)
    console.error("observatron error sending message: " + message.method);
  }
}

