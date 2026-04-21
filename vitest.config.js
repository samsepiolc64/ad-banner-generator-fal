import { defineConfig } from 'vitest/config'

/**
 * Standalone Vitest config — keeps tests isolated from the Vite/React build
 * pipeline and avoids the `#` character in the parent directory path that
 * causes vite-node to misparse it as a URL fragment.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Disable Vite's virtual module URL encoding — these are plain ESM files
    server: {
      fs: {
        strict: false,
      },
    },
  },
})
