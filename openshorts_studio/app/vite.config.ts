import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
        timeout: 0,
      },
      '/api/comfy': {
        target: 'http://127.0.0.1:8288',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/comfy/, ''),
        timeout: 0,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res && 'writeHead' in res && !(res as any).headersSent) {
              (res as any).writeHead(503, { 'Content-Type': 'application/json' });
              (res as any).end(JSON.stringify({ error: 'ComfyUI 8288 서버가 초기화 중이거나 연결 대기 중입니다.' }));
            }
          });
        },
      },
    },
  },
});
