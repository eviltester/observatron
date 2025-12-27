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
      $0 ? {outerHTML: $0.outerHTML, description: describeElement($0, '')} : null;
    `, (result, isException) => {
      if (!isException && result) {
        // Merge with existing data to preserve selector and rect
        chrome.storage.local.get(['selectedElement'], (existing) => {
          const updated = { ...existing.selectedElement, ...result };
          chrome.storage.local.set({selectedElement: updated});
        });
      }
    });
  }
});

// Store selected element info in storage for sidepanel access
chrome.devtools.panels.elements.onSelectionChanged.addListener(() => {

  // TODO: improve getXPath generation
  // when checking parent node, if that has an id then stop at that point
  // when checking parent node, if it has a data-id which is unique then use that and stop at that point
  // when checking node or parent node, if it has a data-testid which is unique then use that and stop at that point
  chrome.devtools.inspectedWindow.eval(`
    function getXPath(el) {
      if (el.id) return '//*[@id="' + el.id + '"]';
      let path = [];
      while (el.nodeType === Node.ELEMENT_NODE) {
        let index = 1;
        let previousSibling = el.previousSibling;
        while (previousSibling) {
          if (previousSibling.nodeType === Node.ELEMENT_NODE && previousSibling.nodeName === el.nodeName) {
            index++;
          }
          previousSibling = sibling.previousSibling;
        }
        let tagName = el.nodeName.toLowerCase();
        let pathSegment = index === 1 ? tagName : tagName + '[' + index + ']';
        path.unshift(pathSegment);
        el = el.parentNode;
      }
      return '/' + path.join('/');
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
    $0 ? {outerHTML: $0.outerHTML, description: describeElement($0, ''), selector: getXPath($0), rect: $0.getBoundingClientRect()} : null;
  `, (result, isException) => {
    if (!isException && result) {
      chrome.storage.local.set({selectedElement: result});
    }
  });
});