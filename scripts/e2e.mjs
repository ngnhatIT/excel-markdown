// E2E smoke test: chạy app đã build (out/) trong Electron thật, điều khiển qua Chrome
// DevTools Protocol. userData tách riêng trong thư mục tạm (không đụng app đã cài).
// Chạy: npm run e2e  (= build + node scripts/e2e.mjs). Cần màn hình (không chạy headless CI).
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const electronPath = require('electron')
const fixture = join(root, 'test', 'fixtures', 'kihon-sekkei.xlsx')
const golden = readFileSync(join(root, 'test', 'golden', 'kihon-sekkei.xlsx.md'), 'utf8')

const tmp = mkdtempSync(join(tmpdir(), 'x2m-e2e-'))
const userData = join(tmp, 'userdata')
const outDir = join(tmp, 'out')
mkdirSync(userData, { recursive: true })
writeFileSync(join(userData, 'store.json'), JSON.stringify({ outDir }))
const wrapper = join(tmp, 'wrapper.cjs')
writeFileSync(
  wrapper,
  `const { app } = require('electron')\napp.setPath('userData', ${JSON.stringify(userData)})\nrequire(${JSON.stringify(join(root, 'out', 'main', 'index.js'))})\n`
)

const port = 9300 + Math.floor(Math.random() * 600)
const env = { ...process.env }
delete env.ELECTRON_RENDERER_URL
const child = spawn(electronPath, [`--remote-debugging-port=${port}`, wrapper], { stdio: 'ignore', env })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (name, ok, detail) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''}`)
}

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* app chưa sẵn sàng */
    }
    await sleep(500)
  }
  throw new Error('Không kết nối được DevTools của app')
}

const ws = new WebSocket(await connect())
await new Promise((r) => ws.addEventListener('open', r))
let seq = 0
const pending = new Map()
const exceptions = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  } else if (m.method === 'Runtime.exceptionThrown') {
    exceptions.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
  }
})
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error')
  return r.result?.result?.value
}
const waitFor = async (expression, timeout = 10000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await ev(expression).catch(() => false)) return Date.now() - t0
    await sleep(100)
  }
  return -1
}
const previewText = () => ev(`document.querySelector('.md-body')?.innerText ?? ''`)

try {
  // Thu thập vi phạm CSP từ lúc trang bắt đầu tải, rồi reload để bắt cả lúc khởi động
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI))`,
  })
  await send('Page.reload')
  check('app khởi động', (await waitFor(`!!document.querySelector('.x2m-app')`)) >= 0)
  const startUrl = await ev('location.href')
  check('CSP meta có trong bản build', await ev(`!!document.querySelector('meta[http-equiv="Content-Security-Policy"]')`))

  // Kéo-thả file thật từ OS
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await send('Input.dispatchDragEvent', { type, x: 640, y: 400, data: { items: [], files: [fixture], dragOperationsMask: 1 } })
  }
  check('kéo-thả: file + sheet hiện trong danh sách', (await waitFor(`document.body.innerText.includes('kihon-sekkei.xlsx') && document.body.innerText.includes('テーブル定義')`)) >= 0)
  check('sheet DEL_ bị bỏ qua', !(await ev(`document.body.innerText.includes('DEL_旧仕様')`)))

  // Preview sheet đầu (tự chọn)
  check('preview render bảng', (await waitFor(`!!document.querySelector('.md-body table')`)) >= 0)
  const p1 = await previewText()
  check('preview escape: <null>, *必須* hiển thị nguyên văn', p1.includes('<null>') && p1.includes('*必須*'), p1.slice(0, 200))

  // Phím ↓ chuyển sheet
  await ev(`document.activeElement && document.activeElement.blur(), 1`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
  check('phím ↓: preview sang sheet テーブル定義', (await waitFor(`(document.querySelector('.md-body')?.innerText ?? '').includes('TBL_CUSTOMER')`)) >= 0)

  // Tùy chọn escape: tắt -> có <em>, bật lại
  const chk = `[...document.querySelectorAll('label.x2m-check')].find(l => l.textContent.includes('Escape ký tự'))?.querySelector('input')`
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 })
  await waitFor(`(document.querySelector('.md-body')?.innerText ?? '').includes('<null>')`)
  check('checkbox escape tồn tại, mặc định bật', await ev(`(${chk})?.checked === true`))
  await ev(`(${chk}).click(), 1`)
  check('tắt escape: *必須* thành <em>', (await waitFor(`!!document.querySelector('.md-body em')`)) >= 0)
  await ev(`(${chk}).click(), 1`)
  check('bật lại escape', (await waitFor(`!document.querySelector('.md-body em')`)) >= 0)

  // Chặn điều hướng + openPath chỉ nhận thư mục
  await ev(`(() => { const a = document.createElement('a'); a.href = '仕様書.xlsx'; document.body.appendChild(a); a.click(); a.remove(); return 1 })()`)
  await sleep(800)
  check('link tương đối không điều hướng app', (await ev('location.href')) === startUrl)
  check('openPath(file) bị từ chối', await ev(`window.api.openPath(${JSON.stringify(fixture)}).then(() => false, () => true)`))

  // Convert bằng Ctrl+Enter (outDir lấy từ store), so với golden
  await ev(`document.activeElement && document.activeElement.blur(), 1`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 })
  const convMs = await waitFor(`document.body.innerText.includes('Xong:')`, 20000)
  check('Ctrl+Enter convert xong', convMs >= 0)
  const written = (() => {
    try {
      return readdirSync(outDir).sort()
    } catch {
      return []
    }
  })()
  check('ghi đúng 2 file (sheet ẩn không tick, sheet rỗng bỏ qua)', written.length === 2, written)
  const parts = golden.replace(/^# .*\n\n/, '').trimEnd().split('\n\n---\n\n')
  for (const f of written) {
    const md = readFileSync(join(outDir, f), 'utf8').trimEnd()
    check(`nội dung ${f} khớp golden`, parts.includes(md))
  }

  // Cuối cùng: không vi phạm CSP, không exception
  const csp = await ev('window.__csp.slice()')
  check('không vi phạm CSP', Array.isArray(csp) && csp.length === 0, csp)
  // Đối chứng: CSP thật sự chặn tải mạng và bộ thu bắt được vi phạm
  await ev(`(() => { const i = new Image(); i.src = 'https://example.com/x.png'; return 1 })()`)
  check('đối chứng: CSP chặn ảnh từ mạng (img-src)', (await waitFor(`window.__csp.some(v => v.startsWith('img-src'))`, 3000)) >= 0)
  check('không có exception trong renderer', exceptions.length === 0, exceptions)
} catch (err) {
  failures++
  console.log('FAIL  lỗi khi chạy e2e: ' + (err instanceof Error ? err.message : String(err)))
} finally {
  ws.close()
  child.kill()
  await sleep(500)
  try {
    rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* Windows có thể còn khóa file vài trăm ms */
  }
}

console.log(failures === 0 ? '\nE2E: tất cả PASS' : `\nE2E: ${failures} FAIL`)
process.exit(failures === 0 ? 0 : 1)
