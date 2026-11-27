import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const panelPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../chrome/sidepanel')
const panelHtml = readFileSync(resolve(panelPath, 'sidepanel.html'), 'utf8')
const monitorScript = readFileSync(resolve(panelPath, 'traffic_monitor.js'), 'utf8')
const rulesScript = readFileSync(resolve(panelPath, '../javascript/traffic_rules.js'), 'utf8')

function event() {
  const listeners = []
  return {
    addListener: listener => listeners.push(listener),
    emit: (...args) => listeners.forEach(listener => listener(...args))
  }
}

function countPort(name) {
  return {name, onMessage: event(), onDisconnect: event(), postMessage: vi.fn(), disconnect: vi.fn()}
}

function openMonitor(inDevTools = true, savedRules = []) {
  const panel = new DOMParser().parseFromString(panelHtml, 'text/html')
  const monitor = panel.getElementById('traffic-monitor')
  const sidebarNote = panel.getElementById('traffic-monitor-sidebar-note')
  document.body.replaceChildren(sidebarNote, monitor)

  const listeners = new Set()
  const network = {onRequestFinished: {
    addListener: listener => listeners.add(listener),
    removeListener: listener => listeners.delete(listener)
  }}
  const appendToNoteDraft = vi.fn()
  const runtime = {
    onMessage: event(),
    onConnect: event(),
    getURL: path => `chrome-extension://observatron/${path}`,
    sendMessage: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn(({name}) => countPort(name))
  }
  const storage = {local: {get: vi.fn().mockResolvedValue({observatronTrafficRules: savedRules})}}
  const tabs = {query: vi.fn().mockResolvedValue([{id: 7}]), onActivated: event()}
  const devtools = inDevTools ? {network, inspectedWindow: {tabId: 7}} : undefined
  runInNewContext(`${rulesScript}\n${monitorScript}`, {document, URL, crypto, appendToNoteDraft, chrome: {runtime, tabs, devtools, storage}})

  return {
    monitor,
    sidebarNote,
    runtime,
    tabs,
    listeners,
    appendToNoteDraft,
    rules: document.getElementById('traffic-rules'),
    includeSaved: document.getElementById('include-saved-traffic-rules'),
    save: document.getElementById('save-selected-traffic-rules'),
    saveStatus: document.getElementById('traffic-save-status'),
    toggle: document.getElementById('toggle-traffic-monitor'),
    clear: document.getElementById('clear-traffic-matches'),
    status: document.getElementById('traffic-status'),
    matches: document.getElementById('traffic-matches'),
    finish: entry => listeners.forEach(listener => listener(entry)),
    async start() {
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
  it('is available only in DevTools and starts after valid rules are supplied', async () => {
    const sidebar = openMonitor(false)
    expect(sidebar.monitor.hidden).toBe(true)
    expect(sidebar.sidebarNote.hidden).toBe(false)
    expect(sidebar.sidebarNote.textContent).toContain('Test Observatron tab in DevTools')
    const monitor = openMonitor()
    expect(monitor.monitor.hidden).toBe(false)
    expect(monitor.sidebarNote.hidden).toBe(true)
    expect(monitor.listeners.size).toBe(0)
    monitor.rules.value = 'invalid rule'
    monitor.toggle.click()
    expect(monitor.status.textContent).toContain('line 1')
    expect(monitor.listeners.size).toBe(0)
    monitor.rules.value = 'Valid = token=123\nBroken * ('
    monitor.toggle.click()
    expect(monitor.status.textContent).toContain('Invalid regular expression on line 2')
    expect(monitor.listeners.size).toBe(0)
    monitor.rules.value = 'Token = token=123'
    await monitor.start()
    expect(monitor.listeners.size).toBe(1)
    expect(monitor.rules.readOnly).toBe(true)
    monitor.toggle.click()
    expect(monitor.listeners.size).toBe(0)
    expect(monitor.rules.readOnly).toBe(false)
  })

  it('uses literal, quoted and regex rules together and saves their exact matching behavior', async () => {
    const monitor = openMonitor(true, [{name: 'Legacy', text: '"legacy"'}])
    monitor.rules.value = [
      'Anywhere = todo',
      'Padded = "  todo  "',
      'Whole word * \\btodo\\b',
      'Number * id=\\d{3}',
      'End * $'
    ].join('\n')
    monitor.runtime.sendMessage.mockResolvedValue({success: true})
    await monitor.start()

    const entry = trafficEntry('mastodon id=12 legacy')
    monitor.finish(entry)
    expect([...monitor.matches.querySelectorAll('input')].map(input => input.title)).toEqual(['End * $', 'Anywhere = todo'])
    expect(monitor.matches.querySelector('mark').textContent).toBe('[empty match]')

    entry.getContent.mock.calls[0][0]('result\n|  todo  | id=123 "legacy"', '')
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
    monitor.rules.value = 'Checkout email = example-marker\nDifferent case = EXAMPLE-MARKER'
    await monitor.start()
    const entry = trafficEntry('{"email":"example-marker","other":"private-body"}')
    monitor.finish(entry)
    entry.getContent.mock.calls[0][0](
      `Outside snippet ${'x'.repeat(100)}\rsecond line\r\n    example-marker <span>body text</span>${'y'.repeat(100)} end of body`, ''
    )

    expect(monitor.matches.childElementCount).toBe(2)
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
    monitor.rules.value = 'Marker = example-marker'
    await monitor.start()
    const cleared = trafficEntry('example-marker')
    monitor.finish(cleared)
    expect(monitor.matches.childElementCount).toBe(1)
    monitor.clear.click()
    cleared.getContent.mock.calls[0][0]('example-marker', '')
    expect(monitor.matches.childElementCount).toBe(0)

    const stopped = trafficEntry('')
    monitor.finish(stopped)
    monitor.toggle.click()
    await monitor.start()
    stopped.getContent.mock.calls[0][0]('example-marker', '')
    expect(monitor.matches.childElementCount).toBe(0)

    const current = trafficEntry('')
    monitor.finish(current)
    current.getContent.mock.calls[0][0]('example-marker', '')
    expect(monitor.matches.childElementCount).toBe(1)
  })

  it('shows the count and cycles through bold heading colors while collapsed', async () => {
    const monitor = openMonitor()
    const heading = monitor.monitor.querySelector('summary')
    monitor.rules.value = 'Marker = example-marker'
    await monitor.start()

    expect(monitor.monitor.open).toBe(false)
    expect(heading.textContent).toBe('Traffic Monitor (0 matches)')
    expect(heading.style.color).toBe('')

    const colors = []
    for (let index = 1; index <= 7; index++) {
      monitor.finish(trafficEntry('example-marker'))
      const label = index === 1 ? '1 match' : `${index} matches`
      expect(heading.textContent).toBe(`Traffic Monitor (${label})`)
      colors.push(heading.style.color)
    }

    expect(colors.slice(0, 3)).toEqual(['rgb(185, 28, 28)', 'rgb(22, 101, 52)', 'rgb(29, 78, 216)'])
    expect(new Set(colors.slice(0, 6)).size).toBe(6)
    expect(colors[6]).toBe(colors[0])
    expect(monitor.monitor.open).toBe(false)

    monitor.clear.click()
    expect(heading.textContent).toBe('Traffic Monitor (0 matches)')
    expect(heading.style.color).toBe('')
  })

  it('publishes to a sidebar for the inspected tab and removes closed channels', async () => {
    const monitor = openMonitor()
    const channel = 'observatron-traffic-count:sidebar'
    const sender = {url: monitor.runtime.getURL('sidepanel/sidepanel.html')}
    const message = {type: 'observatron-traffic-subscribe', channel, tabId: 7}
    monitor.runtime.onMessage.emit({...message, tabId: 8}, sender)
    expect(monitor.runtime.connect).not.toHaveBeenCalled()

    monitor.rules.value = 'Marker = example-marker'
    await monitor.start()
    monitor.finish(trafficEntry('example-marker'))
    monitor.runtime.onMessage.emit(message, sender)
    const port = monitor.runtime.connect.mock.results[0].value
    expect(port.postMessage).toHaveBeenLastCalledWith(1)
    monitor.finish(trafficEntry('example-marker'))
    expect(port.postMessage).toHaveBeenLastCalledWith(2)
    monitor.clear.click()
    expect(port.postMessage).toHaveBeenLastCalledWith(0)

    port.onDisconnect.emit()
    monitor.finish(trafficEntry('example-marker'))
    expect(port.postMessage).toHaveBeenCalledTimes(3)
  })

  it('combines saved and session rules and saves only the rules for selected matches', async () => {
    const monitor = openMonitor(true, [{name: 'Saved', text: 'saved-marker'}])
    monitor.rules.value = 'Saved = saved-marker\nNew = select-marker\nTemporary = keep-local'
    monitor.runtime.sendMessage.mockResolvedValue({success: true})
    await monitor.start()
    for (const marker of ['saved-marker', 'select-marker', 'keep-local']) {
      monitor.finish(trafficEntry(marker))
    }
    monitor.finish(trafficEntry('select-marker'))
    expect(monitor.matches.childElementCount).toBe(4)
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
    monitor.clear.click()
    monitor.includeSaved.checked = false
    monitor.rules.value = 'Temporary = keep-local'
    await monitor.start()
    monitor.finish(trafficEntry('saved-marker'))
    monitor.finish(trafficEntry('keep-local'))
    expect(monitor.matches.childElementCount).toBe(1)
    expect(monitor.matches.textContent).toContain('Temporary · Request')
  })

  it('mirrors the active tab in the non-interactive sidebar and resets on tab switch or disconnect', async () => {
    const sidebar = openMonitor(false)
    const title = sidebar.sidebarNote.querySelector('#traffic-monitor-sidebar-title')
    await vi.waitFor(() => expect(sidebar.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({tabId: 7})))
    const [subscription] = sidebar.runtime.sendMessage.mock.lastCall
    expect(subscription.tabId).toBe(7)
    const wrongPort = countPort('observatron-traffic-count:another-sidebar')
    sidebar.runtime.onConnect.emit(wrongPort)
    wrongPort.onMessage.emit(3)
    expect(title.textContent).toBe('Traffic Monitor (0 matches)')

    const firstPort = countPort(subscription.channel)
    sidebar.runtime.onConnect.emit(firstPort)
    firstPort.onMessage.emit(2)
    expect(title.textContent).toBe('Traffic Monitor (2 matches)')
    expect(title.style.color).toBe('rgb(22, 101, 52)')
    expect(sidebar.sidebarNote.querySelector('button, a, input, [tabindex]')).toBeNull()

    sidebar.tabs.query.mockResolvedValue([{id: 8}])
    sidebar.tabs.onActivated.emit()
    await vi.waitFor(() => expect(sidebar.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({tabId: 8})))
    const [newSubscription] = sidebar.runtime.sendMessage.mock.lastCall
    expect(newSubscription.tabId).toBe(8)
    expect(firstPort.disconnect).toHaveBeenCalledOnce()
    firstPort.onMessage.emit(5)
    expect(title.textContent).toBe('Traffic Monitor (0 matches)')

    const newPort = countPort(newSubscription.channel)
    sidebar.runtime.onConnect.emit(newPort)
    newPort.onMessage.emit(1)
    expect(title.style.color).toBe('rgb(185, 28, 28)')
    newPort.onDisconnect.emit()
    expect(title.textContent).toBe('Traffic Monitor (0 matches)')
    expect(title.style.color).toBe('')
  })
})
