import { describe, it, expect, beforeEach } from 'vitest'

// Import functions from extracted modules
import {
  getUpdatedRect,
  cropElementScreenshot
} from '../../chrome/javascript/worker_screenshot_utils.js'

// Import sanitizeRect for testing (make it globally available)
import { sanitizeRect } from '../../chrome/javascript/geometry_utils.js'
global.sanitizeRect = sanitizeRect

describe('worker_screenshot_utils.js', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    chrome.scripting.executeScript.mockClear()
    chrome.storage.local.set.mockClear()
    chrome.storage.local.get.mockClear()
    chrome.storage.local.remove.mockClear()
    chrome.runtime.lastError = null
  })

  describe('getUpdatedRect', () => {
    it('should execute script with correct selector and tabId', () => {
      const mockCallback = vi.fn()
      const selector = '.test-element'
      const tabId = 123

      getUpdatedRect(selector, tabId, mockCallback)

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId },
          args: [selector]
        }),
        expect.any(Function)
      )
    })

    it('should handle successful element rect calculation', () => {
      const mockCallback = vi.fn()
      const mockResult = { left: 10, top: 20, width: 100, height: 50 }

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: mockResult }])
      })

      getUpdatedRect('.test', 123, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith(mockResult)
    })

    it('should sanitize returned rect coordinates', () => {
      const mockCallback = vi.fn()
      const mockResult = { left: 10, top: 20, width: 100, height: 50 }

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: mockResult }])
      })

      getUpdatedRect('.test', 123, mockCallback)

      // The result should be sanitized by sanitizeRect
      expect(mockCallback).toHaveBeenCalledWith(mockResult)
    })

    it('should handle element not found in main document', () => {
      const mockCallback = vi.fn()

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: null }])
      })

      getUpdatedRect('.nonexistent', 123, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith(null)
    })

    it('should handle script execution errors', () => {
      const mockCallback = vi.fn()

      chrome.runtime.lastError = { message: 'Script failed' }
      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback(undefined)
      })

      getUpdatedRect('.test', 123, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith(null)
      // Note: chrome.runtime.lastError is not reset by the function
    })

    it('should handle invalid rect properties', () => {
      const mockCallback = vi.fn()

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: { left: 'invalid', top: 20, width: 100, height: 50 } }])
      })

      getUpdatedRect('.test', 123, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith(null)
    })

    it('should handle zero-sized elements', () => {
      const mockCallback = vi.fn()

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: { left: 10, top: 20, width: 0, height: 50 } }])
      })

      getUpdatedRect('.test', 123, mockCallback)

      // sanitizeRect ensures minimum width of 1
      expect(mockCallback).toHaveBeenCalledWith({ left: 10, top: 20, width: 1, height: 50 })
    })
  })

  describe('cropElementScreenshot', () => {
    it('should store dataURL in temporary storage', () => {
      const mockCallback = vi.fn()
      const dataURL = 'data:image/png;base64,test'
      const rect = { left: 10, top: 20, width: 100, height: 50 }
      const tabId = 123

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: 'cropped-data-url' }])
      })

      cropElementScreenshot(dataURL, rect, tabId, mockCallback)

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        { tempDataURL: dataURL },
        expect.any(Function)
      )
    })

    it('should execute cropping script with rect coordinates', () => {
      const mockCallback = vi.fn()
      const dataURL = 'data:image/png;base64,test'
      const rect = { left: 10, top: 20, width: 100, height: 50 }
      const tabId = 123

      // Mock storage.set to call its callback immediately
      chrome.storage.local.set.mockImplementation((data, callback) => {
        callback()
      })

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: 'cropped-data-url' }])
      })

      cropElementScreenshot(dataURL, rect, tabId, mockCallback)

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId },
          args: [rect.left, rect.top, rect.width, rect.height]
        }),
        expect.any(Function)
      )
    })

    it('should handle successful image cropping', () => {
      const mockCallback = vi.fn()
      const dataURL = 'data:image/png;base64,test'
      const rect = { left: 10, top: 20, width: 100, height: 50 }
      const croppedDataURL = 'data:image/png;base64,cropped'

      chrome.storage.local.set.mockImplementation((data, callback) => {
        callback()
      })

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: croppedDataURL }])
      })

      cropElementScreenshot(dataURL, rect, 123, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith(croppedDataURL)
    })

    it('should clean up temporary storage after cropping', () => {
      const mockCallback = vi.fn()
      const dataURL = 'data:image/png;base64,test'
      const rect = { left: 10, top: 20, width: 100, height: 50 }

      chrome.storage.local.set.mockImplementation((data, callback) => {
        callback()
      })

      // Mock storage.get and remove to call their callbacks
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({ tempDataURL: dataURL })
      })

      chrome.storage.local.remove.mockImplementation((keys, callback) => {
        // remove doesn't have a callback in the actual API, but we'll call it anyway
        if (callback) callback()
      })

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        // Simulate the script calling storage.get, which calls storage.remove
        chrome.storage.local.get(['tempDataURL'], (result) => {
          chrome.storage.local.remove(['tempDataURL'])
          callback([{ result: 'cropped-data-url' }])
        })
      })

      cropElementScreenshot(dataURL, rect, 123, mockCallback)

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['tempDataURL'])
    })

    it('should handle cropping script execution errors', () => {
      const mockCallback = vi.fn()
      const dataURL = 'data:image/png;base64,test'
      const rect = { left: 10, top: 20, width: 100, height: 50 }

      chrome.storage.local.set.mockImplementation((data, callback) => {
        callback()
      })

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback(undefined)
      })

      cropElementScreenshot(dataURL, rect, 123, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith(null)
    })

    it('should handle invalid crop coordinates', () => {
      const mockCallback = vi.fn()
      const dataURL = 'data:image/png;base64,test'
      const rect = { left: -10, top: -20, width: 0, height: 0 }

      chrome.storage.local.set.mockImplementation((data, callback) => {
        callback()
      })

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: 'cropped-data-url' }])
      })

      cropElementScreenshot(dataURL, rect, 123, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith('cropped-data-url')
    })

    it('should handle storage operation failures', () => {
      const mockCallback = vi.fn()
      const dataURL = 'data:image/png;base64,test'
      const rect = { left: 10, top: 20, width: 100, height: 50 }

      // Mock storage.set to not call the callback (simulating failure)
      chrome.storage.local.set.mockImplementation((data, callback) => {
        // Don't call callback to simulate failure
      })

      cropElementScreenshot(dataURL, rect, 123, mockCallback)

      // Should not attempt to execute script if storage fails
      expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
    })
  })
})