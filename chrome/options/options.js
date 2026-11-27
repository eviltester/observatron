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
        {id: 'onpageloadloghtmlcommentsasnotes', label: 'On Page Load - Log HTML Comments as Notes'},
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

    // Save section
    const h2Save = document.createElement('h2');
    h2Save.textContent = 'Remember to save changes';
    container.appendChild(h2Save);
    const statusDiv = document.createElement('div');
    statusDiv.id = 'status';
    container.appendChild(statusDiv);
    const saveBtn = document.createElement('button');
    saveBtn.id = 'save';
    saveBtn.textContent = 'Save';
    container.appendChild(saveBtn);
    buildSavedTrafficRulesUI(container);
}

function buildSavedTrafficRulesUI(container) {
    const section = document.createElement('section');
    section.innerHTML = `
        <h2>Saved Traffic Rules</h2>
        <p>These rules are available the next time you start Traffic Monitor in DevTools.</p>
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

var options = new Options();


chrome.storage.onChanged.addListener(function(changes, namespace) {
  if(namespace === "local"){
    if(changes.hasOwnProperty("observatron")){
      restore_options();
    }
  }
});



function getObservatronDefaults(){
    chrome.storage.local.get(['observatron'], setObservatronDefaults);
}

function save_options() {

    var newOptions = new Options(); // defaults are set so only set if valid

    // Preserve the current engaged state
    newOptions.engaged = options.engaged;

    newOptions.setOnResizeEvent(document.getElementById('onresize').checked);
    newOptions.setOnScrollEvent(document.getElementById('onscroll').checked);
    newOptions.setOnPageLoad(document.getElementById('onpageload').checked);
    newOptions.setOnPageUpdated(document.getElementById('onpageupdated').checked);
    newOptions.setOnDoubleClickShot(document.getElementById('ondoubleclick').checked);
    newOptions.setOnPostSubmit(document.getElementById('onpostformsubmit').checked);
    newOptions.setOnPageLoadDetectHtmlComments(document.getElementById('onpageloaddetecthtmlcomments').checked);
    newOptions.setOnPageLoadLogHtmlCommentsAsNotes(document.getElementById('onpageloadloghtmlcommentsasnotes').checked);
    newOptions.setOnReportBrokenLinks(document.getElementById('onreportbrokenlinks').checked);
    newOptions.setOnReportBrokenImages(document.getElementById('onreportbrokenimages').checked);
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

    options = newOptions;

    try {
      chrome.storage.local.set({observatron: options}, function() {
        if (chrome.runtime.lastError) {
          if (!chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            console.error('Error saving options:', chrome.runtime.lastError);
            var status = document.getElementById('status');
            status.textContent = 'Error saving options.';
            setTimeout(function() {
              status.textContent = '';
            }, 750);
          }
          // Ignore "Extension context invalidated" errors
          return;
        }
        // Update status to let user know options were saved.
        var status = document.getElementById('status');
        status.textContent = 'Options saved.';
        setTimeout(function() {
          status.textContent = '';
        }, 750);
      });
    } catch (error) {
      if (!error.message.includes('Extension context invalidated')) {
        console.error('Error in save_options:', error);
        var status = document.getElementById('status');
        status.textContent = 'Error saving options.';
        setTimeout(function() {
          status.textContent = '';
        }, 750);
      }
      // Ignore "Extension context invalidated" errors
    }
  }
  
  // Restores select box and checkbox state using the preferences
  // stored in chrome.storage.
  function restore_options() {
        getObservatronDefaults();
  }

 



function setObservatronDefaults(setoptions){
  if(setoptions){
      options = setoptions.observatron;
        //console.log("set popup defaults from observatron");
        displayObservatronOptionsOnGUI(options);
  
  }
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
    document.getElementById('onpageloadloghtmlcommentsasnotes').checked = options.onPageLoadLogHtmlCommentsAsNotes;
    document.getElementById('onreportbrokenlinks').checked = options.reportBrokenLinks;
    document.getElementById('onreportbrokenimages').checked = options.reportBrokenImages;
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

getObservatronDefaults();

document.addEventListener('DOMContentLoaded', function() {
    buildOptionsUI('options-container');
    restore_options();
    document.getElementById('save').addEventListener('click', save_options);
    document.getElementById('defaults').addEventListener('click', set_defaults_on_gui);
});
