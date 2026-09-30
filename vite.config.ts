import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Vite builds nothing that ships: Storybook and the component-harness browser
// tests use this configuration until they move off Vite.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_RELEASE_SHA__: JSON.stringify('development'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
