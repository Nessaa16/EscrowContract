 import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API requests to your backend server
    proxy: {
      // Intercept requests starting with '/api'
      '/api': {
        // Target: The URL of your locally running backend server
        // Your dev-server.js typically runs on port 3001
        target: 'http://localhost:3001',
        // changeOrigin: true is important for virtual hosted sites
        // It changes the origin of the host header to the target URL.
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ''), // This is often used if the backend doesn't expect '/api'
                                                        // In your case, since your Express router is mounted at '/api'
                                                        // in api/index.js (which becomes the handler on Vercel),
                                                        // you likely DO NOT need to rewrite the path here for local dev.
                                                        // The backend's routes are /transactions, /transactions/user/:walletAddress, etc.,
                                                        // and you access them via /api/transactions, /api/transactions/user/:walletAddress.
      },
    },
    // You might also want to set the port for Vite's dev server if it keeps changing (e.g., 5173)
    // port: 5173, 
  },
});