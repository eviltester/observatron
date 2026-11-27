'use strict';

const savedTrafficRulesKey = 'observatronTrafficRules';
const changeSavedTrafficRulesMethod = 'changeSavedTrafficRules';

function parseTrafficRules(input) {
    const rules = [];
    for (const [index, line] of input.split(/\r?\n/).entries()) {
        if (!line.trim()) continue;

        const equals = line.indexOf('=');
        const star = /\s\*\s/.exec(line);
        const isPattern = star !== null && (equals === -1 || star.index < equals);
        const separator = isPattern ? star.index + 1 : equals;
        const name = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        const text = !isPattern && isQuotedTrafficValue(value) ? value.slice(1, -1) : value;
        if (separator < 0 || !name || !text) {
            throw new Error(`Enter a name and search text on line ${index + 1}. Use name = text or name * pattern.`);
        }

        const rule = isPattern ? {name, text, mode: 'regex'} : {name, text};
        try {
            compileTrafficPattern(rule);
        } catch (error) {
            throw new Error(`Invalid regular expression on line ${index + 1}. ${error.message}`);
        }
        rules.push(rule);
    }
    return rules;
}

function isQuotedTrafficValue(value) {
    return value.length >= 2 && value.startsWith('"') && value.endsWith('"');
}

function compileTrafficPattern({text, mode}) {
    return mode === 'regex' ? new RegExp(text) : null;
}

function formatTrafficRule({name, text, mode}) {
    if (mode === 'regex') return `${name} * ${text}`;
    const value = text !== text.trim() || isQuotedTrafficValue(text) ? `"${text}"` : text;
    return `${name} = ${value}`;
}

function trafficRuleKey({name, text, mode}) {
    return JSON.stringify([name, text, mode]);
}

function uniqueTrafficRules(rules) {
    return [...new Map(rules.map(rule => [trafficRuleKey(rule), rule])).values()];
}

async function getSavedTrafficRules() {
    const stored = await chrome.storage.local.get(savedTrafficRulesKey);
    return stored[savedTrafficRulesKey] || [];
}

async function changeSavedTrafficRules(action, rules) {
    const response = await chrome.runtime.sendMessage({method: changeSavedTrafficRulesMethod, action, rules});
    if (!response?.success) throw new Error('Could not update saved traffic rules.');
}
