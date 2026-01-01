/**
 * Screenshot utility functions for element capture and cropping
 */

// Note: sanitizeRect is available globally via geometry_utils.js import in worker.js

// Export for testing (only in test environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getUpdatedRect: getUpdatedRect,
    cropElementScreenshot: cropElementScreenshot
  };
}

/**
 * Finds an element by selector and calculates its visible rectangle coordinates
 * @param {string} selector - CSS selector for the target element
 * @param {number} tabId - Chrome tab ID where element is located
 * @param {function} callback - Callback function receiving the calculated rect or null
 */
function getUpdatedRect(selector, tabId, callback) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    function: (selector) => {
      try {
        console.log('Attempting to find element with selector:', selector);
        if (!selector || selector.trim() === '') {
          console.warn('Empty or invalid selector provided');
          return null;
        }

        // Try to find element in main document
        let el = document.querySelector(selector);
        if (el) {
          console.log('Element found in main document:', el);
        } else {
          // Try to find in iframes
          console.log('Element not found in main document, checking iframes...');
          const iframes = document.querySelectorAll('iframe');
          for (const iframe of iframes) {
            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
              if (iframeDoc) {
                el = iframeDoc.querySelector(selector);
                if (el) {
                  console.log('Element found in iframe:', el);
                  break;
                }
              }
            } catch (e) {
              console.warn('Could not access iframe content:', e);
            }
          }
        }

        if (!el) {
          console.warn('Element not found with selector:', selector, 'in main document or iframes');
          return null;
        }

        // Check if element is still in the DOM and visible
        if (!document.contains(el) && !Array.from(document.querySelectorAll('iframe')).some(iframe => {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            return doc && doc.contains(el);
          } catch (e) {
            return false;
          }
        })) {
          console.warn('Element is no longer in the DOM');
          return null;
        }

        // Get element position relative to document BEFORE scrolling
        function getElementPositionRelativeToDocument(element) {
          let rect = element.getBoundingClientRect();
          let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          let scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

          return {
            top: rect.top + scrollTop,
            left: rect.left + scrollLeft,
            width: rect.width,
            height: rect.height
          };
        }

        const elementPosition = getElementPositionRelativeToDocument(el);
        console.log('Element position relative to document:', elementPosition);

        // Scroll element into view to ensure it's visible
        el.scrollIntoView({ block: 'center', inline: 'center' });

        // Wait a bit for scroll to complete
        return new Promise((resolve) => {
          setTimeout(() => {
            // Now get the element's position relative to the viewport
            const rect = el.getBoundingClientRect();
            console.log('Element rect after scrolling:', rect);

            if (!isFinite(rect.left) || !isFinite(rect.top) || !isFinite(rect.width) || !isFinite(rect.height)) {
              console.warn('Invalid rect for element:', rect);
              resolve(null);
              return;
            }

            if (rect.width <= 0 || rect.height <= 0) {
              console.warn('Element has zero size:', rect);
              resolve(null);
              return;
            }

            // Ensure element is within viewport bounds
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Calculate visible portion of element
            const visibleRect = {
              left: Math.max(0, rect.left),
              top: Math.max(0, rect.top),
              width: Math.min(viewportWidth - Math.max(0, rect.left), rect.width),
              height: Math.min(viewportHeight - Math.max(0, rect.top), rect.height)
            };

            console.log('Visible rect before scaling:', visibleRect);

            if (visibleRect.width <= 0 || visibleRect.height <= 0) {
              console.warn('Element not visible in viewport:', visibleRect);
              resolve(null);
              return;
            }

            // captureVisibleTab captures the viewport, so use viewport-relative coordinates
            // The screenshot is already scaled by devicePixelRatio, so we need to account for that
            const scale = window.devicePixelRatio;
            const scaledRect = {
              left: Math.round(visibleRect.left * scale),
              top: Math.round(visibleRect.top * scale),
              width: Math.round(visibleRect.width * scale),
              height: Math.round(visibleRect.height * scale)
            };

            console.log('Final scaled rect for cropping:', scaledRect);
            console.log('Device pixel ratio:', scale);
            console.log('Viewport dimensions:', { width: viewportWidth, height: viewportHeight });

            resolve(scaledRect);
          }, 300); // Longer delay to ensure scroll completes and element is positioned
        });
      } catch (error) {
        console.error('Error getting element rect:', error);
        return null;
      }
    },
    args: [selector]
  }, (results) => {
    if (chrome.runtime.lastError) {
      console.warn('Script execution error:', chrome.runtime.lastError);
      callback(null);
      return;
    }
    if (!results || !results[0]) {
      console.warn('No script results');
      callback(null);
      return;
    }
    const result = results[0].result;
    if (!result || typeof result !== 'object' ||
        typeof result.left !== 'number' || !isFinite(result.left) ||
        typeof result.top !== 'number' || !isFinite(result.top) ||
        typeof result.width !== 'number' || !isFinite(result.width) ||
        typeof result.height !== 'number' || !isFinite(result.height)) {
      console.warn('Invalid result from script:', result);
      callback(null);
      return;
    }
    const sanitized = sanitizeRect(result);
    console.log('Using sanitized rect for cropping:', sanitized);
    callback(sanitized);
  });
}

/**
 * Crops a screenshot image based on provided rectangle coordinates
 * @param {string} dataURL - Base64 encoded screenshot data URL
 * @param {object} rect - Rectangle coordinates {left, top, width, height}
 * @param {number} tabId - Chrome tab ID for script execution
 * @param {function} callback - Callback function receiving cropped data URL or null
 */
function cropElementScreenshot(dataURL, rect, tabId, callback) {
  chrome.storage.local.set({tempDataURL: dataURL}, () => {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: (left, top, width, height) => {
        return new Promise((resolve) => {
          chrome.storage.local.get(['tempDataURL'], (result) => {
            const dataURL = result.tempDataURL;
            chrome.storage.local.remove('tempDataURL');
            const w = Math.max(1, Math.floor(width));
            const h = Math.max(1, Math.floor(height));
            if (w <= 0 || h <= 0) {
              resolve(dataURL);
              return;
            }
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = w;
              canvas.height = h;

              // Validate and adjust crop coordinates
              const imgWidth = img.width;
              const imgHeight = img.height;
              const validatedRect = {
                left: Math.max(0, Math.min(left, imgWidth)),
                top: Math.max(0, Math.min(top, imgHeight)),
                width: Math.max(1, Math.min(width, imgWidth - Math.max(0, left))),
                height: Math.max(1, Math.min(height, imgHeight - Math.max(0, top)))
              };

              // Ensure the crop area is valid
              if (validatedRect.width <= 0 || validatedRect.height <= 0) {
                resolve(dataURL); // Return original if crop area is invalid
                return;
              }

              console.log('Cropping with validated rect:', validatedRect, 'from image size:', { width: imgWidth, height: imgHeight });

              ctx.drawImage(img, validatedRect.left, validatedRect.top, validatedRect.width, validatedRect.height, 0, 0, w, h);
              resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => {
              resolve(dataURL);
            };
            img.src = dataURL;
          });
        });
      },
      args: [rect.left, rect.top, rect.width, rect.height]
    }, (results) => {
      callback(results && results[0] && results[0].result ? results[0].result : null);
    });
  });
}