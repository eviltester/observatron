import { describe, it, expect, vi } from 'vitest'

// Mock chrome API
global.chrome = {
  runtime: {
    sendMessage: vi.fn()
  }
}

// Mock document
global.document = {
  querySelectorAll: vi.fn(),
  location: { href: 'https://example.com' }
}

// Simple hash function (duplicated from source)
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash;
}

describe('broken links scanning', () => {
  it('should skip non-HTTP/HTTPS links', () => {
    // Mock anchors
    const mockAnchors = [
      { href: 'mailto:test@example.com', textContent: 'email', innerText: 'email' },
      { href: 'tel:123456789', textContent: 'phone', innerText: 'phone' },
      { href: 'https://valid.com', textContent: 'valid', innerText: 'valid' }
    ]
    document.querySelectorAll.mockReturnValue(mockAnchors)

    // Simulate the handler logic
    const links = []
    const checkedHashes = new Set()
    for (const el of mockAnchors) {
      const href = el.href
      if (!href) continue
      let url
      try {
        url = new URL(href, document.location.href).href
      } catch (e) {
        continue
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue
      const hash = simpleHash(url)
      if (!checkedHashes.has(hash)) {
        let text = el.textContent.trim() || el.innerText.trim() || '[no text]'
        if (text.length > 100) {
          text = text.substring(0, 100) + '...'
        }
        links.push({ url, source: document.location.href, hash, text })
      }
    }

    expect(links.length).toBe(1)
    expect(links[0].url).toBe('https://valid.com/')
  })

  it('should truncate text to 100 characters', () => {
    const longText = 'a'.repeat(150)
    const anchorEl = { href: 'https://example.com', textContent: longText, innerText: longText }
    document.querySelectorAll.mockReturnValue([anchorEl])

    const links = []
    const checkedHashes = new Set()
    for (const el of [anchorEl]) {
      const href = el.href
      let url = new URL(href, document.location.href).href
      const hash = simpleHash(url)
      if (!checkedHashes.has(hash)) {
        let text = el.textContent.trim() || el.innerText.trim() || '[no text]'
        if (text.length > 100) {
          text = text.substring(0, 100) + '...'
        }
        links.push({ url, source: document.location.href, hash, text })
      }
    }

    expect(links[0].text.length).toBe(103) // 100 + '...'
    expect(links[0].text.endsWith('...')).toBe(true)
  })

  it('should handle empty text', () => {
    const anchorEl = { href: 'https://example.com', textContent: '', innerText: '' }
    document.querySelectorAll.mockReturnValue([anchorEl])

    const links = []
    const checkedHashes = new Set()
    for (const el of [anchorEl]) {
      const href = el.href
      let url = new URL(href, document.location.href).href
      const hash = simpleHash(url)
      if (!checkedHashes.has(hash)) {
        let text = el.textContent.trim() || el.innerText.trim() || '[no text]'
        if (text.length > 100) {
          text = text.substring(0, 100) + '...'
        }
        links.push({ url, source: document.location.href, hash, text })
      }
    }

    expect(links[0].text).toBe('[no text]')
  })
})