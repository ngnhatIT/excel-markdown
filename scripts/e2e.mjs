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

  // Onboarding lần đầu + đổi theme
  check('onboarding hiện lần đầu', await ev(`!!document.querySelector('.x2m-onboarding')`))
  await ev(`document.querySelector('.x2m-onboarding button').click(), 1`)
  check('đóng onboarding', (await waitFor(`!document.querySelector('.x2m-onboarding')`, 2000)) >= 0)
  const theme0 = await ev(`document.documentElement.dataset.theme`)
  const themeBtn = `[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith('Chuyển sang nền'))`
  await ev(`(${themeBtn}).click(), 1`)
  const theme1 = await ev(`document.documentElement.dataset.theme`)
  await ev(`(${themeBtn}).click(), 1`)
  check('đổi theme sáng/tối', theme0 !== theme1 && (await ev(`document.documentElement.dataset.theme`)) === theme0, [theme0, theme1])

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

  // Tab Mã Markdown, zoom, lọc sheet
  const tab = (t) => `[...document.querySelectorAll('.x2m-tab')].find(b => b.textContent.includes('${t}'))`
  await ev(`(${tab('Mã Markdown')}).click(), 1`)
  check('tab Mã Markdown hiện source', (await waitFor(`(document.querySelector('.x2m-source')?.textContent ?? '').includes('| No | 項目名 |')`, 2000)) >= 0)
  await ev(`(${tab('Xem trước')}).click(), 1`)
  await waitFor(`!!document.querySelector('.md-body')`, 2000)
  const key = async (k, code, vk, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers })
  }
  await ev(`document.activeElement && document.activeElement.blur(), 1`)
  await key('=', 'Equal', 187, 2)
  check('Ctrl+= phóng to preview (110%)', (await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === '110%')`, 2000)) >= 0)
  await key('0', 'Digit0', 48, 2)
  check('Ctrl+0 về 100%', (await waitFor(`![...document.querySelectorAll('button')].some(b => b.textContent.trim().endsWith('%'))`, 2000)) >= 0)
  await ev(`document.querySelector('.x2m-filter-input').focus(), 1`)
  await send('Input.insertText', { text: 'テーブル' })
  check('lọc sheet: chỉ còn sheet khớp', (await waitFor(`document.querySelectorAll('.x2m-sheet').length === 1 && document.querySelector('.x2m-sheet').textContent.includes('テーブル定義')`, 2000)) >= 0)
  await ev(`document.activeElement.blur(), 1`)
  await key('Escape', 'Escape', 27)
  check('Escape xóa bộ lọc', (await waitFor(`document.querySelectorAll('.x2m-sheet').length === 4`, 2000)) >= 0)

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
  check('panel kết quả: 1/1 file thành công', await ev(`(document.querySelector('.x2m-results')?.innerText ?? '').includes('1/1 file thành công')`))
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

  // File lớn: main không bị treo khi convert (parse chạy trong worker) + nút Hủy
  const XLSX = require('xlsx')
  const aoa = [['No', ...Array.from({ length: 9 }, (_, i) => '列' + i)]]
  for (let r = 1; r < 60000; r++) aoa.push([String(r), ...Array.from({ length: 9 }, (_, c) => `値${r}_${c}`)])
  const bigWb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(bigWb, XLSX.utils.aoa_to_sheet(aoa), 'Big')
  const bigFiles = [1, 2, 3].map((n) => join(tmp, `big-${n}.xlsx`))
  for (const p of bigFiles) XLSX.writeFile(bigWb, p, { compression: true })
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await send('Input.dispatchDragEvent', { type, x: 640, y: 400, data: { items: [], files: bigFiles, dragOperationsMask: 1 } })
  }
  const convertBtn = `[...document.querySelectorAll('button')].find(b => b.textContent.includes('sang Markdown') || b.textContent.includes('Đang convert'))`
  check('3 file lớn được liệt kê sheet', (await waitFor(`(${convertBtn})?.textContent.includes('Convert 6 sheet')`, 60000)) >= 0)
  const bigMd = () => readdirSync(outDir).filter((f) => f.startsWith('big-'))
  const pressCtrlEnter = async () => {
    await ev(`document.activeElement && document.activeElement.blur(), 1`)
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 })
  }

  await pressCtrlEnter()
  check('nút Hủy hiện khi đang convert', (await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Hủy')`, 3000)) >= 0)
  // Đo độ trễ IPC tới main trong lúc worker đang parse file lớn
  let maxLatency = 0
  for (let i = 0; i < 10; i++) {
    const t = Date.now()
    await ev('window.api.getVersion()')
    maxLatency = Math.max(maxLatency, Date.now() - t)
    await sleep(80)
  }
  check(`main vẫn phản hồi khi đang convert (IPC chậm nhất ${maxLatency} ms < 250 ms)`, maxLatency < 250)
  const tCancel = Date.now()
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Hủy').click(), 1`)
  const cancelMs = await waitFor(`document.body.innerText.includes('Đã hủy:')`, 5000)
  check(`Hủy dừng convert nhanh (${cancelMs >= 0 ? Date.now() - tCancel : '-'} ms)`, cancelMs >= 0 && cancelMs < 2000)
  check('Hủy: file lớn chưa xong không được ghi', bigMd().length < 3, bigMd())
  check('nút convert dùng lại được sau Hủy', (await waitFor(`!(${convertBtn}).disabled`, 5000)) >= 0)

  // Convert lại: worker convert tự khởi động lại sau khi bị kill
  await pressCtrlEnter()
  await waitFor(`(${convertBtn}).textContent.includes('Đang convert')`, 3000)
  check('convert lại sau Hủy chạy xong', (await waitFor(`!(${convertBtn}).textContent.includes('Đang convert')`, 90000)) >= 0)
  check('convert lại: đủ 3 file lớn', bigMd().length === 3, bigMd())

  // Xóa file khỏi danh sách
  await ev(`document.querySelector('.x2m-file button[aria-label="Xóa khỏi danh sách"]').click(), 1`)
  check('xóa file: còn 3 file', (await waitFor(`document.querySelector('.x2m-pane-title').textContent.includes('(3)')`, 2000)) >= 0)

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
