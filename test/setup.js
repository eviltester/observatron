import { vi } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = resolve(__dirname, '..')

// Helper to load JS file and make its functions available globally
function loadSourceFile(relativePath) {
  const filePath = resolve(rootDir, relativePath)
  const code = readFileSync(filePath, 'utf-8')
  
  // Execute in global scope
  // eslint-disable-next-line no-new-func
  const fn = new Function(code)
  fn()
}

// Load source files
loadSourceFile('chrome/javascript/filenames.js')
loadSourceFile('chrome/javascript/observatron_options.js')

// Global chrome mock
global.chrome = createChromeMock()

// Mock timers for timeout testing
vi.useFakeTimers()

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

function createChromeMock() {
  return {
    runtime: {
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      },
      getURL: vi.fn((path) => `chrome-extension://test-id/${path}`),
      lastError: null,
      onSuspend: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      id: 'test-extension-id'
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn()
      },
      onChanged: {
        addListener: vi.fn()
      }
    },
    tabs: {
      query: vi.fn(),
      captureVisibleTab: vi.fn(),
      get: vi.fn(),
      sendMessage: vi.fn(),
      onUpdated: { addListener: vi.fn() },
      TAB_ID_NONE: -1,
      create: vi.fn(),
      getCurrent: vi.fn()
    },
    downloads: {
      download: vi.fn()
    },
    action: {
      setIcon: vi.fn(),
      setTitle: vi.fn(),
      onClicked: { addListener: vi.fn() }
    },
    commands: {
      onCommand: { addListener: vi.fn() }
    },
    contextMenus: {
      create: vi.fn(),
      update: vi.fn(),
      removeAll: vi.fn(),
      onClicked: { addListener: vi.fn() }
    },
    sidePanel: {
      setOptions: vi.fn(),
      open: vi.fn()
    },
    pageCapture: {
      saveAsMHTML: vi.fn()
    },
    scripting: {
      executeScript: vi.fn()
    },
    webNavigation: {
      onCompleted: { addListener: vi.fn() }
    },
    webRequest: {
      onBeforeRequest: { addListener: vi.fn() }
    },
    devtools: {
      panels: {
        create: vi.fn()
      },
      inspectedWindow: {
        tabId: 1,
        eval: vi.fn()
      }
    }
  }
}
