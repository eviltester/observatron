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

describe('broken images scanning', () => {
  it('should skip non-HTTP/HTTPS images', () => {
    // Mock images
    const mockImages = [
      { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', alt: 'data' },
      { src: 'https://valid.com/image.jpg', alt: 'valid' }
    ]
    document.querySelectorAll.mockReturnValue(mockImages)

    const images = []
    const checkedHashes = new Set()
    for (const el of mockImages) {
      const src = el.src
      if (!src) continue
      let url
      try {
        url = new URL(src, document.location.href).href
      } catch (e) {
        continue
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue
      const hash = simpleHash(url)
      if (!checkedHashes.has(hash)) {
        let alt = el.alt || '[no alt]'
        if (alt.length > 100) {
          alt = alt.substring(0, 100) + '...'
        }
        images.push({ url, source: document.location.href, hash, text: alt })
      }
    }

    expect(images.length).toBe(1)
    expect(images[0].url).toBe('https://valid.com/image.jpg')
  })

  it('should truncate alt text to 100 characters', () => {
    const longAlt = 'a'.repeat(150)
    const imgEl = { src: 'https://example.com/image.jpg', alt: longAlt }
    document.querySelectorAll.mockReturnValue([imgEl])

    const images = []
    const checkedHashes = new Set()
    for (const el of [imgEl]) {
      const src = el.src
      let url = new URL(src, document.location.href).href
      const hash = simpleHash(url)
      if (!checkedHashes.has(hash)) {
        let alt = el.alt || '[no alt]'
        if (alt.length > 100) {
          alt = alt.substring(0, 100) + '...'
        }
        images.push({ url, source: document.location.href, hash, text: alt })
      }
    }

    expect(images[0].text.length).toBe(103) // 100 + '...'
    expect(images[0].text.endsWith('...')).toBe(true)
  })

  it('should handle empty alt', () => {
    const imgEl = { src: 'https://example.com/image.jpg', alt: '' }
    document.querySelectorAll.mockReturnValue([imgEl])

    const images = []
    const checkedHashes = new Set()
    for (const el of [imgEl]) {
      const src = el.src
      let url = new URL(src, document.location.href).href
      const hash = simpleHash(url)
      if (!checkedHashes.has(hash)) {
        let alt = el.alt || '[no alt]'
        if (alt.length > 100) {
          alt = alt.substring(0, 100) + '...'
        }
        images.push({ url, source: document.location.href, hash, text: alt })
      }
    }

    expect(images[0].text).toBe('[no alt]')
  })
})