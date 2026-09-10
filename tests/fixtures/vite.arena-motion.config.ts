import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({ root: process.cwd(), cacheDir: `/tmp/hs-arena-motion-vite-${process.getuid?.() ?? 'user'}`, plugins: [react(), tailwindcss()] });
