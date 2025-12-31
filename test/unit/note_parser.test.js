import { describe, it, expect } from 'vitest'

// Import function from extracted module
import { getSpecialNoteTypeFromString } from '../../chrome/javascript/note_parser.js'

describe('note_parser.js - getSpecialNoteTypeFromString', () => {
    // Pattern: Import actual application code, not copy/paste
    // Pattern: Test each behavior separately
    // Pattern: Test edge cases
    
    it('should detect question prefix', () => {
        const result = getSpecialNoteTypeFromString('? should system do this?')
        expect(result.type).toBe('question')
        expect(result.text).toBe('should system do this?')
    })

    it('should detect bug prefix', () => {
        const result = getSpecialNoteTypeFromString('! button does not work')
        expect(result.type).toBe('bug')
        expect(result.text).toBe('button does not work')
    })

    it('should detect todo prefix', () => {
        const result = getSpecialNoteTypeFromString('- implement feature X')
        expect(result.type).toBe('todo')
        expect(result.text).toBe('implement feature X')
    })

    it('should treat plain text as note type', () => {
        const result = getSpecialNoteTypeFromString('regular note text')
        expect(result.type).toBe('note')
        expect(result.text).toBe('regular note text')
    })

    it('should detect custom type with @ prefix', () => {
        const result = getSpecialNoteTypeFromString('@feature this is a feature request')
        expect(result.type).toBe('feature')
        expect(result.text).toBe('this is a feature request')
    })

    it('should handle custom closable type with @type[]', () => {
        const result = getSpecialNoteTypeFromString('@task[] do this task')
        expect(result.type).toBe('task[]')
        expect(result.text).toBe('do this task')
    })

    it('should treat @question as standard question type', () => {
        const result = getSpecialNoteTypeFromString('@question what is this?')
        expect(result.type).toBe('question')
        expect(result.text).toBe('what is this?')
    })

    it('should treat @bug as standard bug type', () => {
        const result = getSpecialNoteTypeFromString('@bug critical issue found')
        expect(result.type).toBe('bug')
        expect(result.text).toBe('critical issue found')
    })

    it('should treat @todo as standard todo type', () => {
        const result = getSpecialNoteTypeFromString('@todo remember to test')
        expect(result.type).toBe('todo')
        expect(result.text).toBe('remember to test')
    })

    it('should truncate custom type names to 15 characters', () => {
        const longType = 'verylongtypename'
        const result = getSpecialNoteTypeFromString('@' + longType + ' test')
        expect(result.type).toBe(longType.substring(0, 15))
        expect(result.text).toBe('test')
    })

    it('should not trim whitespace to parse type from note text', () => {
        const result = getSpecialNoteTypeFromString('  ?  test with spaces  ')
        expect(result.type).toBe('note')
        expect(result.text).toBe('?  test with spaces')
    })

    it('should handle empty string', () => {
        const result = getSpecialNoteTypeFromString('')
        expect(result.type).toBe('note')
        expect(result.text).toBe('')
    })

    it('should handle null input', () => {
        const result = getSpecialNoteTypeFromString(null)
        expect(result.type).toBe('note')
        expect(result.text).toBe('')
    })

    it('should handle special characters in custom type', () => {
        const result = getSpecialNoteTypeFromString('@my-feature@name# test')
        expect(result.type).toBe('my-feature@name') // truncated and cleaned
        expect(result.text).toBe('test')
    })

    it('should handle multiple @ in text', () => {
        const result = getSpecialNoteTypeFromString('@email is user@test.com')
        expect(result.type).toBe('email') // @email is first word
        expect(result.text).toBe('is user@test.com')
    })
})
