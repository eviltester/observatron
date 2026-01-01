import { describe, it, expect } from 'vitest'

// Import functions from the actual source file
// Pattern: Importing application code, not copying it
import {
    zeropadDigits,
    sanitizeSessionName,
    getFileName
} from '../../chrome/javascript/filenames.js'

describe('filenames.js - zeropadDigits', () => {
    // Pattern: Test one behavior per test
    // Pattern: Test edge cases (zero, single digit, double digit, negative)
    
    it('should pad single digit to 2 places', () => {
        // Pattern: Act + Assert in one line for simple cases
        expect(zeropadDigits(5, 2)).toBe('05')
    })

    it('should pad single digit to 3 places', () => {
        expect(zeropadDigits(7, 3)).toBe('007')
    })

    it('should not pad numbers that are already correct length', () => {
        expect(zeropadDigits(12, 2)).toBe('12')
    })

    it('should pad zero correctly', () => {
        expect(zeropadDigits(0, 2)).toBe('00')
    })

    it('should handle double-digit months', () => {
        expect(zeropadDigits(12, 2)).toBe('12')
    })

    it('should handle three digits', () => {
        expect(zeropadDigits(123, 4)).toBe('0123')
    })
})

describe('filenames.js - sanitizeSessionName', () => {
    // Pattern: Group related tests in a describe block
    // Pattern: Test null/undefined edge cases
    // Pattern: Test transformation logic (lowercase, replace, trim)
    
    it('should handle empty session name', () => {
        expect(sanitizeSessionName('')).toBe('')
    })

    it('should handle null session name', () => {
        expect(sanitizeSessionName(null)).toBe('')
    })

    it('should convert to lowercase', () => {
        expect(sanitizeSessionName('TestSession')).toBe('testsession')
    })

    it('should replace spaces with dashes', () => {
        expect(sanitizeSessionName('test session')).toBe('test-session')
    })

    it('should replace special characters with dashes', () => {
        expect(sanitizeSessionName('test@session#name')).toBe('test-session-name')
    })

    it('should collapse multiple dashes into one', () => {
        expect(sanitizeSessionName('test---session')).toBe('test-session')
    })

    it('should remove leading dashes', () => {
        expect(sanitizeSessionName('--test-session')).toBe('test-session')
    })

    it('should remove trailing dashes', () => {
        expect(sanitizeSessionName('test-session--')).toBe('test-session')
    })

    it('should only keep alphanumeric and dashes', () => {
        expect(sanitizeSessionName('Test-123-Session-ABC')).toBe('test-123-session-abc')
    })

    it('should handle mixed special characters', () => {
        expect(sanitizeSessionName('Test @Session! #Name $Value')).toBe('test-session-name-value')
    })
})

describe('filenames.js - getFileName with flat folder structure', () => {
    // Pattern: Test different configurations (flat vs nested)
    // Pattern: Use regex to match patterns when exact output varies (timestamps)
    
    it('should create flat folder path without session', () => {
        // Pattern: Test with minimal required parameters
        const result = getFileName('observatron/', 'obs_', 'screenshot', 'jpg', '', 'flat')
        
        // Pattern: Verify structure components (folder, filename parts)
        expect(result).toMatch(/^observatron\//)
        expect(result).toContain('/obs_')
        expect(result).toContain('-screenshot.jpg')
        expect(result).toMatch(/\d{4}-\d{2}-\d{2}\//) // folder date
        expect(result).toMatch(/obs_\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}/) // timestamp
    })

    it('should create flat folder path with session name', () => {
        // Pattern: Test with optional parameters
        const result = getFileName('observatron/', 'obs_', 'screenshot', 'jpg', 'test-session', 'flat')
        expect(result).toMatch(/^observatron\//)
        expect(result).toContain('test-session')
        expect(result).toContain('/obs_')
        expect(result).toContain('-screenshot.jpg')
    })

    it('should sanitize session name in flat structure', () => {
        // Pattern: Verify sanitization is applied
        const result = getFileName('observatron/', 'obs_', 'screenshot', 'jpg', 'Test Session!', 'flat')
        expect(result).toMatch(/test-session/)
        expect(result).not.toMatch(/Test Session!/)
    })
})

describe('filenames.js - getFileName with nested folder structure', () => {
    // Pattern: Test different code paths (conditional logic)
    
    it('should create nested folder path without session', () => {
        const result = getFileName('observatron/', 'obs_', 'mhtmldata', 'mhtml', '', 'nested')
        expect(result).toMatch(/^observatron\/\d{4}\/\d{2}\/\d{2}\/obs_\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-mhtmldata\.mhtml$/)
    })

    it('should create nested folder path with session name', () => {
        const result = getFileName('observatron/', 'obs_', 'screenshot', 'jpg', 'mysession', 'nested')
        expect(result).toMatch(/^observatron\/\d{4}\/\d{2}\/\d{2}\/mysession\/obs_\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-screenshot\.jpg$/)
    })

    it('should create nested folder path with session name', () => {
        const result = getFileName('observatron/', 'obs_', 'screenshot', 'jpg', 'mysession', 'nested')
        expect(result).toMatch(/^observatron\/\d{4}\/\d{2}\/\d{2}\/mysession\//)
        expect(result).toMatch(/obs_\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-screenshot\.jpg$/)
    })

    it('should sanitize session name in nested structure', () => {
        const result = getFileName('observatron/', 'obs_', 'screenshot', 'jpg', 'My@Session#Name', 'nested')
        expect(result).toContain('my-session-name/')
        expect(result).not.toMatch(/My@Session#Name/)
    })

    it('should not add trailing slash when no session name in nested', () => {
        const result = getFileName('observatron/', 'obs_', 'test', 'png', '', 'nested')
        expect(result).not.toMatch(/\/\//)
    })

    it('should not add trailing slash when no session name in nested', () => {
        const result = getFileName('observatron/', 'obs_', 'test', 'png', '', 'nested')
        expect(result).not.toMatch(/\/\//)
    })

    it('should create nested folder path with session name', () => {
        const result = getFileName('observatron/', 'obs_', 'screenshot', 'jpg', 'mysession', 'nested')
        expect(result).toMatch(/^observatron\/\d{4}\/\d{2}\/\d{2}\/mysession\/obs_\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-screenshot\.jpg$/)
    })

    it('should sanitize session name in nested structure', () => {
        const result = getFileName('observatron/', 'obs_', 'screenshot', 'jpg', 'My@Session#Name', 'nested')
        expect(result).toMatch(/my-session-name/)
        expect(result).not.toMatch(/My@Session#Name/)
    })

    it('should not add trailing slash when no session name in nested', () => {
        const result = getFileName('observatron/', 'obs_', 'test', 'png', '', 'nested')
        expect(result).not.toMatch(/\/\//)
    })
})

describe('filenames.js - getFileName components', () => {
    // Pattern: Test each component/parameter separately
    
    it('should include custom filepath', () => {
        const result = getFileName('custom/path/', 'pre_', 'test', 'txt', '', 'flat')
        expect(result).toMatch(/^custom\/path\//)
    })

    it('should include custom file prefix', () => {
        const result = getFileName('observatron/', 'custom_', 'test', 'txt', '', 'flat')
        expect(result).toMatch(/custom_\d{4}-/)
    })

    it('should include correct extension', () => {
        const result = getFileName('observatron/', 'obs_', 'test', 'png', '', 'flat')
        expect(result).toContain('.png')
    })

    it('should include filetype in filename', () => {
        const result = getFileName('observatron/', 'obs_', 'screenshot', 'jpg', '', 'flat')
        expect(result).toContain('-screenshot.')
    })
})

describe('filenames.js - getFileName timestamp format', () => {
    // Pattern: Verify timestamp includes date and time components
    
    it('should include year', () => {
        const result = getFileName('observatron/', 'obs_', 'test', 'png', '', 'flat')
        // Extract year (4 digits at start of timestamp)
        const match = result.match(/obs_(\d{4})-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-test\.png$/)
        expect(match).toBeTruthy()
        if (match) {
            expect(parseInt(match[1])).toBeGreaterThan(2020) // reasonable year
            expect(parseInt(match[1])).toBeLessThan(2100) // reasonable year
        }
    })

    it('should include month', () => {
        const result = getFileName('observatron/', 'obs_', 'test', 'png', '', 'flat')
        const match = result.match(/obs_\d{4}-(\d{2})-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-test\.png$/)
        expect(match).toBeTruthy()
        if (match) {
            expect(parseInt(match[1])).toBeGreaterThanOrEqual(1) // month
            expect(parseInt(match[1])).toBeLessThanOrEqual(12) // month
        }
    })

    it('should include day', () => {
        const result = getFileName('observatron/', 'obs_', 'test', 'png', '', 'flat')
        const match = result.match(/obs_\d{4}-\d{2}-(\d{2})-\d{2}-\d{2}-\d{2}-\d{3}-test\.png$/)
        expect(match).toBeTruthy()
        if (match) {
            expect(parseInt(match[1])).toBeGreaterThanOrEqual(1) // day
            expect(parseInt(match[1])).toBeLessThanOrEqual(31) // day
        }
    })

    it('should include time components', () => {
        const result = getFileName('observatron/', 'obs_', 'test', 'png', '', 'flat')
        // Should have hour, minute, second
        const match = result.match(/obs_\d{4}-\d{2}-\d{2}-(\d{2})-(\d{2})-(\d{2})-\d{3}-test\.png$/)
        expect(match).toBeTruthy()
        if (match) {
            expect(parseInt(match[1])).toBeGreaterThanOrEqual(0) // hour
            expect(parseInt(match[1])).toBeLessThan(24) // hour
            expect(parseInt(match[2])).toBeGreaterThanOrEqual(0) // minute
            expect(parseInt(match[2])).toBeLessThan(60) // minute
            expect(parseInt(match[3])).toBeGreaterThanOrEqual(0) // second
            expect(parseInt(match[3])).toBeLessThan(60) // second
        }
    })
})
