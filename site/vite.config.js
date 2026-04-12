import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  base: '/iitc-community-plugins-observer/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        plugin: resolve(__dirname, 'plugin.html'),
        diff: resolve(__dirname, 'diff.html'),
      },
    },
  },
});
