import { vi } from 'vitest'

export function createChromeMock() {
  const mockChrome = {
    runtime: {
      sendMessage: vi.fn((message, callback) => {
        if (callback) callback({ success: true })
        return Promise.resolve({ success: true })
      }),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      },
      getURL: vi.fn((path) => `chrome-extension://test-id/${path}`),
      lastError: null,
      onSuspend: {
        addListener: vi.fn()
      },
      onInstalled: {
        addListener: vi.fn()
      },
      onStartup: {
        addListener: vi.fn()
      },
      id: 'test-extension-id'
    },
    storage: {
      local: {
        get: vi.fn((keys, callback) => {
          const data = {}
          if (callback) callback(data)
          return Promise.resolve(data)
        }),
        set: vi.fn((items, callback) => {
          if (callback) callback()
          return Promise.resolve()
        }),
        remove: vi.fn((keys, callback) => {
          if (callback) callback()
          return Promise.resolve()
        }),
        clear: vi.fn((callback) => {
          if (callback) callback()
          return Promise.resolve()
        })
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    },
    tabs: {
      query: vi.fn((query, callback) => {
        const mockTabs = [{ id: 1, url: 'https://example.com', active: true, currentWindow: true }]
        if (callback) callback(mockTabs)
        return Promise.resolve(mockTabs)
      }),
      captureVisibleTab: vi.fn((windowId, options, callback) => {
        const dataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        if (callback) callback(dataURL)
        return Promise.resolve(dataURL)
      }),
      get: vi.fn((tabId, callback) => {
        const mockTab = { id: tabId, url: 'https://example.com', windowId: 1 }
        if (callback) callback(mockTab)
        return Promise.resolve(mockTab)
      }),
      sendMessage: vi.fn((tabId, message, callback) => {
        if (callback) callback({ success: true })
        return Promise.resolve({ success: true })
      }),
      onUpdated: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      },
      TAB_ID_NONE: -1,
      create: vi.fn((createProperties) => {
        return Promise.resolve({ id: 2 })
      }),
      getCurrent: vi.fn((callback) => {
        const mockTab = { id: 1, url: 'https://example.com', active: true }
        if (callback) callback(mockTab)
        return Promise.resolve(mockTab)
      })
    },
    downloads: {
      download: vi.fn((options, callback) => {
        const downloadId = 12345
        if (callback) callback(downloadId)
        return Promise.resolve(downloadId)
      })
    },
    action: {
      setIcon: vi.fn((details, callback) => {
        if (callback) callback()
        return Promise.resolve()
      }),
      setTitle: vi.fn((details, callback) => {
        if (callback) callback()
        return Promise.resolve()
      }),
      onClicked: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    },
    commands: {
      onCommand: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    },
    contextMenus: {
      create: vi.fn((createProperties, callback) => {
        const menuItemId = 'menu-item-id'
        if (callback) callback(menuItemId)
        return menuItemId
      }),
      update: vi.fn((id, updateProperties, callback) => {
        if (callback) callback()
        return Promise.resolve()
      }),
      removeAll: vi.fn((callback) => {
        if (callback) callback()
        return Promise.resolve()
      }),
      onClicked: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    },
    sidePanel: {
      setOptions: vi.fn((options, callback) => {
        if (callback) callback()
        return Promise.resolve()
      }),
      open: vi.fn((options) => {
        return Promise.resolve()
      })
    },
    pageCapture: {
      saveAsMHTML: vi.fn((details, callback) => {
        const mhtmlData = new Blob(['test mhtml content'], { type: 'multipart/related' })
        if (callback) callback(mhtmlData)
        return Promise.resolve(mhtmlData)
      })
    },
    scripting: {
      executeScript: vi.fn((inject, callback) => {
        const result = [{ result: 'mock script result' }]
        if (callback) callback(result)
        return Promise.resolve(result)
      })
    },
    webNavigation: {
      onCompleted: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    },
    webRequest: {
      onBeforeRequest: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    },
    devtools: {
      panels: {
        create: vi.fn((title, iconPath, pagePath) => {
          return { onShown: { addListener: vi.fn() }, onHidden: { addListener: vi.fn() } }
        })
      },
      inspectedWindow: {
        tabId: 1,
        eval: vi.fn((expression, callback) => {
          if (callback) callback(null, false)
          return Promise.resolve()
        })
      }
    }
  }

  // Reset all mocks
  Object.keys(mockChrome).forEach(key => {
    if (typeof mockChrome[key] === 'object' && mockChrome[key] !== null) {
      Object.keys(mockChrome[key]).forEach(subKey => {
        if (typeof mockChrome[key][subKey] === 'function' && vi.isMockFunction(mockChrome[key][subKey])) {
          mockChrome[key][subKey].mockClear()
        }
      })
    }
  })

  return mockChrome
}
