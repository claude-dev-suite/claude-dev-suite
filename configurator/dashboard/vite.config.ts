import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    // Do not emit extractable sourcemaps in the production build; full TS source
    // must not be shipped inside the Electron asar archive.
    // Use 'hidden' here instead of false if crash-reporting symbols are needed.
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e/**', 'server/**', 'electron/**'],
  },
});
