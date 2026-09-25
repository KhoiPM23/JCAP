import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/audio': {
        target: 'http://localhost:5254',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'http://localhost:5254',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            // Xử lý lỗi proxy êm ái khi Backend chưa khởi động xong
            if (res && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                message: 'Máy chủ Backend đang khởi động hoặc chưa chạy. Vui lòng bật backend dotnet run.'
              }));
            }
          });
        },
      },
    },
  },
});

