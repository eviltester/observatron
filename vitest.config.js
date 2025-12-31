import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.js'],
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['chrome/**/*.js'],
      exclude: [
        'chrome/**/node_modules/**',
        'chrome/**/test/**'
      ],
      statements: 70,
      branches: 65,
      functions: 70,
      lines: 70
    },
    include: ['test/**/*.{test,spec}.{js,ts}']
  }
})
