# Observatron

A prototype exploratory testing observation tool for Chrome browser.

This is an under-development Chrome plugin.

To install:

- download the files from [releases](https://github.com/eviltester/observatron/releases)
- visit chrome://extensions
- switch on Developer mode
- Load unpacked
- choose the 'chrome' folder (the one with the manifest in it)

To use:

- Click the red button [Engage the Observatron] to start
- the button will turn green
- Click the green button [Disengage the observatron] to finish

As you browse and test, you will see files download.

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
