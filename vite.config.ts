import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2022',
    // Keep the GLB models as separate files so the browser can cache them.
    assetsInlineLimit: 0,
  },
})
