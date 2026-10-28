import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/** CSP cho renderer: chỉ tài nguyên đóng gói trong app, không script inline, không mạng.
 * Chỉ chèn khi build: dev server của Vite cần inline script (React refresh) và websocket HMR. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // x2m-img: ảnh cục bộ trong file .md (chế độ Đọc Markdown), main chỉ phục vụ file ảnh trong thư mục đã mở
  "img-src 'self' data: x2m-img:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'x2m-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // worker.js: utilityProcess đọc Excel (xem src/main/worker.ts)
        // cli.js: bản headless (`node out/main/cli.js ...`), cùng engine với app
        input: {
          index: resolve('src/main/index.ts'),
          worker: resolve('src/main/worker.ts'),
          cli: resolve('src/main/cli.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), cspPlugin()]
  }
})
