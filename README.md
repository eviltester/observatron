# Observatron

Observatron is a Chrome extension for gathering evidence while you explore and test web applications. It can take screenshots, save MHTML page snapshots, log browser events, and organise notes, bugs, questions, and todos.

The side panel also has page checks for broken links, broken images, HTML comments, and accessibility. In Chrome DevTools, Traffic Monitor checks available HTTP request and response text for strings you choose. You can add findings to your notes alongside your other session evidence.

You can download this from the Chrome Store:

- [The Observatron Chrome Store Page](https://chrome.google.com/webstore/detail/test-observer-the-observa/gdiemnbjpblghfbejnbohdnnmodbknoe)

### Install from a GitHub release

1. Download `observatron-v-<version>.zip` from **Assets** on the [releases page](https://github.com/eviltester/observatron/releases) and extract it.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.

If you cloned this repository, select the `chrome` folder to load the extension directly.

## Automated Observation

To use:

- Click the red button [Engage the Observatron] to start automated observing
- the button will turn green
- Click the green button [Disengage the observatron] to finish automated observing

Only the domain you engage observatron will have automated events logged, manual logs can be created from the notes view on any page.

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

Initiate a note taking using the separate web page by:
- using the context menu
- the keyboard short cut

Or "Show Side Panel" to show the side panel with note taking functionality.

Or use the Observatron panel in the dev tools.

When faced with the dialog:

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

This can help you cross-reference screenshots to notes, although the timestamping should mean that the screenshot is the next file saved after the note.

## Page Checks

Open the Observatron side panel or the **Test Observatron** panel in Chrome DevTools.

- Use **Check Broken Links** and **Check Broken Images** to check resources on the current page. Both checks can also run during automated observation when enabled in Options.
- Open **HTML Comments Review** and click **Scan For HTML Comments** to see the comments on the page. **Add to Note Draft** copies an individual comment to your draft, and **Save to Markdown** exports the full scan. **Clear Results** clears the review. The **Event Logging** options can also detect comments or log them as notes as you browse.
- Open **Axe Accessibility Review** and click **Check Accessibility** to run axe-core on the current page's main document. Expand a finding to see its affected elements. **Needs Manual Review** lists checks axe could not decide, with the rule ID, guidance, and elements to inspect. **Show on Page** scrolls to an element and outlines it for five seconds. **Show HTML** displays the captured snippet. **Add to Note Draft** appends the finding, and **Clear Results** clears the review while preserving your draft.

## Traffic Monitor

Traffic Monitor brings the request and response text checks from [CDP Test Support](https://github.com/eviltester/cdptestsupport) into Observatron. Use it to find unexpected destinations for synthetic test data or to catch server messages you did not see in the UI.

1. Open Chrome DevTools on the tab you are testing and select **Test Observatron**.
2. Expand **Traffic Monitor** and add temporary rules under **Session-only rules**, one rule per line. **Use saved rules from Options** is checked by default. Uncheck it to run only the session rules.
3. Click **Start Monitoring**, then exercise the feature. The monitor checks completed HTTP and HTTPS requests from that tab, including requests to other domains. The heading shows the match count and changes colour as matches arrive, even while the panel is collapsed. The non-interactive sidebar line mirrors the count and colour for the active tab.
4. Tick the matches whose rules you want to reuse and click **Save Selected Rules to Options**. Manage these rules under **Options → Saved Traffic Rules**, where you can also add rules directly. Changes to saved rules take effect the next time you click **Start Monitoring**.
5. Expand **Match details** to see the request URL, including query parameters, and a short excerpt highlighting the first occurrence in the request or response body. **Add to Note Draft** records the resource path and match location. **Clear Matches** empties the list, and **Stop Monitoring** ends the run. Closing DevTools discards the session rules and match list.

Use the same rule syntax in Traffic Monitor and **Options → Saved Traffic Rules**.

```text
Checkout email = qa+checkout@example.test
Padded value = " padded value   "
Whole word * \btodo\b
```

`=` finds a case-sensitive literal substring. Double quotes around the value preserve every character inside them, including leading and trailing spaces. `*` takes a JavaScript regular expression with whitespace on both sides of the separator. Enter the pattern directly, without slash delimiters. A whole-word regex such as `\btodo\b` matches `todo` as a word.

Matching covers request bodies and text response bodies that DevTools makes available after a request completes. Headers, URL parameters, binary data, and WebSocket messages are outside its scope. Start before exercising the page so the monitor can see the traffic you want to check.

The monitor reports the rule name, request or response, HTTP method, resource URL, and time. Note drafts include the URL through the resource path and the line and column of the first match. Query parameters and body excerpts are available in the DevTools report. Saving a rule writes its name and exact search text to this browser profile. Use synthetic values as markers. The monitor works independently of the toolbar's **Engage Observatron** button, which scopes automated observation to the hostname where you engaged it.

## Keyboard Shortcuts

To create a note:

- "default": "Ctrl+Shift+L",
- "mac": "Command+Shift+L"


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

Copyright 2019-2025 Compendium Developments Ltd, Alan Richardson


https://eviltester.com
https://compendiumdev.co.uk


---

## Detailed Description

The Observatron supports Exploratory testing by taking screenshots and creating .mhtml files as you test. It also logs urls and form submissions. All logging is performed in your downloads folder so that you have control over the information. No information is sent to external servers.

Logging and screenshots saved when:

- when a page loads
- when a page updates
- when you double click on the page
- when you resize the page
- when you scroll through the page
- when you submit a form

All of the above can be switched on and off from the options.

All images are stored in your downloads folder so you can easily find them and see them being saved.

You can also save logs of: bugs, todos, questions, or any custom information. To do this:

- from the context menu choose "Take Note"
- in the dialog, write your note
- you will be asked if you want a screenshot with that
- the note and optional screenshot will be saved to your downloads

Notes take the format:

- "? question text to output as the note"
- "! description of the bug to output as the note"
- "- todo text to output"
- "@type text to output as custom type"

When you save a screenshot with the note screenshot it will have `_note_noteid` at the end of the filename. This can help you cross reference screenshots to notes, although the timestamping should mean that the screenshot is the next file saved after the note.

e.g. "obs_2019-02-20-11-32-57-314-screenshot-1201x1104_note_1550662375417.jpg"

This extension is open source.

Copyright 2019-2025 Compendium Developments Ltd, Alan Richardson


---

## Capabilities, ToDos

### Does not:

- capture keypresses
    - it captures 'input' events
    - i.e. changing checkbox, input field, etc.
- log alert creation, display or interaction
- save a full HTTP traffic archive. Traffic Monitor reports matches from the inspected tab, and the separate POST option logs form submissions when enabled.
    - does capture form posts as post events

### Does:

- only automatically capture events for the domain on which it was enabled
- capture mutation events
    - e.g. text changing
    - buttons added
- save screenshots of visible screen area
    - on resize
    - on scroll
    - on double click
- save screenshots of selected element
    - use the sidebar view, select element, create a note with 'include element screenshot'
- capture form post events (when configured)
- save manual notes
show notes in side-bar
    - sequential based on time stamp
    - by type and status (open, closed)
        - question
        - bug
        - todo
        - custom
- save notes button
    - requires - tracking internally, not just event logging
- show options in sidebar to make easier to maintain
- add status to special note type (open, closed) (question, bug, etc.)
    - track status, open closed as event log
- session id configurable in options to create configurable subfolder (below date)
- option to - flatten folders into filename e.g. observatron/2025_12_27_sessionid
    - make flatten option the default
- limit the custom note type name length (15 chars)
- @custom[] (would allow opening and closing because it is a custom with a state - state == [])
- check for broken links in parallel to the user testing
- check for broken images in parallel to the user testing
- manual check for links or images is also done in parallel with user testing

### TODO:

- configurable data sizes (mutation text, clicked target text)
- resize log with screensize change, not just screenshot
- separate page load event i.e. track without saving screen details
- mouse events - move
- configurable auto save notes to file every (X minutes, after every note, config)
- possible custom user scripts before/after events - or just use TamperMonkey for that?
- report on the links that were checked during the session - list of URLS and their status - to show coverage
- check for links and images on mutation, not just page load, and scan if available (use manual scan for the moment)
- improve automated execution and condition coverage during build#
- allow saving a filtered list of notes e.g. all open items or any filter to a text, json file or clipboard e.g. easy end of session open tasks and bugs tracking
- when checking a link, if an error occurs, all the user sees is 'error' with no indication of what happened - improve this
- for broken links - perhaps add a 'check again' button?
- improve saving comments when no comments

when saving comments manually from sidebar or extension and there are no comments,
then no visible indication of no comments is provided so user might think the save doesn't work
suggest - add a console log, or write an empty file, or add notification on screen

### Build and Deploy

1. Update the version in `chrome/manifest.json` and `package.json` and land the changes on `master`.
2. In GitHub, choose **Actions → Make Release → Run workflow** on `master`.
3. The workflow runs lint and tests, then publishes `v<version>` with generated release notes and `observatron-v-<version>.zip`.

`npm run build` creates the same ZIP locally under `release/`. Use that ZIP or download the release asset to submit it through the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/developer/dashboard).
  
---

# Versions

- 1.0.3
   - Added Traffic Monitor to the DevTools panel. Search available HTTP request and response text for named strings, including traffic to third-party destinations. Add observations to your notes and save selected search rules in Options for reuse.
   - Show the rules and affected elements that need manual review in the Axe Accessibility Review.
- 1.0.2
   - Added a collapsible Axe Accessibility Review section for on-demand checks. Highlight affected elements on the page, expand their HTML snippets, add a finding to your note draft, or clear the results.
   - Fixed monitoring so the selected hostname is restored after the extension’s service worker restarts.
- 1.0.1
   - migrated html comment detection from Test Tool Hub
   - added more options to configure event checking
   - removed option setting from popup - need to use the options views now
   - background and manual trigger broken link check - based on link check in test tool hub
   - background and manual trigger broken image check
   - status rendering of background info - monitored domain (in image alt), and link and image checking queue length
- 1.0
  - added tests and build process
  - tidied logging
  - added event listeners only when enabled
- 0.99 bug fixes for enablement and element screenshots
- 0.98 session improvements
  - session id editable and used for folder name
  - flatten folder into single sub folder rather than nested e.g. 2025/12/27/session vs 2025-12-27-session (flat is default)
  - limit custom name length
  - allow custom types to be closed when created with `@name[]`
- 0.97 options and notes (released 20251227)
   - add the options to the notes screen for easier access
     - still available as Manage Extension options
   - improve note-taking
     - added note tracking in memory
     - save to disk as text report
     - save/load to disk from json
     - open/close questions, todos, bugs for local session tracking
     - filter notes in memory e.g. see open todos
- 0.96 more events and sidebar
   - notes:
     - removed notes input box and added page and sidebar and dev tools extension
     - add notes screen shows when adhoc "take note" used from context menu
     - sidebar can be shown from context menu - useful when you want to see which element you are screenshotting
     - devtools tab - useful when you want to do more manual note tracking for general testing
   - enabled domain
     - automated event generation and screenshots is only enabled for the domain that you start the observatron on
     - manual events can be created using notes for any domain without switching on the observatron
  - element screenshots
    - when creating a note, can select an element in the dev tools element view and output a screenshot of 'just the element' with the note.
    - required adding scripting permission
  - more event capture
    - mutation
    - click
    - input
- 0.95 updated to manifest v3 and added much more error handling - 20251222
- 0.92 initial version

