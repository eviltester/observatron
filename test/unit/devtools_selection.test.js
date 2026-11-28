import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {runInNewContext} from 'node:vm'
import {expect, it, vi} from 'vitest'

const devtoolsScript = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../chrome/devtools/devtools.js'), 'utf8')
const clickScript = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../chrome/javascript/page_selection.js'), 'utf8')

it('only answers requests for the inspected tab from the Observatron panel', async () => {
  const getURL = path => `chrome-extension://observatron/${path}`
  const addListener = vi.fn()
  const sendMessage = vi.fn().mockResolvedValue(undefined)
  const onDisconnect = vi.fn()
  const connect = vi.fn().mockReturnValue({onDisconnect: {addListener: onDisconnect}})
  const readInspectedElement = vi.fn().mockResolvedValue({pageUrl: 'https://example.test/selected'})
  runInNewContext(devtoolsScript, {
    readInspectedElement,
    chrome: {
      devtools: {panels: {create: vi.fn()}, inspectedWindow: {tabId: 42}},
      runtime: {getURL, sendMessage, connect, onMessage: {addListener}}
    }
  })
  const [[listen]] = addListener.mock.calls
  const reply = vi.fn()
  const request = {type: 'observatronReadSelectedElement', tabId: 42}
  const sender = {url: getURL('sidepanel/sidepanel.html')}

  expect(sendMessage).toHaveBeenCalledWith({type: 'observatronElementDevtoolsReady', tabId: 42})
  const track = {...request, type: 'observatronTrackElementDevtools', channel: 'observatron-element-devtools:test'}
  listen({...track, tabId: 43}, sender, reply)
  expect(connect).not.toHaveBeenCalled()
  listen(track, sender, reply)
  listen(track, sender, reply)
  expect(connect).toHaveBeenCalledTimes(1)
  expect(connect).toHaveBeenCalledWith({name: track.channel})
  onDisconnect.mock.lastCall[0]()
  listen(track, sender, reply)
  expect(connect).toHaveBeenCalledTimes(2)

  expect(listen({...request, tabId: 43}, sender, reply)).toBe(false)
  expect(listen(request, {url: 'https://example.test/'}, reply)).toBe(false)
  expect(readInspectedElement).not.toHaveBeenCalled()
  expect(listen(request, sender, reply)).toBe(true)
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({element: {pageUrl: 'https://example.test/selected'}}))
})

it('reports the last trusted click while it belongs to the current page', () => {
  const pageUrl = 'https://example.test/before'
  const window = {location: {href: pageUrl}, addEventListener: vi.fn()}
  window.top = window
  const getURL = path => `chrome-extension://observatron/${path}`
  const addListener = vi.fn()
  const onConnect = vi.fn()
  const observer = {observe: vi.fn(), disconnect: vi.fn()}
  const MutationObserver = vi.fn(function () { return observer })
  const document = {}
  const describeSelectedElement = vi.fn((node, pageUrl) => ({node, pageUrl}))
  runInNewContext(clickScript, {
    window, document, MutationObserver, performance: {timeOrigin: 1000}, describeSelectedElement,
    chrome: {runtime: {getURL, onMessage: {addListener}, onConnect: {addListener: onConnect}}}
  })
  const [[, click]] = window.addEventListener.mock.calls
  const [[listen]] = addListener.mock.calls
  const first = {nodeType: 1, isConnected: true, getRootNode: () => document}
  const second = {...first}
  const port = {
    name: 'observatron-element-click', sender: {url: getURL('sidepanel/sidepanel.html')}, postMessage: vi.fn(),
    onDisconnect: {addListener: vi.fn()}, onMessage: {addListener: vi.fn()}
  }
  onConnect.mock.lastCall[0](port)
  const send = (fields = {}) => {
    const reply = vi.fn()
    listen({type: 'observatronClickedElement', pageUrl, ...fields}, {url: getURL('sidepanel/sidepanel.html')}, reply)
    return reply.mock.lastCall[0]
  }

  expect(send()).toEqual({time: null})
  expect(port.postMessage).toHaveBeenLastCalledWith({time: null, available: false})
  click({isTrusted: true, timeStamp: 10, composedPath: () => [first]})
  click({isTrusted: false, timeStamp: 11, composedPath: () => [second]})
  expect(send()).toEqual({time: 1010})
  expect(port.postMessage).toHaveBeenLastCalledWith({time: 1010, available: true})
  expect(describeSelectedElement).not.toHaveBeenCalled()
  expect(send({time: 1010})).toEqual({element: {node: first, pageUrl}})

  click({isTrusted: true, timeStamp: 12, composedPath: () => [second]})
  expect(send({time: 1010})).toEqual({element: null})
  second.isConnected = false
  MutationObserver.mock.lastCall[0]()
  expect(port.postMessage).toHaveBeenLastCalledWith({time: 1012, available: false})
  expect(send()).toEqual({time: 1012})
  expect(send({time: 1012})).toEqual({element: null})

  second.isConnected = true
  window.location.href = 'https://example.test/after'
  expect(send({pageUrl: window.location.href, time: 1012})).toEqual({element: null})
})
