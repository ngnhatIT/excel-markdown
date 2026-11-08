import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Font giao diện đóng gói cùng app (offline, CSP font-src 'self'); trình duyệt chỉ tải subset cần theo unicode-range
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/500.css'
import '@fontsource/be-vietnam-pro/600.css'
import '@fontsource/be-vietnam-pro/700.css'
import './index.css'


ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
