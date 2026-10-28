import React from 'react';
import ReactDOM from 'react-dom/client';
// Design system: token trước (CSS variables), rồi style component jc-*; nạp trước App để CSS riêng của trang ghi đè được
import './styles/tokens.css';
import './styles/jcap.css';
import './styles/jcap-app.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

