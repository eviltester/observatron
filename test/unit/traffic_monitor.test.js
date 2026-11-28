import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const panelPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../chrome/sidepanel')
const panelHtml = readFileSync(resolve(panelPath, 'sidepanel.html'), 'utf8')
const monitorScript = readFileSync(resolve(panelPath, 'capture_monitors.js'), 'utf8')
const monitorTabsScript = readFileSync(resolve(panelPath, 'monitor-tabs.js'), 'utf8')
const rulesScript = readFileSync(resolve(panelPath, '../javascript/traffic_rules.js'), 'utf8')
const reportScript = readFileSync(resolve(panelPath, '../javascript/capture_report.js'), 'utf8')
const workerScript = readFileSync(resolve(panelPath, '../javascript/capture_worker.js'), 'utf8')
const accessibilityScanScript = readFileSync(resolve(panelPath, '../javascript/accessibility_scan.js'), 'utf8')

function event() {
  const listeners = []
  return {
    addListener: listener => listeners.push(listener),
    emit: (...args) => listeners.forEach(listener => listener(...args))
  }
}

function captureEnvironment(savedRules, initialOptions = {}) {
  const changes = event()
  const snapshots = {}
  const entries = new Map()
  let nextRequest = 0
  let options = initialOptions
  const saveNoteFromMessage = vi.fn().mockResolvedValue(undefined)
  const chrome = {
    tabs: {
      query: vi.fn().mockResolvedValue([{id: 7}]), onActivated: event(), onRemoved: event(), onUpdated: event(),
      get: vi.fn().mockResolvedValue({url: 'https://staging.example.test/'})
    },
    runtime: {getURL: path => `chrome-extension://observatron/${path}`},
    storage: {
      onChanged: changes,
      local: {get: vi.fn(async () => ({observatronTrafficRules: savedRules, observatron: options}))},
      session: {
        get: async key => ({[key]: snapshots[key]}),
        set: async values => {
          for (const [key, val] of Object.entries(values)) {
            const snapshot = JSON.parse(JSON.stringify(val))
            snapshots[key] = snapshot
            changes.emit({[key]: {newValue: snapshot}}, 'session')
          }
        },
        remove: async key => {
          delete snapshots[key]
          changes.emit({[key]: {newValue: undefined}}, 'session')
        }
      }
    },
    debugger: {
      onEvent: event(), onDetach: event(),
      attach: vi.fn().mockResolvedValue(undefined), detach: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn((target, method, params) => {
        if (method === 'Network.getResponseBody') {
          return new Promise(resolve => entries.get(params.requestId).getContent((body, encoding) =>
            resolve({body, base64Encoded: encoding === 'base64'})))
        }
        return Promise.resolve(undefined)
      })
    }
  }
  const {handle, scanResponsiveAccessibility} = runInNewContext(
    `${rulesScript}\n${reportScript}\n${workerScript}\n${accessibilityScanScript}\n({handle: handleCaptureCommand, scanResponsiveAccessibility})`,
    {chrome, URL, crypto, Date, setTimeout, clearTimeout, console, saveNoteFromMessage})
  chrome.runtime.sendMessage = vi.fn(request => {
    if (request.method === 'changeSavedTrafficRules') return Promise.resolve({success: true})
    return new Promise(resolve => handle(request, {url: chrome.runtime.getURL('sidepanel/sidepanel.html')}, resolve))
  })
  const emit = (method, params, tabId = 7, sessionId) => chrome.debugger.onEvent.emit({tabId, sessionId}, method, params)
  return {
    chrome, emit, saveNoteFromMessage, scanResponsiveAccessibility,
    setOptions(next) {
      const oldValue = options
      options = next
      changes.emit({observatron: {oldValue, newValue: next}}, 'local')
    },
    finish(entry, tabId = 7, sessionId) {
      const requestId = String(++nextRequest)
      entries.set(requestId, entry)
      const {method, url, postData} = entry.request
      emit('Network.requestWillBeSent', {requestId, request: {method, url, postData: postData.text}}, tabId, sessionId)
      emit('Network.responseReceived', {requestId, response: {status: entry.response.status, mimeType: entry.response.content.mimeType}}, tabId, sessionId)
      emit('Network.loadingFinished', {requestId}, tabId, sessionId)
    }
  }
}

it('uses the Options switches to start and stop the monitors without enabling their buttons', async () => {
  const environment = captureEnvironment([{name: 'Fixture', text: 'expected text'}], {
    autoTrafficMonitoring: true, autoConsoleLogging: true
  })
  const panel = openMonitor(false, [], environment)
  await vi.waitFor(() => {
    expect(panel.status.textContent).toBe('0 matches')
    expect(panel.consoleStatus.textContent).toBe('0 entries')
    expect(environment.chrome.debugger.attach).toHaveBeenCalledTimes(1)
  })
  expect(panel.toggle.disabled).toBe(true)
  expect(panel.consoleToggle.disabled).toBe(true)
  expect(panel.toggle.textContent).toBe('Monitoring On - configure via options')
  expect(environment.chrome.debugger.attach).toHaveBeenCalledTimes(1)

  environment.setOptions({autoTrafficMonitoring: false, autoConsoleLogging: false})
  await vi.waitFor(() => {
    expect(panel.toggle.textContent).toBe('Start Monitoring')
    expect(panel.consoleToggle.disabled).toBe(false)
    expect(environment.chrome.debugger.detach).toHaveBeenCalledTimes(1)
  })
})

it('uses live capture state when the Start Monitoring reply is missing', async () => {
  const environment = captureEnvironment([])
  const send = environment.chrome.runtime.sendMessage.getMockImplementation()
  environment.chrome.runtime.sendMessage.mockImplementation(async request => {
    const reply = await send(request)
    return request.action === 'start' ? undefined : reply
  })
  const panel = openMonitor(false, [], environment)
  await vi.waitFor(() => expect(panel.consoleToggle.disabled).toBe(false))
  panel.consoleToggle.click()
  await vi.waitFor(() => {
    expect(panel.consoleToggle.textContent).toBe('Stop Monitoring')
    expect(panel.consoleStatus.textContent).toBe('0 entries')
    expect(panel.consoleToggle.disabled).toBe(false)
  })
  expect(environment.chrome.debugger.attach).toHaveBeenCalledTimes(1)
})

function openMonitor(inDevTools = true, savedRules = [], environment = captureEnvironment(savedRules)) {
  const document = new DOMParser().parseFromString(panelHtml, 'text/html')
  const appendToNoteDraft = vi.fn()
  const devtools = inDevTools ? {inspectedWindow: {tabId: 7}} : undefined
  const {chrome} = environment
  runInNewContext(`${rulesScript}\n${reportScript}\n${monitorTabsScript}\n${monitorScript}`,
    {document, appendToNoteDraft, URL, chrome: {...chrome, devtools}})

  return {
    environment,
    monitor: document.getElementById('traffic-monitor'),
    trafficTab: document.getElementById('traffic-monitor-tab'),
    trafficBadge: document.querySelector('#traffic-monitor-tab .monitor-badge'),
    overviewBadge: document.querySelector('#monitors-tab .monitor-badge'),
    monitorDisclosure: document.getElementById('observatron-monitors'),
    trafficSummaryBadge: document.querySelector('[data-monitor-summary="traffic-monitor"] .monitor-badge'),
    runtime: chrome.runtime,
    appendToNoteDraft,
    rules: document.getElementById('traffic-rules'),
    includeSaved: document.getElementById('include-saved-traffic-rules'),
    save: document.getElementById('save-selected-traffic-rules'),
    saveStatus: document.getElementById('traffic-save-status'),
    toggle: document.getElementById('toggle-traffic-monitor'),
    clear: document.getElementById('clear-traffic-matches'),
    status: document.getElementById('traffic-status'),
    matches: document.getElementById('traffic-matches'),
    networkToggle: document.getElementById('toggle-network-errors-monitor'),
    networkClear: document.getElementById('clear-network-errors-results'),
    networkResults: document.getElementById('network-errors-results'),
    networkStatus: document.getElementById('network-errors-status'),
    networkBadge: document.querySelector('#network-errors-monitor-tab .monitor-badge'),
    consoleMonitor: document.getElementById('console-monitor'),
    consoleToggle: document.getElementById('toggle-console-monitor'),
    consoleClear: document.getElementById('clear-console-results'),
    consoleResults: document.getElementById('console-results'),
    consoleStatus: document.getElementById('console-status'),
    finish: environment.finish,
    ready() {
      return vi.waitFor(() => expect(this.toggle.disabled).toBe(false))
    },
    async start() {
      await this.ready()
      this.toggle.click()
      await vi.waitFor(() => expect(this.toggle.textContent).toBe('Stop Monitoring'))
    }
  }
}

function trafficEntry(body) {
  return {
    request: {method: 'POST', url: 'https://analytics.example.test/pixel?value=private-query', postData: {text: body}},
    response: {status: 200, content: {mimeType: 'application/json; charset=utf-8', size: 120}},
    getContent: vi.fn()
  }
}

describe('Traffic Monitor', () => {
  it('starts sidebar capture only after valid rules are supplied', async () => {
    const monitor = openMonitor(false)
    const {debugger: debuggerApi} = monitor.environment.chrome
    await vi.waitFor(() => expect(monitor.toggle.disabled).toBe(false))
    monitor.trafficTab.click()
    expect(monitor.monitor.hidden).toBe(false)
    monitor.rules.value = 'invalid rule'
    monitor.toggle.click()
    await vi.waitFor(() => expect(monitor.status.textContent).toContain('line 1'))
    monitor.rules.value = 'Valid = token=123\nBroken * ('
    monitor.toggle.click()
    await vi.waitFor(() => expect(monitor.status.textContent).toContain('Invalid regular expression on line 2'))
    expect(debuggerApi.attach).not.toHaveBeenCalled()
    monitor.rules.value = 'Token = token=123'
    await monitor.start()
    expect(debuggerApi.attach).toHaveBeenCalledWith({tabId: 7}, '1.3')
    expect(monitor.rules.readOnly).toBe(true)
    monitor.toggle.click()
    await vi.waitFor(() => expect(monitor.toggle.textContent).toBe('Start Monitoring'))
    expect(debuggerApi.detach).toHaveBeenCalledWith({tabId: 7})
    expect(monitor.rules.readOnly).toBe(false)
  })

  it('uses literal, quoted and regex rules together and saves their exact matching behavior', async () => {
    const monitor = openMonitor(true, [{name: 'Legacy', text: '"legacy"'}])
    await monitor.ready()
    monitor.rules.value = [
      'Anywhere = todo',
      'Padded = "  todo  "',
      'Whole word * \\btodo\\b',
      'Number * id=\\d{3}',
      'End * $'
    ].join('\n')
    await monitor.start()

    const entry = trafficEntry('mastodon id=12 legacy')
    monitor.finish(entry)
    await vi.waitFor(() => expect(monitor.matches.childElementCount).toBe(2))
    expect([...monitor.matches.querySelectorAll('input')].map(input => input.title)).toEqual(['End * $', 'Anywhere = todo'])
    expect(monitor.matches.querySelector('mark').textContent).toBe('[empty match]')

    entry.getContent.mock.calls[0][0]('result\n|  todo  | id=123 "legacy"', '')
    await vi.waitFor(() => expect(monitor.matches.childElementCount).toBe(8))
    const responseMatches = [...monitor.matches.children].filter(row => row.querySelector('label').textContent.includes('Response'))
    expect(responseMatches.map(row => [row.querySelector('input').title, row.querySelector('mark').textContent])).toEqual([
      ['End * $', '[empty match]'],
      ['Number * id=\\d{3}', 'id=123'],
      ['Whole word * \\btodo\\b', 'todo'],
      ['Padded = "  todo  "', '  todo  '],
      ['Anywhere = todo', 'todo'],
      ['Legacy = ""legacy""', '"legacy"']
    ])
    responseMatches[1].querySelector('input').click()
    responseMatches[3].querySelector('input').click()
    monitor.save.click()
    await vi.waitFor(() => expect(monitor.saveStatus.textContent).toBe('Selected rules are saved in Options.'))
    expect(monitor.runtime.sendMessage).toHaveBeenLastCalledWith({
      method: 'changeSavedTrafficRules', action: 'add', rules: [
        {name: 'Number', text: 'id=\\d{3}', mode: 'regex'},
        {name: 'Padded', text: '  todo  '}
      ]
    })
  })

  it('shows the resource and body evidence for each match and adds its location to a note', async () => {
    const monitor = openMonitor()
    await monitor.ready()
    monitor.rules.value = 'Checkout email = example-marker\nDifferent case = EXAMPLE-MARKER'
    await monitor.start()
    const entry = trafficEntry('{"email":"example-marker","other":"private-body"}')
    monitor.finish(entry)
    entry.getContent.mock.calls[0][0](
      `Outside snippet ${'x'.repeat(100)}\rsecond line\r\n    example-marker <span>body text</span>${'y'.repeat(100)} end of body`, ''
    )

    await vi.waitFor(() => expect(monitor.matches.childElementCount).toBe(2))
    const [response, request] = monitor.matches.children
    expect(request.querySelector('label').textContent).toContain('Checkout email · Request · POST https://analytics.example.test/pixel')
    expect(response.querySelector('label').textContent).toContain('Checkout email · Response · POST https://analytics.example.test/pixel')
    expect(response.querySelector('label').textContent).not.toContain('private-query')
    const details = response.querySelector('details')
    expect(details.open).toBe(false)
    expect(details.textContent).toContain('Request URL: https://analytics.example.test/pixel?value=private-query')
    expect(details.textContent).toContain('Response body · HTTP 200 · application/json; charset=utf-8 · First match at line 3, column 5')
    expect(details.querySelector('mark').textContent).toBe('example-marker')
    expect(details.querySelector('pre').textContent).toMatch(/^…[\s\S]*<span>body text<\/span>[\s\S]*…$/)
    expect(details.querySelector('pre span')).toBeNull()
    expect(details.textContent).not.toContain('Outside snippet')
    expect(details.textContent).not.toContain('end of body')

    response.querySelector('button').click()
    const note = monitor.appendToNoteDraft.mock.calls[0][0]
    expect(note).toContain('Traffic Monitor match for Checkout email')
    expect(note).toContain('Response · POST https://analytics.example.test/pixel')
    expect(note).toContain('First match at line 3, column 5')
    for (const privateText of ['example-marker', 'body text', 'private-query']) {
      expect(note).not.toContain(privateText)
    }
  })

  it('discards pending response results after clearing or restarting monitoring', async () => {
    const monitor = openMonitor()
    await monitor.ready()
    monitor.rules.value = 'Marker = example-marker'
    await monitor.start()
    const cleared = trafficEntry('example-marker')
    monitor.finish(cleared)
    await vi.waitFor(() => expect(monitor.matches.childElementCount).toBe(1))
    monitor.clear.click()
    await vi.waitFor(() => expect(monitor.matches.childElementCount).toBe(0))
    cleared.getContent.mock.calls[0][0]('example-marker', '')
    expect(monitor.matches.childElementCount).toBe(0)

    const stopped = trafficEntry('')
    monitor.finish(stopped)
    monitor.toggle.click()
    await vi.waitFor(() => expect(monitor.toggle.textContent).toBe('Start Monitoring'))
    await monitor.start()
    stopped.getContent.mock.calls[0][0]('example-marker', '')
    expect(monitor.matches.childElementCount).toBe(0)

    const current = trafficEntry('')
    monitor.finish(current)
    current.getContent.mock.calls[0][0]('example-marker', '')
    await vi.waitFor(() => expect(monitor.matches.childElementCount).toBe(1))
    expect(monitor.matches.firstElementChild.textContent).toContain('Response')
  })

  it('shows the count and cycles badge colors while the traffic tab is unselected', async () => {
    const monitor = openMonitor()
    await monitor.ready()
    const heading = monitor.monitor.querySelector('h2')
    monitor.rules.value = 'Marker = example-marker'
    await monitor.start()

    expect(monitor.monitor.hidden).toBe(true)
    expect(heading.textContent).toBe('Traffic Monitor (0 matches)')
    expect(heading.style.color).toBe('')
    expect(monitor.trafficBadge.hidden).toBe(true)
    expect(monitor.overviewBadge.hidden).toBe(true)
    expect(monitor.monitorDisclosure.open).toBe(false)
    expect(monitor.trafficSummaryBadge.hidden).toBe(true)
    expect(monitor.monitorDisclosure.querySelector('summary').textContent.replace(/\s+/g, ' ').trim())
      .toBe('Monitors - Axe, HTML Comments, Links, Images, Traffic, Network Errors, Console')

    const colors = []
    for (let index = 1; index <= 7; index++) {
      monitor.finish(trafficEntry('example-marker'))
      const label = index === 1 ? '1 match' : `${index} matches`
      await vi.waitFor(() => expect(heading.textContent).toBe(`Traffic Monitor (${label})`))
      expect(monitor.trafficBadge.textContent).toBe(` (${index})`)
      expect(monitor.overviewBadge.textContent).toBe(` (${index})`)
      expect(monitor.trafficSummaryBadge.textContent).toBe(` (${index})`)
      expect(monitor.trafficSummaryBadge.style.color).toBe(monitor.trafficBadge.style.color)
      expect(monitor.overviewBadge.style.color).toBe(monitor.trafficBadge.style.color)
      colors.push(monitor.trafficBadge.style.color)
    }

    expect(colors.slice(0, 3)).toEqual(['rgb(185, 28, 28)', 'rgb(22, 101, 52)', 'rgb(29, 78, 216)'])
    expect(new Set(colors.slice(0, 6)).size).toBe(6)
    expect(colors[6]).toBe(colors[0])
    expect(monitor.monitor.hidden).toBe(true)

    monitor.clear.click()
    await vi.waitFor(() => expect(heading.textContent).toBe('Traffic Monitor (0 matches)'))
    expect(heading.style.color).toBe('')
    expect(monitor.trafficBadge.hidden).toBe(true)
    expect(monitor.overviewBadge.hidden).toBe(true)
    expect(monitor.trafficSummaryBadge.hidden).toBe(true)
  })

  it('combines saved and session rules and saves only the rules for selected matches', async () => {
    const monitor = openMonitor(true, [{name: 'Saved', text: 'saved-marker'}])
    await monitor.ready()
    monitor.rules.value = 'Saved = saved-marker\nNew = select-marker\nTemporary = keep-local'
    await monitor.start()
    for (const marker of ['saved-marker', 'select-marker', 'keep-local']) {
      monitor.finish(trafficEntry(marker))
    }
    monitor.finish(trafficEntry('select-marker'))
    await vi.waitFor(() => expect(monitor.matches.childElementCount).toBe(4))
    expect(monitor.save.disabled).toBe(true)
    expect(monitor.runtime.sendMessage).toHaveBeenCalledTimes(1)

    for (const checkbox of monitor.matches.querySelectorAll('[title="New = select-marker"]')) checkbox.click()
    monitor.save.click()
    await vi.waitFor(() => expect(monitor.saveStatus.textContent).toBe('Selected rules are saved in Options.'))
    expect(monitor.runtime.sendMessage).toHaveBeenLastCalledWith({
      method: 'changeSavedTrafficRules', action: 'add', rules: [{name: 'New', text: 'select-marker'}]
    })
    expect(monitor.save.disabled).toBe(true)

    monitor.toggle.click()
    await vi.waitFor(() => expect(monitor.toggle.textContent).toBe('Start Monitoring'))
    monitor.clear.click()
    await vi.waitFor(() => expect(monitor.matches.childElementCount).toBe(0))
    monitor.includeSaved.checked = false
    monitor.rules.value = 'Temporary = keep-local'
    await monitor.start()
    monitor.finish(trafficEntry('saved-marker'))
    monitor.finish(trafficEntry('keep-local'))
    await vi.waitFor(() => expect(monitor.matches.childElementCount).toBe(1))
    expect(monitor.matches.textContent).toContain('Temporary · Request')
  })

  it('shares the tab report with DevTools and keeps sidebar reports separate when switching tabs', async () => {
    const sidebar = openMonitor(false)
    const {tabs, debugger: debuggerApi} = sidebar.environment.chrome
    const devtools = openMonitor(true, [], sidebar.environment)
    await vi.waitFor(() => expect(sidebar.toggle.disabled).toBe(false))
    sidebar.rules.value = 'Marker = example-marker'
    await sidebar.start()
    sidebar.finish(trafficEntry('example-marker'))
    await vi.waitFor(() => {
      expect(sidebar.matches.childElementCount).toBe(1)
      expect(devtools.matches.childElementCount).toBe(1)
    })
    expect(devtools.toggle.textContent).toBe('Stop Monitoring')
    expect(debuggerApi.attach).toHaveBeenCalledOnce()

    tabs.query.mockResolvedValue([{id: 8}])
    tabs.onActivated.emit()
    await vi.waitFor(() => expect(sidebar.matches.childElementCount).toBe(0))
    expect(devtools.matches.childElementCount).toBe(1)
    expect(debuggerApi.detach).not.toHaveBeenCalled()

    tabs.query.mockResolvedValue([{id: 7}])
    tabs.onActivated.emit()
    await vi.waitFor(() => expect(sidebar.matches.childElementCount).toBe(1))
    debuggerApi.onDetach.emit({tabId: 7}, 'canceled_by_user')
    await vi.waitFor(() => expect(sidebar.status.textContent).toContain('Monitoring cancelled in Chrome.'))
    expect(sidebar.matches.childElementCount).toBe(1)
    expect(sidebar.toggle.textContent).toBe('Start Monitoring')
  })
})

it('captures console messages and exceptions, shares the debugger, and clears results independently', async () => {
  const monitor = openMonitor(false)
  const {chrome, emit} = monitor.environment
  await vi.waitFor(() => expect(monitor.toggle.disabled).toBe(false))
  monitor.rules.value = 'Marker = example-marker'
  await monitor.start()
  monitor.consoleToggle.click()
  await vi.waitFor(() => expect(monitor.consoleToggle.textContent).toBe('Stop Monitoring'))
  expect(chrome.debugger.attach).toHaveBeenCalledOnce()
  monitor.finish(trafficEntry('example-marker'))

  const stackTrace = {callFrames: [{functionName: 'example', url: 'https://staging.example.test/script.js', lineNumber: 9, columnNumber: 2}]}
  emit('Runtime.consoleAPICalled', {type: 'warning', args: [{value: '<b>warning</b>'}], stackTrace, timestamp: Date.now()})
  emit('Runtime.exceptionThrown', {exceptionDetails: {text: 'Uncaught', exception: {description: 'Error: thrown'}, stackTrace}, timestamp: Date.now()})
  emit('Runtime.consoleAPICalled', {type: 'log', args: [{value: 'another tab'}], timestamp: Date.now()}, 8)
  await vi.waitFor(() => expect(monitor.consoleResults.childElementCount).toBe(2))
  expect(monitor.overviewBadge.textContent).toBe(' (3)')
  expect(monitor.consoleMonitor.querySelector('h2').textContent).toBe('Console Monitor (2 entries)')
  expect(monitor.consoleResults.textContent).toContain('console.warn · <b>warning</b>')
  expect(monitor.consoleResults.querySelector('b')).toBeNull()
  monitor.consoleResults.querySelector('button').click()
  expect(monitor.appendToNoteDraft).toHaveBeenCalledWith(expect.stringContaining('Uncaught Error: thrown'))
  expect(monitor.appendToNoteDraft).toHaveBeenCalledWith(expect.stringContaining('script.js:10:3'))

  monitor.consoleClear.click()
  await vi.waitFor(() => expect(monitor.consoleResults.childElementCount).toBe(0))
  expect(monitor.overviewBadge.textContent).toBe(' (1)')
  expect(monitor.consoleToggle.textContent).toBe('Stop Monitoring')
  monitor.consoleToggle.click()
  await vi.waitFor(() => expect(monitor.consoleToggle.textContent).toBe('Start Monitoring'))
  expect(chrome.debugger.detach).not.toHaveBeenCalled()
  monitor.toggle.click()
  await vi.waitFor(() => expect(monitor.toggle.textContent).toBe('Start Monitoring'))
  expect(chrome.debugger.detach).toHaveBeenCalledWith({tabId: 7})
})

it('reports network errors independently of Traffic while sharing the Network domain', async () => {
  const panel = openMonitor(false)
  const {chrome, emit} = panel.environment
  await vi.waitFor(() => expect(panel.networkToggle.disabled).toBe(false))
  panel.networkToggle.click()
  await vi.waitFor(() => expect(panel.networkToggle.textContent).toBe('Stop Monitoring'))
  expect(panel.networkStatus.textContent).toBe('0 errors')
  panel.rules.value = 'Marker = example-marker'
  await panel.start()
  expect(chrome.debugger.attach).toHaveBeenCalledOnce()
  expect(chrome.debugger.sendCommand.mock.calls.filter(([, method]) => method === 'Network.enable')).toHaveLength(1)

  const page = 'https://staging.example.test/checkout'
  const resource = 'https://analytics.example.test/collect?batch=1'
  emit('Network.requestWillBeSent', {requestId: 'http', documentURL: page, type: 'Fetch',
    request: {method: 'POST', url: resource}})
  emit('Network.responseReceived', {requestId: 'http', response: {status: 503, statusText: 'Service Unavailable', mimeType: 'image/gif'}})
  emit('Network.loadingFailed', {requestId: 'http', errorText: 'net::ERR_FAILED'})

  emit('Network.requestWillBeSent', {requestId: 'blocked', documentURL: page, type: 'Script',
    request: {method: 'GET', url: 'https://elsewhere.example.test/script.js'}})
  emit('Network.loadingFailed', {requestId: 'blocked', errorText: 'net::ERR_NAME_NOT_RESOLVED'})
  emit('Network.requestWillBeSent', {requestId: 'canceled', documentURL: page, request: {method: 'GET', url: resource}})
  emit('Network.loadingFailed', {requestId: 'canceled', canceled: true, errorText: 'net::ERR_ABORTED'})

  await vi.waitFor(() => expect(panel.networkResults.childElementCount).toBe(2))
  expect(panel.networkBadge.textContent).toBe(' (2)')
  expect(panel.overviewBadge.textContent).toBe(' (2)')
  expect(panel.matches.childElementCount).toBe(0)
  expect(panel.networkResults.textContent).toContain('net::ERR_NAME_NOT_RESOLVED')
  panel.networkResults.lastElementChild.querySelector('button').click()
  expect(panel.appendToNoteDraft).toHaveBeenCalledWith(expect.stringContaining(`HTTP 503 Service Unavailable\nPOST ${resource}\nPage: ${page}`))

  panel.networkClear.click()
  await vi.waitFor(() => expect(panel.networkBadge.hidden).toBe(true))
  panel.networkToggle.click()
  await vi.waitFor(() => expect(panel.networkToggle.textContent).toBe('Start Monitoring'))
  expect(chrome.debugger.detach).not.toHaveBeenCalled()
  expect(chrome.debugger.sendCommand.mock.calls.some(([, method]) => method === 'Network.disable')).toBe(false)
  const traffic = trafficEntry('example-marker')
  traffic.getContent.mockImplementation(callback => callback('', undefined))
  panel.finish(traffic)
  await vi.waitFor(() => expect(panel.matches.childElementCount).toBe(1))
})

it('saves automatic network errors as AutoNotes and switches to reports without restarting', async () => {
  const environment = captureEnvironment([], {autoNetworkErrors: true, networkErrorsOutput: 'notes'})
  const panel = openMonitor(false, [], environment)
  const {chrome, emit, saveNoteFromMessage} = environment
  const request = {method: 'GET', url: 'https://staging.example.test/missing'}
  await vi.waitFor(() => expect(panel.networkStatus.textContent).toContain('New errors are saved as AutoNotes.'))
  expect(panel.networkToggle.disabled).toBe(true)
  emit('Network.requestWillBeSent', {requestId: '1', request})
  emit('Network.responseReceived', {requestId: '1', response: {status: 404}})
  expect(saveNoteFromMessage).toHaveBeenCalledWith(expect.stringContaining(`@AutoNote Network Error · HTTP 404\nGET ${request.url}`))
  expect(panel.networkResults.childElementCount).toBe(0)

  environment.setOptions({autoNetworkErrors: true, networkErrorsOutput: 'report'})
  await vi.waitFor(() => expect(panel.networkStatus.textContent).toBe('0 errors'))
  emit('Network.requestWillBeSent', {requestId: '2', request})
  emit('Network.responseReceived', {requestId: '2', response: {status: 404}})
  await vi.waitFor(() => expect(panel.networkResults.childElementCount).toBe(1))
  expect(saveNoteFromMessage).toHaveBeenCalledOnce()
  expect(chrome.debugger.attach).toHaveBeenCalledOnce()
  expect(chrome.debugger.detach).not.toHaveBeenCalled()
})

it('scans each responsive width in the same document and restores the viewport after a scan failure', async () => {
  const environment = captureEnvironment([])
  const {chrome, scanResponsiveAccessibility} = environment
  const url = 'https://staging.example.test/'
  let width = 1024
  let failScan = false
  chrome.debugger.sendCommand.mockImplementation(async (target, method, params) => {
    if (method === 'Emulation.setDeviceMetricsOverride') width = params.width
    if (method === 'Emulation.clearDeviceMetricsOverride') width = 1024
  })
  const scans = []
  chrome.scripting = {executeScript: vi.fn(async ({target, func, files, args}) => {
    if (!target.documentIds) return [{documentId: 'document', result: {url, height: 720}}]
    expect(target.documentIds).toEqual(['document'])
    if (files) return [{documentId: 'document'}]
    if (func.name === 'waitForViewportLayout') return [{result: width}]
    if (!args) return [{}]
    expect(args[1]).toBe(false)
    scans.push(width)
    if (failScan && width === 768) throw new Error('Axe failed')
    return [{result: {url, violations: width === 360 ? [{id: 'button-name'}] : [], needsReview: []}}]
  })}
  const result = await scanResponsiveAccessibility(7, url)
  expect(scans).toEqual([360, 768, 1280])
  expect(result.viewports.map(result => [result.width, result.violations.length])).toEqual([[360, 1], [768, 0], [1280, 0]])
  expect(width).toBe(1024)
  expect(chrome.debugger.detach).toHaveBeenCalledWith({tabId: 7})

  const panel = openMonitor(false, [], environment)
  await vi.waitFor(() => expect(panel.networkToggle.disabled).toBe(false))
  panel.networkToggle.click()
  await vi.waitFor(() => expect(panel.networkToggle.textContent).toBe('Stop Monitoring'))
  failScan = true
  await expect(scanResponsiveAccessibility(7, url)).rejects.toThrow('Axe failed')
  expect(width).toBe(1024)
  expect(chrome.debugger.attach).toHaveBeenCalledTimes(2)
  expect(chrome.debugger.detach).toHaveBeenCalledOnce()
  expect(panel.networkToggle.textContent).toBe('Stop Monitoring')
})
