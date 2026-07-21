import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2022',
      cssMinify: true,
      modulePreload: {
        resolveDependencies(filename, dependencies) {
          // Admin subsections are opened explicitly after authentication. Do
          // not make the public contests route speculate on their dependency
          // trees; native ESM still loads every dependency when an admin opens
          // the subsection.
          return /^assets\/ContestAdmin(?:Translations|MechanicTranslations|StandardOperations)-.*\.js$/.test(filename)
            ? []
            : dependencies;
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-dom/client'],
          },
        },
      },
      reportCompressedSize: false,
      chunkSizeWarningLimit: 600,
    },
  };
});
