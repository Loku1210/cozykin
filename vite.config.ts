import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        runtime: resolve(__dirname, 'runtime.html'),
        studio: resolve(__dirname, 'studio.html')
      }
    }
  }
});
