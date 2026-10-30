import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /api (REST) and /socket.io (live updates) are proxied to Express,
// so the auth cookie is same-origin for both.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5050',
      '/socket.io': { target: 'http://localhost:5050', ws: true },
    },
  },
});
