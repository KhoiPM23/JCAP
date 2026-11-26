import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devApiTarget = process.env.VITE_DEV_API_TARGET || 'http://localhost:5254';
const devWhisperTarget = process.env.VITE_DEV_WHISPER_TARGET || 'http://127.0.0.1:50022';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/audio': {
        target: devApiTarget,
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: devApiTarget,
        changeOrigin: true,
        secure: false,
      },
      '/whisper': {
        target: devWhisperTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/whisper/, ''),
        secure: false,
      },
      '/api': {
        target: devApiTarget,
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (_err, _req, res) => {
            // Xử lý lỗi proxy êm ái khi Backend chưa khởi động xong
            if (res && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                message: 'Máy chủ Backend đang khởi động hoặc chưa sẵn sàng. Vui lòng thử lại sau giây lát.'
              }));
            }
          });
        },
      },
    },
  },
});

