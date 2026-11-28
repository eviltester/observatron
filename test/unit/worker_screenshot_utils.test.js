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

    it('does not look up a selector after the selected page has changed', () => {
      const callback = vi.fn()
      const scope = {pageUrl: 'https://another.example.test/', elementUrl: 'https://another.example.test/', inFrame: false}
      chrome.scripting.executeScript.mockImplementation(({func, args}, complete) => {
        complete([{result: func(...args)}])
      })

      getUpdatedRect('#could-exist-on-both-pages', 123, callback, scope)

      expect(callback).toHaveBeenCalledWith(null)
    })

    it('does not crop a replacement element that has the same locator as an earlier finding', () => {
      const original = document.createElement('button')
      original.id = 'reported-screenshot-element'
      document.body.append(original)
      const replacement = original.cloneNode()
      original.replaceWith(replacement)
      const callback = vi.fn()
      const scope = {
        pageUrl: location.href, elementUrl: location.href,
        finding: {scanId: 'report-id', documentId: 'document-id', index: 0}
      }
      vi.stubGlobal('observatronAccessibilityScan', {id: 'report-id', elements: [new WeakRef(original)]})
      chrome.scripting.executeScript.mockImplementation(({func, args}, complete) => complete([{result: func(...args)}]))
      try {
        getUpdatedRect('#reported-screenshot-element', 123, callback, scope)
        expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
          expect.objectContaining({target: {tabId: 123, documentIds: ['document-id']}}), expect.any(Function))
        expect(callback).toHaveBeenCalledWith(null, 'The reported element is no longer available. Run the check again.')
      } finally {
        replacement.remove()
        vi.unstubAllGlobals()
      }
    })

    it('reports an ambiguous or invalid supplied CSS selector', () => {
      const fixture = document.createElement('div')
      fixture.innerHTML = '<button class="fixture-crop"></button><button class="fixture-crop"></button>'
      document.body.append(fixture)
      const callback = vi.fn()
      const scope = {pageUrl: location.href, elementUrl: location.href, singleMatch: true}
      chrome.scripting.executeScript.mockImplementation(({func, args}, complete) => complete([{result: func(...args)}]))
      try {
        getUpdatedRect('.fixture-crop', 123, callback, scope)
        expect(callback).toHaveBeenLastCalledWith(null, 'The CSS selector matched 2 elements. Use a selector that matches just one.')
        getUpdatedRect('[', 123, callback, scope)
        expect(callback).toHaveBeenLastCalledWith(null, 'Enter a valid CSS selector.')
      } finally {
        fixture.remove()
      }
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
    it('passes the image directly to the tab without using shared storage', () => {
      const mockCallback = vi.fn()
      const dataURL = 'data:image/png;base64,test'
      const rect = { left: 10, top: 20, width: 100, height: 50 }
      const tabId = 123

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: 'cropped-data-url' }])
      })

      cropElementScreenshot(dataURL, rect, tabId, mockCallback)

      expect(chrome.storage.local.set).not.toHaveBeenCalled()
      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({target: {tabId}, args: [dataURL, 10, 20, 100, 50]}),
        expect.any(Function)
      )
    })

    it('should execute cropping script with rect coordinates', () => {
      const mockCallback = vi.fn()
      const dataURL = 'data:image/png;base64,test'
      const rect = { left: 10, top: 20, width: 100, height: 50 }
      const tabId = 123

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: 'cropped-data-url' }])
      })

      cropElementScreenshot(dataURL, rect, tabId, mockCallback)

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId },
          args: [dataURL, rect.left, rect.top, rect.width, rect.height]
        }),
        expect.any(Function)
      )
    })

    it('should handle successful image cropping', () => {
      const mockCallback = vi.fn()
      const dataURL = 'data:image/png;base64,test'
      const rect = { left: 10, top: 20, width: 100, height: 50 }
      const croppedDataURL = 'data:image/png;base64,cropped'

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: croppedDataURL }])
      })

      cropElementScreenshot(dataURL, rect, 123, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith(croppedDataURL)
    })

    it('keeps concurrently submitted crops scoped to their own image and tab', () => {
      const first = vi.fn()
      const second = vi.fn()
      const rect = { left: 10, top: 20, width: 100, height: 50 }
      const pending = []
      chrome.scripting.executeScript.mockImplementation((request, callback) => pending.push({request, callback}))

      cropElementScreenshot('data:image/png;base64,first', rect, 123, first)
      cropElementScreenshot('data:image/png;base64,second', rect, 456, second)
      pending[1].callback([{result: pending[1].request.args[0]}])
      pending[0].callback([{result: pending[0].request.args[0]}])

      expect(pending.map(item => item.request.target.tabId)).toEqual([123, 456])
      expect(first).toHaveBeenCalledWith('data:image/png;base64,first')
      expect(second).toHaveBeenCalledWith('data:image/png;base64,second')
    })

    it('should handle cropping script execution errors', () => {
      const mockCallback = vi.fn()
      const dataURL = 'data:image/png;base64,test'
      const rect = { left: 10, top: 20, width: 100, height: 50 }

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

      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        callback([{ result: 'cropped-data-url' }])
      })

      cropElementScreenshot(dataURL, rect, 123, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith('cropped-data-url')
    })

  })
})
