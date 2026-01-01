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
      function describeElement(el, indent) {
        if (!el) return '';
        let desc = indent + '- ' + el.tagName.toLowerCase();
        if (el.id) desc += ' id="' + el.id + '"';
        if (el.className) desc += ' class="' + el.className + '"';
        if (el.name) desc += ' name="' + el.name + '"';
        if (el.type) desc += ' type="' + el.type + '"';
        if (el.value) desc += ' value="' + el.value + '"';
        if (el.innerText && el.innerText.trim()) desc += ' text="' + el.innerText.trim().replace(/"/g, '\\\\"') + '"';
        for (let child of el.children) {
          desc += '\\n' + describeElement(child, indent + '  ');
        }
        return desc;
      }
$0 ? {outerHTML: $0.outerHTML, description: describeElement($0, ''), selector: getCSSSelector($0), rect: $0.getBoundingClientRect(), nodeType: $0.nodeType, nodeName: $0.nodeName} : null;
    `, (result, isException) => {
      if (isException) {
        console.error('DevTools: Error in updateElementData:', isException);
      } else if (result) {
        chrome.storage.local.set({selectedElement: result});
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
    
    function describeElement(el, indent) {
      if (!el) return '';
      let desc = indent + '- ' + el.tagName.toLowerCase();
      if (el.id) desc += ' id="' + el.id + '"';
      if (el.className) desc += ' class="' + el.className + '"';
      if (el.name) desc += ' name="' + el.name + '"';
      if (el.type) desc += ' type="' + el.type + '"';
      if (el.value) desc += ' value="' + el.value + '"';
      if (el.innerText && el.innerText.trim()) desc += ' text="' + el.innerText.trim().replace(/"/g, '\\\\"') + '"';
      for (let child of el.children) {
        desc += '\\n' + describeElement(child, indent + '  ');
      }
      return desc;
    }
$0 ? {outerHTML: $0.outerHTML, description: describeElement($0, ''), selector: getCSSSelector($0), rect: $0.getBoundingClientRect(), nodeType: $0.nodeType, nodeName: $0.nodeName} : null;
    `, (result, isException) => {
      if (isException) {
        console.error('DevTools: Error in updateElementData:', isException);
      } else if (result) {
        chrome.storage.local.set({selectedElement: result});
      }
    });
});