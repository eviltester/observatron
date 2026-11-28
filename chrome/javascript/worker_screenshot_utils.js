/**
 * Find the visible part of the selected element in the screenshot's page.
 */
function getUpdatedRect(selector, tabId, callback, scope) {
  chrome.scripting.executeScript({
    target: scope?.finding ? {tabId, documentIds: [scope.finding.documentId]} : {tabId},
    func: (selector, scope) => {
      if (scope && window.location.href !== scope.pageUrl) return null;

      function findElement(doc) {
        if (!doc || (scope && doc.URL !== scope.elementUrl)) return null;
        return doc.querySelector(selector);
      }

      let frame;
      let element;
      if (scope?.finding) {
        const {scanId, index} = scope.finding;
        const scan = globalThis.observatronAccessibilityScan;
        if (scan?.id !== scanId) return {error: 'This report is out of date. Run the check again.'};
        element = scan.elements[index]?.deref();
        if (!element?.isConnected) return {error: 'The reported element is no longer available. Run the check again.'};
      } else if (scope?.singleMatch) {
        let matches;
        try {
          matches = document.querySelectorAll(selector);
        } catch {
          return {error: 'Enter a valid CSS selector.'};
        }
        if (!matches.length) return {error: 'The CSS selector did not match any element in the main document.'};
        if (matches.length > 1) return {error: `The CSS selector matched ${matches.length} elements. Use a selector that matches just one.`};
        [element] = matches;
      } else {
        if (!selector?.trim()) return null;
        try {
          if (!scope?.inFrame) element = findElement(document);
          if (!element && (!scope || scope.inFrame)) {
            for (const iframe of document.querySelectorAll('iframe')) {
              const candidate = findElement(iframe.contentDocument);
              if (!candidate) continue;
              if (element) return null;
              frame = iframe;
              element = candidate;
              if (!scope) break;
            }
          }
        } catch {
          return null;
        }
      }
      if (!element?.isConnected) return null;
      element.scrollIntoView({block: 'center', inline: 'center'});

      return new Promise(resolve => {
        setTimeout(() => {
          if (!element.isConnected || (frame && !frame.isConnected) ||
              (scope && (window.location.href !== scope.pageUrl || element.ownerDocument.URL !== scope.elementUrl)) ||
              getComputedStyle(element).visibility !== 'visible') {
            resolve(null);
            return;
          }

          const rect = element.getBoundingClientRect();
          const frameRect = frame?.getBoundingClientRect();
          const frameLeft = frameRect ? frameRect.left + frame.clientLeft : 0;
          const frameTop = frameRect ? frameRect.top + frame.clientTop : 0;
          const frameRight = frame ? frameLeft + frame.clientWidth : window.innerWidth;
          const frameBottom = frame ? frameTop + frame.clientHeight : window.innerHeight;
          const left = Math.max(0, frameLeft, frameLeft + rect.left);
          const top = Math.max(0, frameTop, frameTop + rect.top);
          const right = Math.min(window.innerWidth, frameRight, frameLeft + rect.right);
          const bottom = Math.min(window.innerHeight, frameBottom, frameTop + rect.bottom);
          const scale = window.devicePixelRatio;
          if (right <= left || bottom <= top) {
            resolve(null);
            return;
          }
          resolve({
            left: Math.round(left * scale), top: Math.round(top * scale),
            width: Math.round((right - left) * scale), height: Math.round((bottom - top) * scale)
          });
        }, 300);
      });
    },
    args: scope ? [selector, scope] : [selector]
  }, results => {
    const failure = chrome.runtime.lastError;
    const {result: rect, documentId} = results?.[0] || {};
    if (failure && scope?.finding) {
      callback(null, 'The scanned page is no longer available. Run the check again.');
    } else if (rect?.error) {
      callback(null, rect.error);
    } else if (failure || !rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) {
      callback(null);
    } else if (documentId) {
      callback(sanitizeRect(rect), undefined, documentId);
    } else {
      callback(sanitizeRect(rect));
    }
  });
}

/**
 * Crop the supplied image in an isolated world in the target tab.
 */
function cropElementScreenshot(dataURL, rect, tabId, callback, documentId) {
  chrome.scripting.executeScript({
    target: documentId ? {tabId, documentIds: [documentId]} : {tabId},
    func: (dataURL, left, top, width, height) => new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const cropLeft = Math.max(0, Math.floor(left));
        const cropTop = Math.max(0, Math.floor(top));
        const cropWidth = Math.min(img.width - cropLeft, Math.floor(width));
        const cropHeight = Math.min(img.height - cropTop, Math.floor(height));
        if (cropWidth <= 0 || cropHeight <= 0) {
          resolve(null);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        canvas.getContext('2d').drawImage(img, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = dataURL;
    }),
    args: [dataURL, rect.left, rect.top, rect.width, rect.height]
  }, results => callback(chrome.runtime.lastError ? null : results?.[0]?.result || null));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {getUpdatedRect, cropElementScreenshot};
}
