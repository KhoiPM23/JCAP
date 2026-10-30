import React from 'react';
import ReactDOM from 'react-dom/client';
// Tailwind nạp đầu tiên: CSS của design system và của từng trang phía sau ghi đè được khi cùng độ ưu tiên (như lúc còn nạp qua CDN)
import './styles/tailwind.css';
// Design system: token trước (CSS variables), rồi style component jc-*; nạp trước App để CSS riêng của trang ghi đè được
import './styles/tokens.css';
import './styles/jcap.css';
import './styles/jcap-app.css';
import './styles/roleplay-extras.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

