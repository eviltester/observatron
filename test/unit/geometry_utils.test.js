import { describe, it, expect } from 'vitest'

// Import functions from extracted modules
import {
    sanitizeRect,
    validateRect
} from '../../chrome/javascript/geometry_utils.js'

describe('geometry_utils.js - sanitizeRect', () => {
    // Pattern: Test edge cases and boundary values
    
    it('should handle normal rect values', () => {
        const rect = { left: 100, top: 200, width: 500, height: 600 }
        const result = sanitizeRect(rect)
        
        expect(result.left).toBe(100)
        expect(result.top).toBe(200)
        expect(result.width).toBe(500)
        expect(result.height).toBe(600)
    })

    it('should clamp left to 0 minimum', () => {
        const result = sanitizeRect({ left: -100, top: 0, width: 100, height: 100 })
        expect(result.left).toBe(0)
        expect(result.top).toBe(0)
    })

    it('should clamp top to 0 minimum', () => {
        const result = sanitizeRect({ left: 0, top: -50, width: 100, height: 100 })
        expect(result.left).toBe(0)
        expect(result.top).toBe(0)
    })

    it('should clamp width to 1 minimum', () => {
        const result = sanitizeRect({ left: 0, top: 0, width: -10, height: 100 })
        expect(result.width).toBe(1)
    })

    it('should clamp height to 1 minimum', () => {
        const result = sanitizeRect({ left: 0, top: 0, width: 100, height: 0 })
        expect(result.height).toBe(1)
    })

    it('should clamp to 10000 maximum', () => {
        const result = sanitizeRect({ left: 15000, top: 20000, width: 25000, height: 30000 })
        expect(result.left).toBe(10000)
        expect(result.top).toBe(10000)
        expect(result.width).toBe(10000)
        expect(result.height).toBe(10000)
    })

    it('should handle infinite values as 0', () => {
        const result = sanitizeRect({ left: Infinity, top: Infinity, width: Infinity, height: Infinity })
        expect(result.left).toBe(0)
        expect(result.top).toBe(0)
        expect(result.width).toBe(1)
        expect(result.height).toBe(1)
    })

    it('should handle NaN as 0', () => {
        const result = sanitizeRect({ left: NaN, top: NaN, width: NaN, height: NaN })
        expect(result.left).toBe(0)
        expect(result.top).toBe(0)
        expect(result.width).toBe(1)
        expect(result.height).toBe(1)
    })
})

describe('geometry_utils.js - validateRect', () => {
    // Pattern: Test validation logic against image bounds
    
    it('should validate rect within image bounds', () => {
        const rect = { left: 10, top: 20, width: 100, height: 80 }
        const imgWidth = 200
        const imgHeight = 150
        const result = validateRect(rect, imgWidth, imgHeight)
        
        expect(result.left).toBe(10)
        expect(result.top).toBe(20)
        expect(result.width).toBe(100)
        expect(result.height).toBe(80)
    })



    it('should ensure minimum 1x1 for zero width/height', () => {
        const rect = { left: 10, top: 10, width: 0, height: 0 }
        const imgWidth = 200
        const imgHeight = 150
        const result = validateRect(rect, imgWidth, imgHeight)
        
        expect(result.width).toBe(1)
        expect(result.height).toBe(1)
    })

    it('should handle rect completely outside image', () => {
        const rect = { left: 300, top: 200, width: 50, height: 50 }
        const imgWidth = 200
        const imgHeight = 150
        const result = validateRect(rect, imgWidth, imgHeight)
        
        expect(result.width).toBe(1) // completely outside
        expect(result.height).toBe(1)
    })
})
