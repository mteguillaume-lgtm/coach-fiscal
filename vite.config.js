import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // pdfjs-dist v5 est un ESM natif — l'exclure évite les erreurs de pre-bundling Vite
    exclude: ['pdfjs-dist'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,ts}'],
    setupFiles: ['./vitest.setup.js'],
  },
})