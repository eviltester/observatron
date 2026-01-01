import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'release/*.zip',
      'scripts/**',
      'eslint.config.js',
      'vitest.config.js'
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        // Chrome extension globals
        chrome: 'readonly',
        importScripts: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        MutationObserver: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        alert: 'readonly',
        Option: 'readonly',
        Date: 'readonly',
        // Node.js globals for build scripts
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        // Vitest globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
        // Implicit globals in existing code
        contextMenus: 'writable',
        contextTypes: 'writable',
        downloadScreenshot: 'writable',
        saveAsMhtml: 'writable',
        logANote: 'writable',
        showSidePanel: 'writable',
        changedOptions: 'writable',
        options: 'writable',
        Options: 'readonly',
        getFileName: 'readonly',
        sanitizeSessionName: 'readonly',
        getDefaultOptions: 'readonly',
        getSpecialNoteTypeFromString: 'readonly',
        logThis: 'writable'
      }
    },
    rules: {
      'no-unused-vars': 'off',
      'no-console': 'off',
      'no-prototype-builtins': 'off',
      'no-restricted-globals': 'off',
      'use-isnan': 'off',
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-new-func': 'off'
    }
  },
  {
    files: ['test/**/*'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Vitest globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
        // Test-specific globals
        global: 'readonly',
        // Chrome mock globals
        chrome: 'writable'
      }
    },
    rules: {
      'no-unused-vars': 'off', // Disable for test files to avoid mock function parameter issues
      'no-console': 'off',
      'no-undef': 'off'
    }
  }
]
