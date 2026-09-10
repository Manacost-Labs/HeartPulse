import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { heroMotionApis } from './battleground-hero-motion-data';

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'local-hero-motion-fixtures',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url || '').split('?')[0];
        if (!path.startsWith('/api/')) return next();
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(heroMotionApis[path] ?? {}));
      });
    },
  }],
});
