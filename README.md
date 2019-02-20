# Observatron

A prototype exploratory testing observation tool for Chrome browser.

This is an under-development Chrome plugin.

To install:

- download the files from [releases](https://github.com/eviltester/observatron/releases)
- visit [chrome://extensions](chrome://extensions)
- switch on Developer mode
- Load unpacked
- choose the 'chrome' folder (the one with the manifest in it)

## Automated Observation

To use:

- Click the red button [Engage the Observatron] to start automated observing
- the button will turn green
- Click the green button [Disengage the observatron] to finish automated observing

As you browse and test, you will see files download based on the configured options.

These will be in a `\observatron` folder in your downloads folder.

You will see screenshots and .mhtml files.

- screenshots are taken when you load a page, and when you scroll
- `.mhtml` files are extracted when you load a page

`.mhtml` files can be opened in a browser and are the packaged css, and html of the page at the time.

screenshots are what was shown on the screen.

If you right click on the icon and choose options then you can configure the extension.

- [ ] On Scroll (take a screenshot when you finish scrolling)
- [ ] On Resize (take a screenshot after you resize the browser window)
- [ ] On Page Load (take a screenshot and save an mhtml when the page loads)
- [ ] On Page Updated (take a screenshot and save an mhtml when the page updates)
- [ ] Screenshot On Double click (take a screenshot when you double click on the page)
- [ ] Log POST form contents to a file (should log form Posts to a json file - off by default) 

You can also configure the folder (within dowloads to save the files e.g. change it to match the feature you are testing). Also the file prefix. And the timeouts the system uses for checking if you are still scrolling or still resizing.

## Double Click Screenshots

If the observatron is engaged and you have configured "Double Click Screenshots" then you can take a screenshot by double clicking on the page.

## Instant Functions

Some functionality is available regardless of the engaged state of the observatron.

You can always use the context menu to:

- Take Screenshot Now
- Save as MHTML Now
- Take Note

"Take Note" is also mapped to a key, by default this is "Ctrl+Shift+L" or "Cmd+Shift+L" on Mac

You can configure key mappings using [chrome://extensions/configureCommands](chrome://extensions/configureCommands)

## Taking Notes

The note taking functionality uses JavaScript 'prompt' input boxes. It ain't pretty, its functional

Either initiate a note taking by using the context menu or the keyboard short cut.

When faced with the prompt:

> Add Note to log 
> (? question, ! bug, - todo, @customtype)

You can type in text and it will be logged to a json file in your download folder.

By default it will be saved as type "note".

If you prefix the text with "?" then it will be saved as a question e.g. "? should the system do this?"

e.g. Saved as "obs_2019-02-20-11-32-57-208-question_1550662375417.json"

~~~~~~~~
{"type":"question","text":"should the system do this?","id":"1550662375417"}
~~~~~~~~

After typing a note you will see a prompt "Do you want a screenshot with that?". Choosing [OK] will save a screenshot, choosing [Cancel] will not.

Type of notes are:

- "?" `question`
- "!" `bug`
- "-" `todo`
- "@anythingyouwant" where "anythingyouwant" is the type you want

When you save a screenshot it will have `_note_noteid` at the end of the filename.

e.g. "obs_2019-02-20-11-32-57-314-screenshot-1201x1104_note_1550662375417.jpg"

This can help you cross reference screenshots to notes, although the timestamping should mean that the screenshot is the next file saved after the note.

---

## Context Menu

The context menu provides access to instant screenshot or .mhtml saving, and allows you to toggle on and off the checkbox options.

(You still need to use the options screen to change output paths and timings)

![](release/menu-screenshot-640-400.png)

---

## Options Screen

The options screen, right click from context menu or manage from `chrome://extensions`

![](release/options-screenshot-1280x800.png)


---

Copyright 2019 Compendium Developments Ltd, Alan Richardson


https://eviltester.com
https://compendiumdev.co.uk


---

## Detailed Description

The Observatron supports Exploratory testing by taking screenshots and creating .mhtml files as you test. It also logs urls and form submissions.

- when a page loads
- when you double click on the page
- when you resize the page
- when you scroll through the page
- when you submit a form

All of the above can be switched on and off from the options.

All images are stored in your downloads folder so you can easily find them and see them being saved.

Copyright 2019 Compendium Developments Ltd, Alan Richardson

https://eviltester.com
https://compendiumdev.co.uk
