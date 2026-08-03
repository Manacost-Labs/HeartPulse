import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const configuredRelease = String(
    process.env.RELEASE_SHA || process.env.GITHUB_SHA || env.RELEASE_SHA || env.GITHUB_SHA || '',
  ).trim();
  const appReleaseSha = /^[a-f0-9]{7,40}$/i.test(configuredRelease)
    ? configuredRelease.toLowerCase()
    : 'development';
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      __APP_RELEASE_SHA__: JSON.stringify(appReleaseSha),
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
          target: env.DEV_API_PROXY_TARGET || 'http://localhost:3001',
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
