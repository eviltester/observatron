import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { createChromeMock } from '../mocks/chrome.mock.js'

const scripts = resolve(dirname(fileURLToPath(import.meta.url)), '../../chrome/javascript')
const workerSource = readFileSync(resolve(scripts, 'worker.js'), 'utf8')
const optionsSource = readFileSync(resolve(scripts, 'observatron_options.js'), 'utf8')
const rulesSource = readFileSync(resolve(scripts, 'traffic_rules.js'), 'utf8')
const sharedSource = readFileSync(resolve(scripts, 'shared.js'), 'utf8')
const noteSource = readFileSync(resolve(scripts, 'note_parser.js'), 'utf8')
const menuSource = readFileSync(resolve(scripts, 'context_menu.js'), 'utf8')

function startWorker(storage, restore = Promise.resolve(storage)) {
  const chrome = createChromeMock()
  chrome.storage.local.get.mockReturnValue(restore)
  chrome.storage.local.set.mockImplementation(async items => Object.assign(storage, items))
  chrome.storage.session = {
    get: vi.fn((keys, callback) => {
      callback?.({})
      return Promise.resolve({})
    }),
    set: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined)
  }
  chrome.tabs.onCreated = { addListener: vi.fn() }
  chrome.tabs.onActivated = { addListener: vi.fn() }
  chrome.tabs.onRemoved = { addListener: vi.fn() }

  const context = createContext({
    chrome,
    URL,
    importScripts: vi.fn()
  })
  runInContext(optionsSource, context)
  runInContext(rulesSource, context)
  runInContext(sharedSource, context)
  runInContext(noteSource, context)
  runInContext(menuSource, context)
  runInContext(workerSource, context)
  return { chrome, context }
}

describe('worker engagement', () => {
  it('waits for the saved hostname before handling a waking navigation and status request', async () => {
    const storage = {
      observatron: { engaged: true, onPageLoad: false, onPageLoadDetectHtmlComments: true },
      observatronEngagedDomain: 'example.com'
    }
    let finishRestore
    const restore = new Promise(resolve => { finishRestore = resolve })
    const { chrome, context } = startWorker(storage, restore)
    const report = {url: 'https://example.com/a', comments: ['review me']}
    let finishReport
    chrome.tabs.sendMessage.mockReturnValue(new Promise(resolve => { finishReport = resolve }))
    chrome.tabs.get.mockImplementation((id, callback) => {
      callback({ id, url: id === 1 ? 'https://example.com/a' : 'https://other.example/a' })
    })
    const navigate = chrome.webNavigation.onCompleted.addListener.mock.calls[0][0]
    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0]
    const respond = vi.fn()

    navigate({ tabId: 1, frameId: 0 })
    navigate({ tabId: 2, frameId: 0 })
    expect(onMessage({ method: 'getStatus' }, {}, respond)).toBe(true)
    expect(chrome.tabs.get).not.toHaveBeenCalled()
    expect(respond).not.toHaveBeenCalled()

    finishRestore(storage)
    await runInContext('optionsReady', context)

    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ engaged: true, domain: 'example.com' }))
    await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1))
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {method: 'scanCommentsForSave'}, {frameId: 0})
    expect(chrome.storage.session.set).toHaveBeenCalledWith({'observatron-html-comments:1': {url: report.url, running: true}})
    finishReport(report)
    await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalledWith({'observatron-html-comments:1': report}))
    expect(chrome.downloads.download).not.toHaveBeenCalled()
  })

  it('preserves the automatic notes preference from older HTML comment settings', async () => {
    const { chrome, context } = startWorker({
      observatron: {engaged: true, onPageLoad: false, onPageLoadLogHtmlCommentsAsNotes: true},
      observatronEngagedDomain: 'example.com'
    })
    chrome.tabs.sendMessage.mockResolvedValue(undefined)
    await runInContext('optionsReady', context)
    chrome.webNavigation.onCompleted.addListener.mock.calls[0][0]({tabId: 1, frameId: 0, documentId: 'new-document'})
    await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1,
      {method: 'scanHtmlComments', detectEnabled: true, seenHashes: [], returnResult: true}, {documentId: 'new-document'}))
    expect(chrome.storage.session.set).toHaveBeenCalledWith({'observatron-html-comments:1:notes': {url: 'https://example.com'}})
    await vi.waitFor(() => expect(chrome.storage.session.remove).toHaveBeenCalledWith('observatron-html-comments:1:notes'))
  })

  it('persists the clicked tab hostname and clears it on disengagement after a restart', async () => {
    const storage = { observatron: { engaged: false, onPageLoad: false } }
    const first = startWorker(storage)
    const toggle = first.chrome.action.onClicked.addListener.mock.calls[0][0]
    const tab = { id: 3, url: 'https://staging.example.test/' }
    toggle(tab)
    await runInContext('engagementChange', first.context)

    expect(storage).toMatchObject({
      observatron: { engaged: true }, observatronEngagedDomain: 'staging.example.test'
    })

    const restarted = startWorker(storage)
    const toggleAfterRestart = restarted.chrome.action.onClicked.addListener.mock.calls[0][0]
    toggleAfterRestart(tab)
    await runInContext('engagementChange', restarted.context)

    expect(storage).toMatchObject({ observatron: { engaged: false }, observatronEngagedDomain: null })
  })

  it('resets a legacy engaged flag when there is no saved hostname', async () => {
    const storage = { observatron: { engaged: true } }
    const { chrome, context } = startWorker(storage)
    await runInContext('optionsReady', context)

    expect(storage.observatron.engaged).toBe(false)
    expect(chrome.tabs.query).not.toHaveBeenCalled()
  })

  it('puts the side panel first and shares observation state between the menu and the panel', async () => {
    const storage = {observatron: {engaged: false, onPageLoad: false}}
    const {chrome, context} = startWorker(storage)
    await runInContext('optionsReady', context)
    chrome.runtime.onInstalled.addListener.mock.calls[0][0]()

    const items = chrome.contextMenus.create.mock.calls.map(([item]) => item)
    expect(items.filter(item => !item.parentId).map(item => item.title || item.type)).toEqual([
      'Show Side Panel', 'separator', 'Tools', 'Start Observing', 'Stop Observing', 'Options'
    ])
    expect(items.filter(item => item.parentId === 'tools').map(item => item.title)).toEqual([
      'Take Screenshot Now', 'Save as MHTML Now', 'Take Note', 'Save Comments'
    ])
    expect(chrome.contextMenus.onClicked.addListener).toHaveBeenCalledTimes(1)

    const menuClick = chrome.contextMenus.onClicked.addListener.mock.calls[0][0]
    const tab = {id: 8, url: 'https://example.com/'}
    chrome.tabs.get.mockImplementation((id, callback) => {
      callback?.(tab)
      return Promise.resolve(tab)
    })
    menuClick({menuItemId: 'showSidePanel'}, tab)
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({tabId: tab.id})
    menuClick({menuItemId: 'startObserving'}, tab)
    await runInContext('engagementChange', context)
    expect(storage.observatronEngagedDomain).toBe('example.com')
    expect(chrome.contextMenus.update).toHaveBeenCalledWith('stopObserving', {enabled: true}, expect.any(Function))

    const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0]
    const sidePanel = {url: chrome.runtime.getURL('sidepanel/sidepanel.html')}
    const request = (action, target = tab) => new Promise(resolve => {
      expect(onMessage({method: 'changeObservation', action, tabId: target.id, pageUrl: target.url}, sidePanel, resolve)).toBe(true)
    })
    expect(await request('stop')).toEqual({success: true})
    expect(storage.observatronEngagedDomain).toBeNull()
    chrome.tabs.onUpdated.addListener.mock.calls[0][0](tab.id, {status: 'complete'}, tab)
    await runInContext('optionsReady', context)
    expect(chrome.sidePanel.setOptions.mock.calls.every(([options]) => options.enabled)).toBe(true)

    expect(await request('start', {...tab, url: 'https://previous.example/'}))
      .toEqual({error: 'The target page changed. Try again on the current page.'})
    expect(await request('start')).toEqual({success: true})
    expect(storage.observatronEngagedDomain).toBe('example.com')
    menuClick({menuItemId: 'stopObserving'}, tab)
    await runInContext('engagementChange', context)
    expect(storage.observatronEngagedDomain).toBeNull()
    expect(chrome.contextMenus.update).toHaveBeenCalledWith('startObserving', {enabled: true}, expect.any(Function))
  })
})

it('changes the type of an open note while preserving the note and its attachments', async () => {
  const open = {id: '1', type: 'bug', status: 'open', text: 'Original text', screenshots: ['capture.png']}
  const closed = {id: '2', type: 'todo', status: 'closed', text: 'Closed note'}
  const storage = {observatron: {engaged: false}, observatron_notes: [{...open}, {...closed}]}
  const {chrome, context} = startWorker(storage)
  await runInContext('optionsReady', context)
  const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0]
  const panel = {url: chrome.runtime.getURL('sidepanel/sidepanel.html')}
  const edit = (noteId, noteType, customType = false) => new Promise(resolve => {
    expect(onMessage({method: 'changeNoteType', noteId, noteType, customType}, panel, resolve)).toBe(true)
  })

  expect(await edit('1', 'question')).toEqual({success: true})
  expect(storage.observatron_notes[0]).toEqual({...open, type: 'question'})
  expect(await edit('1', 'task[]', true)).toEqual({success: true})
  expect(storage.observatron_notes[0]).toEqual({...open, type: 'task[]'})
  expect(await edit('2', 'bug')).toEqual({error: 'Open the note before changing its type.'})
  expect(storage.observatron_notes[1]).toEqual(closed)
  expect(await edit('1', 'note')).toEqual({success: true})
  expect(storage.observatron_notes[0]).toEqual({...open, type: 'note', status: 'closed'})
})

it('serializes edits to saved traffic rules from multiple extension pages', async () => {
  const storage = {observatron: {engaged: false}}
  const {chrome, context} = startWorker(storage)
  chrome.storage.local.get.mockImplementation(async () => ({...storage}))
  await runInContext('optionsReady', context)
  const onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0]
  const panel = {url: chrome.runtime.getURL('sidepanel/sidepanel.html')}
  const optionsPage = {url: chrome.runtime.getURL('options/options_page.html')}
  const checkout = {name: 'Checkout', text: 'synthetic-cart'}
  const search = {name: 'Search', text: 'synthetic-query'}
  const pattern = {...search, mode: 'regex'}
  const padded = {name: 'Spaces', text: '  '}
  const change = (sender, action, rules) => new Promise(resolve => {
    expect(onMessage({method: 'changeSavedTrafficRules', action, rules}, sender, resolve)).toBe(true)
  })

  const results = await Promise.all([
    change(panel, 'add', [checkout]),
    change(optionsPage, 'add', [search, checkout, pattern, padded])
  ])
  expect(results).toEqual([{success: true}, {success: true}])
  expect(storage.observatronTrafficRules).toEqual([checkout, search, pattern, padded])

  expect(await change(optionsPage, 'remove', [checkout])).toEqual({success: true})
  expect(await change(optionsPage, 'remove', [pattern])).toEqual({success: true})
  expect(storage.observatronTrafficRules).toEqual([search, padded])
  expect(storage.observatron).toEqual({engaged: false})
})
