import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  envDir: '../',
  envPrefix: ['VITE_', 'IP_REGION_'],
  plugins: [
    react(),
    visualizer({ open: true })
  ],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '^/[a-zA-Z0-9]{6}$': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: '../static',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // 分割图标包，并继续分割 20px 和 16px 图标，减少编译后主包体积
            if (/[\\/]node_modules[\\/]@blueprintjs[\\/]icons/.test(id)) {
              if (id.includes('20px')) return 'vendor-icons-20';
              if (id.includes('16px')) return 'vendor-icons-16';
              return 'vendor-icons-other';
            }
            if (id.includes('@blueprintjs/core')) {
              return 'vendor-ui-core';
            }
            if (id.includes('react') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            return 'vendor-utils';
          }
        },
      },
    },
  },
})
