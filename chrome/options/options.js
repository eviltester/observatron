'use strict';

function buildOptionsUI(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

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

    // Logging Configuration
    const h2Logging = document.createElement('h2');
    h2Logging.textContent = 'Logging Configuration';
    container.appendChild(h2Logging);
    const pLogging = document.createElement('p');
    pLogging.textContent = 'Take screenshots, mhtml and json logs based on various events:';
    container.appendChild(pLogging);

    const loggingCheckboxes = [
        {id: 'onpageload', label: 'On Page Load'},
        {id: 'onpageupdated', label: 'On Page Updated'},
        {id: 'onpostformsubmit', label: 'Log POST form contents to a file'}
    ];
    loggingCheckboxes.forEach(cb => {
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

    newOptions.setScrollingTimeoutMilliseconds(document.getElementById('scrolling_timeout').value);
    newOptions.setResizeTimeoutMilliseconds(document.getElementById('resize_timeout').value);

    newOptions.setFilePath(document.getElementById('filepath').value);
    newOptions.setFilePrefix(document.getElementById('fileprefix').value);
    newOptions.setFolderStructure(document.getElementById('folderStructure').value);

    options = newOptions;

    chrome.storage.local.set({observatron: options}, function() {
      // Update status to let user know options were saved.
      var status = document.getElementById('status');
      status.textContent = 'Options saved.';
      setTimeout(function() {
        status.textContent = '';
      }, 750);
    });
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
   document.getElementById('filepath').value = options.filepath;
   document.getElementById('fileprefix').value = options.fileprefix;
   document.getElementById('folderStructure').value = options.folderStructure;
   document.getElementById('scrolling_timeout').value = options.scrolling_timeout_milliseconds;
   document.getElementById('resize_timeout').value = options.resize_timeout_milliseconds;
  
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
