import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/linkedin': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/api/twitter': {
          target: 'http://localhost:3002',
          changeOrigin: true,
        }
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          callback: path.resolve(__dirname, 'auth-callback.html'),
          twitter_callback: path.resolve(__dirname, 'twitter-callback.html'),
          linkedin_callback: path.resolve(__dirname, 'linkedin-callback.html'),
        },
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.VITE_DATAFORSEO_LOGIN': JSON.stringify(env.VITE_DATAFORSEO_LOGIN),
      'process.env.VITE_DATAFORSEO_PASSWORD': JSON.stringify(env.VITE_DATAFORSEO_PASSWORD),
      'process.env.DATAFORSEO_LOGIN': JSON.stringify(env.DATAFORSEO_LOGIN),
      'process.env.DATAFORSEO_PASSWORD': JSON.stringify(env.DATAFORSEO_PASSWORD)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
