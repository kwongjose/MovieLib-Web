import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Outside src/, so electron-vite build never picks these up.
    include: ['test/**/*.test.js']
  },
  // The .node addon has to be required by Node, not transformed by Vite.
  ssr: { external: ['better-sqlite3-node'] }
})
