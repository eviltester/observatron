chrome.devtools.panels.create(
  "Test Observatron",
  "../icons/red.png",
  "../sidepanel/sidepanel.html"
);

// Store the inspected tab ID for sidepanel access
chrome.storage.local.set({inspectedTabId: chrome.devtools.inspectedWindow.tabId});

// Listen for messages from sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'updateElementData') {
chrome.devtools.inspectedWindow.eval(`
      function getCSSSelector(el) {
        if (el.id) return '#' + el.id;

        let path = [];
        let current = el;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let selector = current.nodeName.toLowerCase();

          // Add ID if available
          if (current.id) {
            selector = '#' + current.id;
            path.unshift(selector);
            break; // ID is unique, no need to go further
          }

          // Add classes - use classList for reliable parsing
          let classes = [];
          if (current.classList && current.classList.length > 0) {
            classes = Array.from(current.classList).filter(c => c && c !== 'hover' && c !== 'active' && c !== 'focus');
            if (classes.length > 0) {
              selector += '.' + classes.join('.');
            }
          }

          // Add other attributes for specificity
          if (current.name) {
            selector += '[name="' + current.name + '"]';
          }
          if (current.type && current.type !== 'text') {
            selector += '[type="' + current.type + '"]';
          }

          // Add nth-child if needed for uniqueness
          if (!current.id && classes.length === 0 && !current.name && !current.type) {
            let index = 1;
            let sibling = current.previousSibling;
            while (sibling) {
              if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
                index++;
              }
              sibling = sibling.previousSibling;
            }
            if (index > 1) {
              selector += ':nth-child(' + index + ')';
            }
          }

          path.unshift(selector);

          // Stop if we have enough specificity
          if (current.id || classes.length > 0 || current.name || current.type) {
            break;
          }

          current = current.parentNode;
        }

        return path.join(' > ');
      }
       function safeGetProperty(obj, prop, defaultValue = '') {
         try {
           const value = obj[prop];
           return value !== undefined ? String(value) : defaultValue;
         } catch (e) {
           return defaultValue;
         }
       }

       function describeElement(el, indent) {
         if (!el) return '';
         let desc = indent + '- ' + safeGetProperty(el, 'tagName', '').toLowerCase();

         const id = safeGetProperty(el, 'id');
         if (id) desc += ' id="' + id + '"';

         const className = safeGetProperty(el, 'className');
         if (className) desc += ' class="' + className + '"';

         const name = safeGetProperty(el, 'name');
         if (name) desc += ' name="' + name + '"';

         const type = safeGetProperty(el, 'type');
         if (type) desc += ' type="' + type + '"';

         const value = safeGetProperty(el, 'value');
         if (value) desc += ' value="' + value + '"';

         const innerText = safeGetProperty(el, 'innerText');
         if (innerText && innerText.trim()) desc += ' text="' + innerText.trim().replace(/"/g, '\\\\"') + '"';

         try {
           for (let child of el.children) {
             desc += '\\n' + describeElement(child, indent + '  ');
           }
         } catch (e) {
           // Ignore errors when accessing children
         }

         return desc;
       }
$0 ? {outerHTML: $0.outerHTML, description: describeElement($0, ''), selector: getCSSSelector($0), rect: $0.getBoundingClientRect(), nodeType: $0.nodeType, nodeName: $0.nodeName} : null;
    `, (result, isException) => {
      try {
        if (isException) {
          console.error('DevTools: Error in updateElementData:', isException);
        } else if (result) {
          if (!chrome || !chrome.storage || !chrome.storage.local) {
            // Extension context invalidated, storage not available
            return;
          }
          try {
            chrome.storage.local.set({selectedElement: result});
          } catch (error) {
            if (!error.message || !error.message.includes('Extension context invalidated')) {
              console.error('DevTools: Error setting selectedElement:', error);
            }
            // Ignore "Extension context invalidated" errors as they are expected when extension reloads
          }
        }
      } catch (error) {
        if (!error.message || !error.message.includes('Extension context invalidated')) {
          console.error('DevTools: Error in describeElement callback:', error);
        }
        // Ignore "Extension context invalidated" errors
      }
    });
  }
});

// Store selected element info in storage for sidepanel access
chrome.devtools.panels.elements.onSelectionChanged.addListener(() => {

  chrome.devtools.inspectedWindow.eval(`
    function getCSSSelector(el) {
      try {
        if (el.id) return '#' + el.id;

        let path = [];
        let current = el;
        let depth = 0; // Prevent infinite loops

        while (current && current.nodeType === Node.ELEMENT_NODE && depth < 10) {
          let selector = current.nodeName.toLowerCase();

          // Add ID if available
          if (current.id) {
            selector = '#' + current.id;
            path.unshift(selector);
            break; // ID is unique, no need to go further
          }

          // Add classes - use classList for reliable parsing
          let classes = [];
          if (current.classList && current.classList.length > 0) {
            classes = Array.from(current.classList).filter(c => c && c !== 'hover' && c !== 'active' && c !== 'focus');
            if (classes.length > 0) {
              selector += '.' + classes.join('.');
            }
          }

          // Add other attributes for specificity
          if (current.name) {
            selector += '[name="' + current.name + '"]';
          }
          if (current.type && current.type !== 'text') {
            selector += '[type="' + current.type + '"]';
          }

          // Add nth-child if needed for uniqueness
          if (!current.id && classes.length === 0 && !current.name && !current.type) {
            let index = 1;
            let sibling = current.previousSibling;
            while (sibling) {
              if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
                index++;
              }
              sibling = sibling.previousSibling;
            }
            if (index > 1) {
              selector += ':nth-child(' + index + ')';
            }
          }

          path.unshift(selector);

          // Stop if we have enough specificity
          if (current.id || classes.length > 0 || current.name || current.type) {
            break;
          }

          current = current.parentNode;
          depth++;
        }

        let result = path.length > 0 ? path.join(' > ') : el.nodeName.toLowerCase();
        return result;
      } catch (error) {
        return '';
      }
    }
    
    function validateCSSSelector(selector, targetElement) {
      try {
        const foundElement = document.querySelector(selector);
        return foundElement === targetElement;
      } catch (e) {
        return false;
      }
    }
    
    function safeGetProperty(obj, prop, defaultValue = '') {
      try {
        const value = obj[prop];
        return value !== undefined ? String(value) : defaultValue;
      } catch (e) {
        return defaultValue;
      }
    }

    function describeElement(el, indent) {
      if (!el) return '';
      let desc = indent + '- ' + safeGetProperty(el, 'tagName', '').toLowerCase();

      const id = safeGetProperty(el, 'id');
      if (id) desc += ' id="' + id + '"';

      const className = safeGetProperty(el, 'className');
      if (className) desc += ' class="' + className + '"';

      const name = safeGetProperty(el, 'name');
      if (name) desc += ' name="' + name + '"';

      const type = safeGetProperty(el, 'type');
      if (type) desc += ' type="' + type + '"';

      const value = safeGetProperty(el, 'value');
      if (value) desc += ' value="' + value + '"';

      const innerText = safeGetProperty(el, 'innerText');
      if (innerText && innerText.trim()) desc += ' text="' + innerText.trim().replace(/"/g, '\\\\"') + '"';

      try {
        for (let child of el.children) {
          desc += '\\n' + describeElement(child, indent + '  ');
        }
      } catch (e) {
        // Ignore errors when accessing children
      }

      return desc;
    }
$0 ? {outerHTML: $0.outerHTML, description: describeElement($0, ''), selector: getCSSSelector($0), rect: $0.getBoundingClientRect(), nodeType: $0.nodeType, nodeName: $0.nodeName} : null;
    `, (result, isException) => {
      try {
        if (isException) {
          console.error('DevTools: Error in updateElementData:', isException);
        } else if (result) {
          if (!chrome || !chrome.storage || !chrome.storage.local) {
            // Extension context invalidated, storage not available
            return;
          }
          try {
            chrome.storage.local.set({selectedElement: result});
          } catch (error) {
            if (!error.message || !error.message.includes('Extension context invalidated')) {
              console.error('DevTools: Error setting selectedElement:', error);
            }
            // Ignore "Extension context invalidated" errors as they are expected when extension reloads
          }
        }
      } catch (error) {
        if (!error.message || !error.message.includes('Extension context invalidated')) {
          console.error('DevTools: Error in describeElement callback:', error);
        }
        // Ignore "Extension context invalidated" errors
      }
    });
});