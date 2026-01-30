import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/pordondepasa-sitp/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'maplibre-gl': ['maplibre-gl'],
          'react-vendor': ['react', 'react-dom']
        }
      }
    }
  }
})