import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src/client',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src/client', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: { outDir: '../../dist/client', emptyOutDir: true },
});
