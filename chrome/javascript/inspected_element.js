'use strict';

function readInspectedElement() {
    return new Promise((resolve, reject) => {
        const expression = `(${describeSelectedElement.toString()})(typeof $0 === 'undefined' ? null : $0)`;
        chrome.devtools.inspectedWindow.eval(expression, (element, exception) => {
            if (exception) reject(new Error('Could not read the selected element. Select it again in DevTools → Elements.'));
            else resolve(element);
        });
    });
}

function describeSelectedElement(node, pageUrl = window.location.href) {
    if (node?.nodeType !== 1 || !node.isConnected || node.ownerDocument.defaultView?.top !== window.top) return null;

    function cssSelector(element) {
        const root = element.getRootNode();
        const path = [];
        for (let current = element; current; current = current.parentElement) {
            const id = current.id && `#${CSS.escape(current.id)}`;
            if (id && root.querySelector(id) === current) {
                path.unshift(id);
                break;
            }
            let selector = CSS.escape(current.localName);
            const siblings = Array.from(current.parentNode?.children || []).filter(sibling =>
                sibling.localName === current.localName && sibling.namespaceURI === current.namespaceURI);
            if (siblings.length > 1) selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
            path.unshift(selector);
        }
        return path.join(' > ');
    }

    function describe(element, indent = '') {
        const attributes = ['id', 'class', 'name', 'type'].map(name => {
            const value = element.getAttribute(name);
            return value ? ` ${name}=${JSON.stringify(value)}` : '';
        }).join('');
        const inputValue = typeof element.value === 'string' && element.value ? ` value=${JSON.stringify(element.value)}` : '';
        const text = element.innerText?.trim();
        const label = text ? ` text=${JSON.stringify(text)}` : '';
        return [`${indent}- ${element.localName}${attributes}${inputValue}${label}`,
            ...Array.from(element.children, child => describe(child, `${indent}  `))].join('\n');
    }

    return {
        pageUrl,
        elementUrl: node.ownerDocument.URL,
        inFrame: window !== window.top || node.ownerDocument !== document,
        inShadowRoot: node.getRootNode() !== node.ownerDocument,
        outerHTML: node.outerHTML,
        selector: cssSelector(node),
        description: describe(node)
    };
}
