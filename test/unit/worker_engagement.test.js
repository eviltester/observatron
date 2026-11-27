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

function startWorker(storage, restore = Promise.resolve(storage)) {
  const chrome = createChromeMock()
  chrome.storage.local.get.mockReturnValue(restore)
  chrome.storage.local.set.mockImplementation(async items => Object.assign(storage, items))
  chrome.storage.session = {
    get: vi.fn((keys, callback) => callback({})),
    set: vi.fn().mockResolvedValue(undefined)
  }
  chrome.tabs.onCreated = { addListener: vi.fn() }
  chrome.tabs.onActivated = { addListener: vi.fn() }

  const context = createContext({
    chrome,
    URL,
    importScripts: vi.fn(),
    ContextMenus: class {
      init() {}
      createMenus() {}
      updateContextMenus() {}
    }
  })
  runInContext(optionsSource, context)
  runInContext(rulesSource, context)
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
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1)
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
      method: 'scanHtmlComments', detectEnabled: true, seenHashes: []
    })
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
