import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // Hostinger may serve this from a subfolder
  plugins: [react(), tailwindcss()],
  // maplibre-gl spawns a Web Worker to decode vector tiles off the main thread. Under Vite's
  // default dev-time dependency pre-bundling, that worker's request stalls forever (network
  // shows it permanently "pending") and the map never renders any tile data, even though the
  // style JSON itself loads fine. Excluding it from pre-bundling serves it as native ESM and
  // fixes worker loading in dev; the production build is unaffected either way.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
