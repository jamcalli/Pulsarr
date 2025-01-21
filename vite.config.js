import { resolve } from 'node:path';
import viteReact from '@vitejs/plugin-react';

/** @type {import('vite').UserConfig} */
export default {
  base: '/',
  root: resolve(import.meta.dirname, 'src/client'),
  plugins: [viteReact()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src/client"),
    },
  },
};