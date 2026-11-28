'use strict';

function buildOptionsUI(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Check if already built
    if (container.querySelector('.event-logging-section')) return;

    // Clear existing content
    container.innerHTML = '';

    // Create heading
    const h1 = document.createElement('h1');
    h1.id = 'optionsheading';
    h1.textContent = 'Observatron Options';
    container.appendChild(h1);

    const saveOnLeave = container.hasAttribute('data-save-on-leave');
    const statusDiv = document.createElement('div');
    statusDiv.id = 'status';
    statusDiv.setAttribute('role', 'status');
    if (saveOnLeave) {
        const hint = document.createElement('p');
        hint.textContent = 'Settings save when you switch tabs.';
        container.append(hint, statusDiv);
    }

    // Defaults button
    const defaultsDiv = document.createElement('div');
    const defaultsBtn = document.createElement('button');
    defaultsBtn.id = 'defaults';
    defaultsBtn.textContent = 'Set To Defaults';
    defaultsDiv.appendChild(defaultsBtn);
    container.appendChild(defaultsDiv);

    // Screenshots Configuration
    const h2Screenshots = document.createElement('h2');
    h2Screenshots.textContent = 'Screenshots Configuration';
    container.appendChild(h2Screenshots);
    const pScreenshots = document.createElement('p');
    pScreenshots.textContent = 'Take screenshots based on various events:';
    container.appendChild(pScreenshots);

    // Checkboxes for screenshots
    const screenshotCheckboxes = [
        {id: 'onscroll', label: 'On Scroll'},
        {id: 'onresize', label: 'On Resize'},
        {id: 'ondoubleclick', label: 'Screenshot On Double click'}
    ];
    screenshotCheckboxes.forEach(cb => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = cb.id;
        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + cb.label));
        container.appendChild(label);
        container.appendChild(document.createElement('br'));
    });

    // Screenshots and Snapshot Logging sub-section
    const h3Screenshots = document.createElement('h3');
    h3Screenshots.textContent = 'Screenshots and Snapshot Logging';
    container.appendChild(h3Screenshots);
    const pSnapshotLogging = document.createElement('p');
    pSnapshotLogging.textContent = 'Take screenshots and save MHTML snapshots on page events:';
    container.appendChild(pSnapshotLogging);

    const snapshotCheckboxes = [
        {id: 'onpageload', label: 'On Page Load'},
        {id: 'onpageupdated', label: 'On Page Updated'}
    ];

    snapshotCheckboxes.forEach(cb => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = cb.id;
        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + cb.label));
        container.appendChild(label);
        container.appendChild(document.createElement('br'));
    });

    // Event Logging section
    const h2EventLogging = document.createElement('h2');
    h2EventLogging.textContent = 'Event Logging';
    h2EventLogging.className = 'event-logging-section';
    container.appendChild(h2EventLogging);
    const pEventLogging = document.createElement('p');
    pEventLogging.textContent = 'Log specific events without taking screenshots or saving MHTML:';
    container.appendChild(pEventLogging);

    const eventLoggingCheckboxes = [
        {id: 'onpostformsubmit', label: 'Log POST form contents to a file'},
        {id: 'onpageloaddetecthtmlcomments', label: 'On Page Load - Detect HTML Comments'},
        {id: 'onpageloadaccessibilityreview', label: 'On Page Load - Run Accessibility Review'},
        {id: 'auto-console-logging', label: 'Console Logging'},
        {id: 'auto-traffic-monitoring', label: 'Traffic Monitoring'},
        {id: 'auto-network-errors', label: 'Network Errors'},
        {id: 'onreportbrokenlinks', label: 'On Page Load - Report Broken Links'},
        {id: 'onreportbrokenimages', label: 'On Page Load - Report Broken Images'},
        {id: 'onpagemutation', label: 'On Page Mutation'},
        {id: 'oninputchanges', label: 'Log Input Changes'},
        {id: 'onclickevents', label: 'Log Click Events'}
    ];
    eventLoggingCheckboxes.forEach(cb => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = cb.id;
        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + cb.label));
        container.appendChild(label);
        container.appendChild(document.createElement('br'));
        if (cb.id === 'onpageloaddetecthtmlcomments') {
            container.appendChild(reviewOutputChoices(input, 'html-comments-output', 'HTML comment output',
                'Log comments as AutoNotes', 'Log as HTML Comments Report'));
        }
        if (cb.id === 'onpageloadaccessibilityreview') {
            container.appendChild(reviewOutputChoices(input, 'accessibility-output', 'Accessibility review output',
                'Log accessibility findings as AutoNotes', 'Log as Accessibility Report'));
        }
        if (cb.id === 'auto-network-errors') {
            container.appendChild(reviewOutputChoices(input, 'network-errors-output', 'Network Errors output',
                'Log network errors as AutoNotes', 'Log as Network Errors Report'));
        }
        if (cb.id === 'onreportbrokenlinks') {
            container.appendChild(reviewOutputChoices(input, 'broken-links-output', 'Broken links output',
                'Log broken links as AutoNotes', 'Log as Broken Links Report'));
        }
        if (cb.id === 'onreportbrokenimages') {
            container.appendChild(reviewOutputChoices(input, 'broken-images-output', 'Broken images output',
                'Log broken images as AutoNotes', 'Log as Broken Images Report'));
        }
    });

    // Output Configuration
    const h2Output = document.createElement('h2');
    h2Output.textContent = 'Output Configuration';
    container.appendChild(h2Output);
    container.appendChild(document.createElement('br'));

    const filepathLabel = document.createElement('label');
    const filepathInput = document.createElement('input');
    filepathInput.type = 'text';
    filepathInput.id = 'filepath';
    filepathLabel.appendChild(filepathInput);
    filepathLabel.appendChild(document.createTextNode(' FilePath in Downloads:'));
    container.appendChild(filepathLabel);
    container.appendChild(document.createElement('br'));

    const fileprefixLabel = document.createElement('label');
    const fileprefixInput = document.createElement('input');
    fileprefixInput.type = 'text';
    fileprefixInput.id = 'fileprefix';
    fileprefixLabel.appendChild(fileprefixInput);
    fileprefixLabel.appendChild(document.createTextNode(' File Prefix:'));
    container.appendChild(fileprefixLabel);
    container.appendChild(document.createElement('br'));

    const sessionNameLabel = document.createElement('label');
    const sessionNameInput = document.createElement('input');
    sessionNameInput.type = 'text';
    sessionNameInput.id = 'sessionname';
    sessionNameLabel.appendChild(sessionNameInput);
    sessionNameLabel.appendChild(document.createTextNode(' Session Name:'));
    container.appendChild(sessionNameLabel);
    container.appendChild(document.createElement('br'));

    const folderStructureLabel = document.createElement('label');
    const folderStructureSelect = document.createElement('select');
    folderStructureSelect.id = 'folderStructure';
    folderStructureSelect.appendChild(new Option('Nested folders (2025/12/28/session)', 'nested'));
    folderStructureSelect.appendChild(new Option('Flat folder (2025-12-28-session)', 'flat'));
    folderStructureLabel.appendChild(folderStructureSelect);
    folderStructureLabel.appendChild(document.createTextNode(' Folder Structure:'));
    container.appendChild(folderStructureLabel);
    container.appendChild(document.createElement('br'));

    // Timing Configuration
    const h2Timing = document.createElement('h2');
    h2Timing.textContent = 'Timing Configuration';
    container.appendChild(h2Timing);

    const scrollingLabel = document.createElement('label');
    const scrollingInput = document.createElement('input');
    scrollingInput.type = 'number';
    scrollingInput.id = 'scrolling_timeout';
    scrollingLabel.appendChild(scrollingInput);
    scrollingLabel.appendChild(document.createTextNode(' Scrolling Timeout Milliseconds:'));
    container.appendChild(scrollingLabel);
    container.appendChild(document.createElement('br'));

    const resizeLabel = document.createElement('label');
    const resizeInput = document.createElement('input');
    resizeInput.type = 'number';
    resizeInput.id = 'resize_timeout';
    resizeLabel.appendChild(resizeInput);
    resizeLabel.appendChild(document.createTextNode(' Resize Timeout Milliseconds:'));
    container.appendChild(resizeLabel);
    container.appendChild(document.createElement('br'));

    const brokenLinksTimeoutLabel = document.createElement('label');
    const brokenLinksTimeoutInput = document.createElement('input');
    brokenLinksTimeoutInput.type = 'number';
    brokenLinksTimeoutInput.id = 'report_broken_links_timeout';
    brokenLinksTimeoutLabel.appendChild(brokenLinksTimeoutInput);
    brokenLinksTimeoutLabel.appendChild(document.createTextNode(' Broken Links Fetch Timeout Milliseconds:'));
    container.appendChild(brokenLinksTimeoutLabel);
    container.appendChild(document.createElement('br'));

    const brokenLinksDelayLabel = document.createElement('label');
    const brokenLinksDelayInput = document.createElement('input');
    brokenLinksDelayInput.type = 'number';
    brokenLinksDelayInput.id = 'report_broken_links_delay';
    brokenLinksDelayLabel.appendChild(brokenLinksDelayInput);
    brokenLinksDelayLabel.appendChild(document.createTextNode(' Broken Links Check Delay Milliseconds:'));
    container.appendChild(brokenLinksDelayLabel);
    container.appendChild(document.createElement('br'));

    const brokenImagesTimeoutLabel = document.createElement('label');
    const brokenImagesTimeoutInput = document.createElement('input');
    brokenImagesTimeoutInput.type = 'number';
    brokenImagesTimeoutInput.id = 'report_broken_images_timeout';
    brokenImagesTimeoutLabel.appendChild(brokenImagesTimeoutInput);
    brokenImagesTimeoutLabel.appendChild(document.createTextNode(' Broken Images Fetch Timeout Milliseconds:'));
    container.appendChild(brokenImagesTimeoutLabel);
    container.appendChild(document.createElement('br'));

    const brokenImagesDelayLabel = document.createElement('label');
    const brokenImagesDelayInput = document.createElement('input');
    brokenImagesDelayInput.type = 'number';
    brokenImagesDelayInput.id = 'report_broken_images_delay';
    brokenImagesDelayLabel.appendChild(brokenImagesDelayInput);
    brokenImagesDelayLabel.appendChild(document.createTextNode(' Broken Images Check Delay Milliseconds:'));
    container.appendChild(brokenImagesDelayLabel);
    container.appendChild(document.createElement('br'));

    if (!saveOnLeave) {
        const h2Save = document.createElement('h2');
        h2Save.textContent = 'Remember to save changes';
        const saveBtn = document.createElement('button');
        saveBtn.id = 'save';
        saveBtn.type = 'button';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', () => saveOptions());
        container.append(h2Save, statusDiv, saveBtn);
    }
    buildSavedTrafficRulesUI(container);
}

function reviewOutputChoices(enable, name, label, notesLabel, reportLabel) {
    const choices = document.createElement('fieldset');
    choices.id = `${name}-options`;
    choices.setAttribute('aria-label', label);
    choices.style.cssText = 'margin-inline-start: 1.5rem; padding: 0; border: 0;';
    for (const [value, text] of [['notes', notesLabel], ['report', reportLabel]]) {
        const choice = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = name;
        radio.value = value;
        radio.checked = value === 'report';
        choice.append(radio, ` ${text}`);
        choices.append(choice, document.createElement('br'));
    }
    choices.disabled = !enable.checked;
    enable.addEventListener('change', () => { choices.disabled = !enable.checked; });
    return choices;
}

function showReviewOutput(name, output, enabled) {
    const value = output === 'notes' ? 'notes' : 'report';
    document.querySelector(`input[name="${name}"][value="${value}"]`).checked = true;
    document.getElementById(`${name}-options`).disabled = !enabled;
}

function buildSavedTrafficRulesUI(container) {
    const section = document.createElement('section');
    section.innerHTML = `
        <h2>Saved Traffic Rules</h2>
        <p>These rules are available the next time you start Traffic Monitor.</p>
        <form>
            <label for="saved-traffic-rule-input">New rules (one per line)</label>
            <details id="saved-traffic-rule-syntax">
                <summary>Rule syntax</summary>
                <ul>
                    <li><code>name = text</code> matches a literal substring.</li>
                    <li><code>name = " text "</code> preserves the spaces inside the quotes.</li>
                    <li><code>name = ""ok""</code> matches <code>"ok"</code>. Type the inner quotes directly.</li>
                    <li><code>name * pattern</code> uses a JavaScript regular expression.</li>
                </ul>
            </details>
            <textarea id="saved-traffic-rule-input" aria-describedby="saved-traffic-rule-syntax" rows="3" cols="44" spellcheck="false" required></textarea><br>
            <button type="submit">Add to Saved Rules</button>
        </form>
        <p id="saved-traffic-rules-status" role="status"></p>
        <p id="saved-traffic-rules-empty" hidden>No saved traffic rules.</p>
        <ul id="saved-traffic-rules" aria-label="Saved traffic rules"></ul>`;
    container.appendChild(section);

    const form = section.querySelector('form');
    const input = section.querySelector('textarea');
    const add = form.querySelector('button');
    const list = section.querySelector('#saved-traffic-rules');
    const status = section.querySelector('#saved-traffic-rules-status');
    const empty = section.querySelector('#saved-traffic-rules-empty');

    form.addEventListener('submit', async event => {
        event.preventDefault();
        input.readOnly = true;
        add.disabled = true;
        try {
            const rules = parseTrafficRules(input.value);
            if (!rules.length) throw new Error('Enter at least one search rule.');
            await changeSavedTrafficRules('add', rules);
            input.value = '';
            status.textContent = 'Traffic rules saved.';
        } catch (error) {
            status.textContent = error.message;
        } finally {
            input.readOnly = false;
            add.disabled = false;
            input.focus();
        }
    });

    let receivedUpdate = false;
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !changes[savedTrafficRulesKey]) return;
        receivedUpdate = true;
        renderRules(changes[savedTrafficRulesKey].newValue || []);
    });
    getSavedTrafficRules().then(rules => {
        if (!receivedUpdate) renderRules(rules);
    }).catch(() => {
        if (!receivedUpdate) status.textContent = 'Could not load saved traffic rules.';
    });

    function renderRules(rules) {
        empty.hidden = rules.length > 0;
        list.replaceChildren(...rules.map(rule => {
            const item = document.createElement('li');
            const text = document.createElement('code');
            text.textContent = formatTrafficRule(rule);
            text.style.whiteSpace = 'pre-wrap';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = 'Remove';
            remove.setAttribute('aria-label', `Remove ${text.textContent}`);
            remove.addEventListener('click', async () => {
                remove.disabled = true;
                try {
                    await changeSavedTrafficRules('remove', [rule]);
                    status.textContent = 'Traffic rule removed.';
                } catch (error) {
                    status.textContent = error.message;
                    remove.disabled = false;
                    remove.focus();
                }
            });
            item.append(text, ' ', remove);
            return item;
        }));
    }
}

let options = getDefaultOptions();
let optionsFormBaseline;
let optionsStatusTimer;

function readOptionsForm() {
    const newOptions = new Options();
    newOptions.setOnResizeEvent(document.getElementById('onresize').checked);
    newOptions.setOnScrollEvent(document.getElementById('onscroll').checked);
    newOptions.setOnPageLoad(document.getElementById('onpageload').checked);
    newOptions.setOnPageUpdated(document.getElementById('onpageupdated').checked);
    newOptions.setOnDoubleClickShot(document.getElementById('ondoubleclick').checked);
    newOptions.setOnPostSubmit(document.getElementById('onpostformsubmit').checked);
    newOptions.setOnPageLoadDetectHtmlComments(document.getElementById('onpageloaddetecthtmlcomments').checked);
    newOptions.setHtmlCommentsOutput(document.querySelector('input[name="html-comments-output"]:checked').value);
    newOptions.setOnPageLoadAccessibilityReview(document.getElementById('onpageloadaccessibilityreview').checked);
    newOptions.setAccessibilityOutput(document.querySelector('input[name="accessibility-output"]:checked').value);
    newOptions.autoConsoleLogging = document.getElementById('auto-console-logging').checked;
    newOptions.autoTrafficMonitoring = document.getElementById('auto-traffic-monitoring').checked;
    newOptions.autoNetworkErrors = document.getElementById('auto-network-errors').checked;
    newOptions.networkErrorsOutput = document.querySelector('input[name="network-errors-output"]:checked').value;
    newOptions.setOnReportBrokenLinks(document.getElementById('onreportbrokenlinks').checked);
    newOptions.setOnReportBrokenImages(document.getElementById('onreportbrokenimages').checked);
    newOptions.brokenLinksOutput = document.querySelector('input[name="broken-links-output"]:checked').value;
    newOptions.brokenImagesOutput = document.querySelector('input[name="broken-images-output"]:checked').value;
    newOptions.setOnPageMutation(document.getElementById('onpagemutation').checked);
    newOptions.setOnInputChanges(document.getElementById('oninputchanges').checked);
    newOptions.setOnClickEvents(document.getElementById('onclickevents').checked);

    newOptions.setScrollingTimeoutMilliseconds(document.getElementById('scrolling_timeout').value);
    newOptions.setResizeTimeoutMilliseconds(document.getElementById('resize_timeout').value);
    newOptions.setReportBrokenLinksTimeoutMs(document.getElementById('report_broken_links_timeout').value);
    newOptions.setReportBrokenLinksCheckDelayMs(document.getElementById('report_broken_links_delay').value);
    newOptions.setReportBrokenImagesTimeoutMs(document.getElementById('report_broken_images_timeout').value);
    newOptions.setReportBrokenImagesCheckDelayMs(document.getElementById('report_broken_images_delay').value);

    newOptions.setFilePath(document.getElementById('filepath').value);
    newOptions.setFilePrefix(document.getElementById('fileprefix').value);
    newOptions.setSessionName(document.getElementById('sessionname').value);
    newOptions.setFolderStructure(document.getElementById('folderStructure').value);
    return newOptions;
}

function editedOptions() {
    if (!optionsFormBaseline) return {};
    const current = readOptionsForm();
    const edits = {};
    for (const key of Object.keys(getDefaultOptions())) {
        if (key !== 'engaged' && current[key] !== optionsFormBaseline[key]) edits[key] = current[key];
    }
    return edits;
}

function saveOptionsOnLeave() {
    const edits = editedOptions();
    if (Object.keys(edits).length) return saveOptions(edits);
    if (optionsFormBaseline) showStoredOptions(options);
    return true;
}

async function saveOptions(edits = editedOptions()) {
    const container = document.getElementById('options-container');
    const status = document.getElementById('status');
    const focused = document.activeElement;
    clearTimeout(optionsStatusTimer);
    container.inert = true;
    try {
        if (Object.keys(edits).length) {
            const {observatron} = await chrome.storage.local.get('observatron');
            const next = {...getDefaultOptions(), ...migratePageReviewOptions(observatron), ...edits};
            await chrome.storage.local.set({observatron: next});
            showStoredOptions(next, true);
        }
        status.textContent = 'Options saved.';
        optionsStatusTimer = setTimeout(() => { status.textContent = ''; }, 750);
        return true;
    } catch (error) {
        console.error('Error saving options:', error);
        status.textContent = 'Could not save your changes. Try again.';
        return false;
    } finally {
        container.inert = false;
        if (container.contains(focused)) focused.focus();
    }
}

function showStoredOptions(stored, savedLocally = false) {
    options = {...getDefaultOptions(), ...migratePageReviewOptions(stored)};
    if (!savedLocally && Object.keys(editedOptions()).length) {
        setHeadingOnPage();
        return;
    }
    displayObservatronOptionsOnGUI(options);
    optionsFormBaseline = readOptionsForm();
}

function displayObservatronOptionsOnGUI(options){
  //console.log(options);

   document.getElementById('onscroll').checked = options.onScrollEvent;
   document.getElementById('onresize').checked = options.onResizeEvent;
   document.getElementById('onpageload').checked = options.onPageLoad;
   document.getElementById('onpageupdated').checked = options.onPageUpdated;
   document.getElementById('ondoubleclick').checked = options.onDoubleClickShot;
   document.getElementById('onpostformsubmit').checked = options.onPostSubmit;
    document.getElementById('onpageloaddetecthtmlcomments').checked = options.onPageLoadDetectHtmlComments;
    showReviewOutput('html-comments-output', options.htmlCommentsOutput, options.onPageLoadDetectHtmlComments);
    document.getElementById('onpageloadaccessibilityreview').checked = options.onPageLoadAccessibilityReview;
    showReviewOutput('accessibility-output', options.accessibilityOutput, options.onPageLoadAccessibilityReview);
    document.getElementById('auto-console-logging').checked = options.autoConsoleLogging;
    document.getElementById('auto-traffic-monitoring').checked = options.autoTrafficMonitoring;
    document.getElementById('auto-network-errors').checked = options.autoNetworkErrors;
    showReviewOutput('network-errors-output', options.networkErrorsOutput, options.autoNetworkErrors);
    document.getElementById('onreportbrokenlinks').checked = options.reportBrokenLinks;
    document.getElementById('onreportbrokenimages').checked = options.reportBrokenImages;
    showReviewOutput('broken-links-output', options.brokenLinksOutput, options.reportBrokenLinks);
    showReviewOutput('broken-images-output', options.brokenImagesOutput, options.reportBrokenImages);
    document.getElementById('onpagemutation').checked = options.onPageMutation;
    document.getElementById('oninputchanges').checked = options.onInputChanges;
    document.getElementById('onclickevents').checked = options.onClickEvents;
    document.getElementById('filepath').value = options.filepath;
    document.getElementById('fileprefix').value = options.fileprefix;
    document.getElementById('sessionname').value = options.sessionName;
    document.getElementById('folderStructure').value = options.folderStructure;
    document.getElementById('scrolling_timeout').value = options.scrolling_timeout_milliseconds;
    document.getElementById('resize_timeout').value = options.resize_timeout_milliseconds;
    document.getElementById('report_broken_links_timeout').value = options.reportBrokenLinksTimeoutMs;
    document.getElementById('report_broken_links_delay').value = options.reportBrokenLinksCheckDelayMs;
    document.getElementById('report_broken_images_timeout').value = options.reportBrokenImagesTimeoutMs;
    document.getElementById('report_broken_images_delay').value = options.reportBrokenImagesCheckDelayMs;
  
  setHeadingOnPage();

}

function set_defaults_on_gui(){

  // todo have the defaults in a shared file if possible
  var defaultOptions = new Options();

  displayObservatronOptionsOnGUI(defaultOptions);
}

function setHeadingOnPage(){

    var textToRender = "The Observatron - version " + chrome.runtime.getManifest().version;
    textToRender = textToRender + (options.engaged ? " (On)" : " (Off)");

    document.getElementById('optionsheading').innerHTML = textToRender;
}

/*
  Setup the page
*/

document.addEventListener('DOMContentLoaded', function() {
    buildOptionsUI('options-container');
    showStoredOptions();
    document.getElementById('defaults').addEventListener('click', set_defaults_on_gui);

    let newerOptionsReceived = false;
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.observatron) {
            newerOptionsReceived = true;
            showStoredOptions(changes.observatron.newValue);
        }
    });
    chrome.storage.local.get('observatron').then(({observatron}) => {
        if (!newerOptionsReceived) showStoredOptions(observatron);
    }).catch(error => console.error('Error loading options:', error));
});
