import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Babel standalone — тяжёлый (~1.5MB), нужен только для component preview
          if (id.includes('@babel/standalone') || id.includes('@babel')) {
            return 'babel-vendor';
          }
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
            return 'monaco-vendor';
          }
          if (id.includes('/react-dom/') || (id.includes('/react/') && !id.includes('react-redux') && !id.includes('@reduxjs'))) {
            return 'react-vendor';
          }
          if (id.includes('@reduxjs') || id.includes('react-redux') || id.includes('/redux/')) {
            return 'redux-vendor';
          }
          if (id.includes('/axios/')) {
            return 'axios-vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3333',
        ws: true,
      },
    },
  },
})
