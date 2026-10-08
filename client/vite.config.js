import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Exposes on local network so you can open it on your phone
    port: 5173,
    proxy: {
      // Any request to /api/* will be forwarded to the Express server.
      // This means the React code can just fetch('/api/health') without
      // worrying about CORS or full URLs during development.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
