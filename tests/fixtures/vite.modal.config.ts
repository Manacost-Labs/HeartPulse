import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: process.cwd(),
  cacheDir: `/tmp/hs-arena-modal-vite-${process.getuid?.() ?? 'user'}`,
  plugins: [react()],
});
