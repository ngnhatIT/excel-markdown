// E2E smoke test: chạy app đã build (out/) trong Electron thật, điều khiển qua Chrome
// DevTools Protocol. userData tách riêng trong thư mục tạm (không đụng app đã cài).
// Chạy: npm run e2e  (= build + node scripts/e2e.mjs). Cần màn hình (không chạy headless CI).
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
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
// lang: 'vi' -> chạy bằng tiếng Việt kể cả khi locale máy test là en/ja
writeFileSync(join(userData, 'store.json'), JSON.stringify({ outDir, lang: 'vi' }))
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
  // Ngôn ngữ giao diện: lấy 'vi' từ store; đổi EN -> 日本語 -> VI
  check('ngôn ngữ từ store: <html lang="vi">', (await waitFor(`document.documentElement.lang === 'vi'`, 3000)) >= 0, await ev(`document.documentElement.lang`))
  const langBtn = (t) => `[...document.querySelectorAll('.x2m-lang button')].find(b => b.textContent.trim() === ${JSON.stringify(t)})`
  const viewModeText = `document.querySelectorAll('.x2m-mode-btn')[2]?.textContent.trim()`
  const langState = `[${viewModeText}, document.documentElement.lang]`
  await ev(`(${langBtn('EN')}).click(), 1`)
  check('đổi sang English: chữ nút chế độ tiếng Anh, <html lang="en">',
    (await waitFor(`${viewModeText} === 'Markdown Reader' && document.documentElement.lang === 'en'`, 2000)) >= 0, await ev(langState))
  await ev(`(${langBtn('日本語')}).click(), 1`)
  check('đổi sang 日本語: chữ nút chế độ tiếng Nhật, <html lang="ja">',
    (await waitFor(`${viewModeText} === 'Markdown 閲覧' && document.documentElement.lang === 'ja'`, 2000)) >= 0, await ev(langState))
  await ev(`(${langBtn('VI')}).click(), 1`)
  check('về lại VI', (await waitFor(`${viewModeText} === 'Đọc Markdown' && document.documentElement.lang === 'vi'`, 2000)) >= 0, await ev(langState))

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

  // Danh sách còn kihon-sekkei.xlsx đã convert ở trên: dọn thư mục xuất để app không hỏi ghi đè (hộp thoại hệ thống, CDP không bấm được)
  const clearOut = () => {
    for (const f of readdirSync(outDir)) rmSync(join(outDir, f))
  }
  clearOut()
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

  // Convert lại: worker convert tự khởi động lại sau khi bị kill (file đã ghi trước lúc Hủy cũng làm app hỏi ghi đè)
  clearOut()
  await pressCtrlEnter()
  await waitFor(`(${convertBtn}).textContent.includes('Đang convert')`, 3000)
  check('convert lại sau Hủy chạy xong', (await waitFor(`!(${convertBtn}).textContent.includes('Đang convert')`, 90000)) >= 0)
  check('convert lại: đủ 3 file lớn', bigMd().length === 3, bigMd())

  // Xóa file khỏi danh sách
  await ev(`document.querySelector('.x2m-file button[aria-label="Xóa khỏi danh sách"]').click(), 1`)
  check('xóa file: còn 3 file', (await waitFor(`document.querySelector('.x2m-pane-title').textContent.includes('(3)')`, 2000)) >= 0)

  // ------------------------- Chế độ Markdown → Excel -------------------------
  const dropFiles = async (files) => {
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await send('Input.dispatchDragEvent', { type, x: 640, y: 400, data: { items: [], files, dragOperationsMask: 1 } })
    }
  }
  const listOut = () => {
    try {
      return readdirSync(outDir)
    } catch {
      return []
    }
  }
  const hasToast = (t) => `[...document.querySelectorAll('.x2m-toast')].some(x => x.textContent.includes(${JSON.stringify(t)}))`
  const modeBtn = (t) => `[...document.querySelectorAll('.x2m-mode-btn')].find(b => b.textContent.trim() === ${JSON.stringify(t)})`
  const mdItems = `[...document.querySelectorAll('.x2m-md-file')]`
  const mdNames = `${mdItems}.map(e => e.querySelector('.x2m-file-name-text')?.textContent ?? '')`
  const nameInput = `document.querySelector('input[aria-label="Tên file Excel"]')`

  // Hai phần của golden thành hai file .md "do app tạo" (mỗi file 1 sheet)
  const mdDir = join(tmp, 'md')
  mkdirSync(mdDir, { recursive: true })
  const mdTable = join(mdDir, 'kihon-sekkei__テーブル定義.md')
  const mdScreen = join(mdDir, 'kihon-sekkei__画面項目定義.md')
  writeFileSync(mdTable, parts[1] + '\n')
  writeFileSync(mdScreen, parts[0] + '\n')

  await ev(`(${modeBtn('Markdown → Excel')})?.click(), 1`)
  check('chế độ Markdown → Excel: nút được chọn (active)', (await waitFor(`!!(${modeBtn('Markdown → Excel')})?.classList.contains('active')`, 2000)) >= 0)
  check('md: vùng trống "Kéo thả file Markdown vào đây"', await ev(`document.body.innerText.includes('Kéo thả file Markdown vào đây')`))

  await dropFiles([mdTable, mdScreen])
  check(
    'md: thả 2 file -> 2 file, mỗi file 1 sheet',
    (await waitFor(`${mdItems}.length === 2 && ${mdItems}.every(e => e.querySelector('.x2m-md-count')?.textContent.trim() === '1 sheet')`)) >= 0,
    await ev(`${mdItems}.map(e => e.innerText)`).catch(() => null)
  )
  check('md: preview hiện file đang chọn (TBL_CUSTOMER)', (await waitFor(`(document.querySelector('.md-body')?.innerText ?? '').includes('TBL_CUSTOMER')`, 5000)) >= 0)
  check('md: tên file Excel mặc định kihon-sekkei', (await waitFor(`${nameInput}?.value === 'kihon-sekkei'`, 2000)) >= 0, await ev(`${nameInput}?.value ?? null`).catch(() => null))

  await ev(`${mdItems}[1]?.querySelector('button[aria-label="Đưa lên"]')?.click(), 1`)
  check(
    'md: Đưa lên -> 画面項目定義 trước テーブル定義',
    (await waitFor(`(() => { const n = ${mdNames}; return n.length === 2 && n[0].includes('画面項目定義') && n[1].includes('テーブル定義') })()`, 2000)) >= 0,
    await ev(mdNames).catch(() => null)
  )

  await dropFiles([fixture])
  check('md: thả file Excel -> toast gợi ý chế độ Excel → Markdown', (await waitFor(hasToast('chế độ Excel → Markdown'), 3000)) >= 0)
  check('md: thả file Excel không thêm vào danh sách (vẫn 2 file)', await ev(`${mdItems}.length === 2`))

  // Sửa file .md trên đĩa (thêm một đoạn và một sheet mới): preview + số sheet chưa đổi (đọc lúc thêm file);
  // bấm "Tải lại" của file đó -> preview, số sheet và tên sheet theo nội dung mới
  const tableItem = `${mdItems}.find(e => (e.querySelector('.x2m-file-name-text')?.textContent ?? '').includes('テーブル定義'))`
  const tableCount = `(${tableItem})?.querySelector('.x2m-md-count')?.textContent.trim()`
  const tableSheets = `((${tableItem})?.querySelector('.x2m-md-sheets')?.textContent ?? '')`
  writeFileSync(mdTable, parts[1] + '\n\n再読込テスト\n\n---\n\n## 新シート\n\nx\n')
  await sleep(300)
  check(
    'md: sửa file trên đĩa, chưa tải lại -> preview chưa có chữ mới, vẫn 1 sheet',
    !(await previewText()).includes('再読込テスト') && (await ev(tableCount)) === '1 sheet'
  )
  const reloadBtn = `(${tableItem})?.querySelector('button[aria-label="Tải lại"]')`
  check('md: mỗi file có nút Tải lại (title gợi ý)', (await ev(`${reloadBtn}?.title ?? ''`)) === 'Tải lại file (khi đã sửa file .md)')
  await ev(`${reloadBtn}?.click(), 1`)
  check(
    'md: Tải lại -> preview có 再読込テスト, 2 sheet (có 新シート), vẫn chọn file đó',
    (await waitFor(
      `(document.querySelector('.md-body')?.innerText ?? '').includes('再読込テスト') && ${tableCount} === '2 sheet' && ${tableSheets}.includes('新シート') && !!(${tableItem})?.classList.contains('active')`,
      5000
    )) >= 0,
    await ev(`[(${tableItem})?.innerText, (document.querySelector('.md-body')?.innerText ?? '').slice(-80)]`).catch(() => null)
  )
  check('md: Tải lại không đổi danh sách (vẫn 2 file, cùng thứ tự)', await ev(`(() => { const n = ${mdNames}; return n.length === 2 && n[0].includes('画面項目定義') && n[1].includes('テーブル定義') })()`))
  // File biến mất -> Tải lại báo lỗi (vẫn chọn file đó); có lại file -> Tải lại hết lỗi
  renameSync(mdTable, mdTable + '.bak')
  await ev(`${reloadBtn}?.click(), 1`)
  check(
    'md: Tải lại file không còn -> trạng thái lỗi, vẫn chọn file đó',
    (await waitFor(`(${tableItem})?.querySelector('.x2m-md-count')?.textContent.trim() === 'lỗi' && !!(${tableItem})?.querySelector('.x2m-file-error') && !!(${tableItem})?.classList.contains('active')`, 5000)) >= 0,
    await ev(`(${tableItem})?.innerText`).catch(() => null)
  )
  renameSync(mdTable + '.bak', mdTable)
  await ev(`${reloadBtn}?.click(), 1`)
  check('md: có lại file -> Tải lại hết lỗi, 2 sheet', (await waitFor(`${tableCount} === '2 sheet' && !(${tableItem})?.querySelector('.x2m-file-error')`, 5000)) >= 0)

  await pressCtrlEnter()
  check('md: Ctrl+Enter -> toast Đã tạo kihon-sekkei.xlsx', (await waitFor(hasToast('Đã tạo kihon-sekkei.xlsx'), 30000)) >= 0)
  let wbOut = null
  try {
    wbOut = XLSX.readFile(join(outDir, 'kihon-sekkei.xlsx'), { cellNF: true })
  } catch {
    /* chưa tạo file */
  }
  check(
    'md: thứ tự sheet theo danh sách (sheet 新シート mới thêm khi Tải lại)',
    JSON.stringify(wbOut?.SheetNames) === JSON.stringify(['画面項目定義', 'テーブル定義', '新シート']),
    wbOut?.SheetNames
  )
  const ws1 = wbOut ? wbOut.Sheets[wbOut.SheetNames[0]] : null
  const cells1 = ws1 ? Object.keys(ws1).filter((k) => !k.startsWith('!')).map((k) => ws1[k]) : []
  check('md: sheet 1 có ô <null> nguyên văn', cells1.some((c) => c.v === '<null>'))
  check('md: sheet 1 có ô số 1 định dạng 0.0', cells1.some((c) => c.v === 1 && c.z === '0.0'))
  const ws2 = wbOut ? wbOut.Sheets[wbOut.SheetNames[1]] : null
  check('md: sheet 2 có đoạn 再読込テスト (nội dung file đã sửa)', !!ws2 && Object.keys(ws2).some((k) => !k.startsWith('!') && ws2[k].v === '再読込テスト'))
  const ws3 = wbOut ? wbOut.Sheets['新シート'] : null
  check('md: sheet 新シート có ô x', !!ws3 && ws3['A1']?.v === 'x', ws3 ? Object.keys(ws3) : null)
  check('md: không để lại file .partial', listOut().every((f) => !f.endsWith('.partial')), listOut())
  const resText = `(document.querySelector('.x2m-results')?.innerText ?? '')`
  check(
    'md: panel kết quả có kihon-sekkei.xlsx, 3 sheet',
    (await waitFor(`${resText}.includes('kihon-sekkei.xlsx') && ${resText}.includes('3 sheet')`, 2000)) >= 0,
    await ev(resText).catch(() => null)
  )

  // Hủy: một file .md lớn (60 000 dòng × 10 cột), danh sách chỉ gồm file này
  const bigMdPath = join(mdDir, 'big.md')
  const mdRows = ['| ' + ['No', ...Array.from({ length: 9 }, (_, i) => '列' + i)].join(' | ') + ' |', '|' + '---|'.repeat(10)]
  for (let r = 1; r <= 60000; r++) mdRows.push('| ' + [String(r), ...Array.from({ length: 9 }, (_, c) => `値${r}_${c}`)].join(' | ') + ' |')
  writeFileSync(bigMdPath, mdRows.join('\n') + '\n')
  for (let i = 0; i < 2; i++) {
    await ev(`document.querySelector('.x2m-md-file button[aria-label="Xóa khỏi danh sách"]')?.click(), 1`)
    await waitFor(`${mdItems}.length === ${1 - i}`, 2000)
  }
  await dropFiles([bigMdPath])
  const bigReadyMs = await waitFor(`${mdItems}.length === 1 && ${mdItems}[0].querySelector('.x2m-md-count')?.textContent.trim() === '1 sheet'`, 30000)
  // Đổi tên khác tên mặc định (big) rồi Ctrl+Enter ngay trong ô tên (KHÔNG blur): phím tắt phải chạy cả khi đang gõ
  await ev(`(() => { const i = ${nameInput}; if (!i) return 0; i.focus(); i.select(); return 1 })()`)
  await send('Input.insertText', { text: 'big-huy' })
  const renamedMs = await waitFor(`${nameInput}?.value === 'big-huy' && document.activeElement === ${nameInput}`, 2000)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 })
  const mdCancelBtnMs = await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Hủy')`, 5000)
  const tMdCancel = Date.now()
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Hủy')?.click(), 1`)
  const mdCancelMs = await waitFor(hasToast('Đã hủy tạo file Excel'), 5000)
  check(
    `md Hủy: Ctrl+Enter trong ô tên bắt đầu tạo, toast Đã hủy nhanh (${mdCancelMs >= 0 ? Date.now() - tMdCancel : '-'} ms)`,
    renamedMs >= 0 && mdCancelBtnMs >= 0 && mdCancelMs >= 0 && mdCancelMs < 2000,
    { bigReadyMs, renamedMs, mdCancelBtnMs, mdCancelMs }
  )
  const leftover = listOut().filter((f) => /^big(-huy)?\.xlsx(\.partial)?$/.test(f))
  check('md Hủy: không có big-huy.xlsx lẫn big-huy.xlsx.partial', leftover.length === 0, leftover)

  await ev(`(${modeBtn('Excel → Markdown')})?.click(), 1`)
  check('về Excel → Markdown: danh sách Excel còn nguyên', (await waitFor(`(document.querySelector('.x2m-pane-title')?.textContent ?? '').includes('File Excel (3)')`, 2000)) >= 0)

  // ------------------------- Cột Tùy chọn ẩn/hiện -------------------------
  const sideBtn = (label) => `document.querySelector('.x2m-side button[aria-label="${label}"]')`
  await ev(`${sideBtn('Ẩn Tùy chọn')}?.click(), 1`)
  check(
    'Tùy chọn: Ẩn -> cột thu gọn, không còn checkbox',
    (await waitFor(`!!document.querySelector('.x2m-side.collapsed') && !document.querySelector('.x2m-side input')`, 2000)) >= 0
  )
  await ev(`${sideBtn('Hiện Tùy chọn')}?.click(), 1`)
  check('Tùy chọn: Hiện -> cột mở lại, có checkbox', (await waitFor(`!document.querySelector('.x2m-side.collapsed') && !!document.querySelector('.x2m-side input')`, 2000)) >= 0)

  // ----------------------------- Đọc Markdown -----------------------------
  const viewDir = join(tmp, 'view')
  mkdirSync(join(viewDir, 'docs'), { recursive: true })
  mkdirSync(join(viewDir, 'img'), { recursive: true })
  // Đoạn đệm để có chỗ cuộn (link #anchor, giữ vị trí cuộn khi tải lại)
  const filler = Array.from({ length: 60 }, (_, i) => `Đoạn đệm ${i + 1}`).join('\n\n')
  writeFileSync(
    join(viewDir, 'README.md'),
    `# Trang chính\n\n![sơ đồ](img/a.png)\n\n[Sang trang B](docs/b.md)\n\n[Tới mục cuối](#mục-cuối)\n\n[Sang B phần 2](docs/b.md#Ph%E1%BA%A7n%202)\n\n${filler}\n\n## Mục cuối\n\nHết.\n\n${filler}\n`
  )
  writeFileSync(join(viewDir, 'alpha.md'), '# Alpha\n')
  utimesSync(join(viewDir, 'alpha.md'), new Date(2020, 0, 1), new Date(2020, 0, 1))
  const bMd = (h1) => `# ${h1}\n\n\`\`\`js\nconst x = 1\n\`\`\`\n\n${filler}\n\n## Phần 2\n\nCuối B.\n\n${filler}\n`
  writeFileSync(join(viewDir, 'docs', 'b.md'), bMd('Trang B'))
  writeFileSync(join(viewDir, 'img', 'a.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))
  const treeRow = (t) => `[...document.querySelectorAll('.x2m-tree-row')].find(r => r.querySelector('.x2m-tree-name')?.textContent.trim() === ${JSON.stringify(t)})`

  await ev(`(${modeBtn('Đọc Markdown')})?.click(), 1`)
  check('Đọc Markdown: nút chế độ active, không có thanh convert, không có cột Tùy chọn',
    (await waitFor(`!!(${modeBtn('Đọc Markdown')})?.classList.contains('active') && !document.querySelector('.x2m-footer') && !document.querySelector('.x2m-side button[aria-label$="Tùy chọn"]')`, 2000)) >= 0)
  await dropFiles([viewDir])
  check('Đọc Markdown: thả thư mục -> cây có docs, README.md', (await waitFor(`!!(${treeRow('docs')}) && !!(${treeRow('README.md')}) && !!(${treeRow('b.md')})`, 5000)) >= 0,
    await ev(`document.querySelector('.x2m-files')?.innerText`).catch(() => null))
  await ev(`(${treeRow('README.md')})?.querySelector('button')?.click(), 1`)
  check('Đọc Markdown: bấm README.md -> render h1', (await waitFor(`document.querySelector('.md-body h1')?.textContent === 'Trang chính'`, 5000)) >= 0)
  check('Đọc Markdown: ảnh tương đối hiện được (x2m-img)',
    (await waitFor(`(() => { const i = document.querySelector('.md-body img'); return !!i && i.src.startsWith('x2m-img:') && i.complete && i.naturalWidth === 1 })()`, 5000)) >= 0,
    await ev(`document.querySelector('.md-body img')?.outerHTML ?? null`).catch(() => null))
  await ev(`[...document.querySelectorAll('.md-body a')].find(a => a.textContent === 'Sang trang B')?.click(), 1`)
  check('Đọc Markdown: bấm link docs/b.md -> mở trang B, chọn b.md trên cây, không mở file lẻ',
    (await waitFor(`document.querySelector('.md-body h1')?.textContent === 'Trang B' && !!(${treeRow('b.md')})?.classList.contains('selected') && !document.querySelector('.x2m-tree-group')`, 5000)) >= 0)
  check('Đọc Markdown: app không bị điều hướng khỏi trang', (await ev('location.href')) === startUrl)
  check('Đọc Markdown: code block render <pre>', await ev(`!!document.querySelector('.md-body pre code')`))
  // Mới sửa, ngày sửa, sort, lọc, dán
  const setFilter = (v) => ev(`(() => { const i = document.querySelector('.x2m-filter-input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1 })()`)
  const sectionShown = (t) => `[...document.querySelectorAll('.x2m-tree-section')].some(g => g.textContent.trim() === ${JSON.stringify(t)})`
  const rootFileOrder = `[...document.querySelectorAll('.x2m-tree .x2m-tree-row .x2m-tree-name')].map(n => n.textContent.trim())`
  check('Đọc Markdown: có mục Mới sửa và ngày sửa trên từng file',
    await ev(`${sectionShown('Mới sửa')} && document.querySelectorAll('.x2m-recent-row .x2m-tree-date').length >= 3 && !!document.querySelector('.x2m-tree-row .x2m-tree-date')`))
  check('Đọc Markdown: Mới sửa xếp file mới trước (alpha.md cũ 2020 ở cuối)',
    await ev(`(() => { const n = [...document.querySelectorAll('.x2m-recent-row .x2m-tree-name')].map(x => x.textContent.trim()); return n.length === 3 && n[2] === 'alpha.md' })()`))
  check('Đọc Markdown: sort Tên (mặc định): alpha.md trước README.md',
    await ev(`(() => { const n = ${rootFileOrder}; return n.indexOf('alpha.md') < n.indexOf('README.md') })()`))
  await ev(`[...document.querySelectorAll('.x2m-sort-btn')].find(b => b.textContent === 'Ngày sửa')?.click(), 1`)
  check('Đọc Markdown: sort Ngày sửa: README.md (mới) trước alpha.md (2020)',
    (await waitFor(`(() => { const n = ${rootFileOrder}; return n.indexOf('README.md') >= 0 && n.indexOf('README.md') < n.indexOf('alpha.md') })()`, 2000)) >= 0)
  await setFilter('zzz-khong-co')
  check('Đọc Markdown: lọc không khớp -> ẩn mục Mới sửa', (await waitFor(`!(${sectionShown('Mới sửa')})`, 2000)) >= 0)
  await setFilter('')
  check('Đọc Markdown: xóa lọc -> Mới sửa hiện lại', (await waitFor(sectionShown('Mới sửa'), 2000)) >= 0)
  await ev(`navigator.clipboard.readText = async () => '# Bản dán\\n'; document.querySelector('[aria-label="Dán Markdown"]')?.click(), 1`)
  check('Đọc Markdown: dán Markdown -> render, không chọn hàng nào, tiêu đề Dán từ clipboard',
    (await waitFor(`document.querySelector('.md-body h1')?.textContent === 'Bản dán' && !document.querySelector('.x2m-tree-row.selected, .x2m-recent-row.selected') && document.querySelector('.x2m-preview-bar')?.textContent.includes('Dán từ clipboard')`, 3000)) >= 0)
  check('Đọc Markdown: bản dán có hàng "Dán từ clipboard" đang chọn',
    await ev(`!!document.querySelector('.x2m-paste-row.selected')`))
  await ev(`(${treeRow('README.md')})?.querySelector('button')?.click(), 1`)
  check('Đọc Markdown: chọn file khác -> hàng dán hết chọn, vẫn còn',
    (await waitFor(`document.querySelector('.md-body h1')?.textContent === 'Trang chính' && !!document.querySelector('.x2m-paste-row') && !document.querySelector('.x2m-paste-row.selected')`, 3000)) >= 0)
  await ev(`document.querySelector('.x2m-paste-row .x2m-tree-btn')?.click(), 1`)
  check('Đọc Markdown: bấm hàng dán -> quay lại bản dán không cần dán lại',
    (await waitFor(`document.querySelector('.md-body h1')?.textContent === 'Bản dán'`, 3000)) >= 0)
  await ev(`navigator.clipboard.readText = async () => '  '; document.querySelector('[aria-label="Dán Markdown"]')?.click(), 1`)
  check('Đọc Markdown: clipboard rỗng -> toast lỗi, giữ nguyên bản đang xem',
    (await waitFor(`document.body.innerText.includes('Clipboard trống') && document.querySelector('.md-body h1')?.textContent === 'Bản dán'`, 3000)) >= 0)
  await ev(`(${treeRow('docs')})?.querySelector('button')?.click(), 1`)
  check('Đọc Markdown: thu gọn thư mục docs -> ẩn b.md', (await waitFor(`!(${treeRow('b.md')})`, 2000)) >= 0)
  // Tìm trong nội dung
  const filterMode = (t) => `[...document.querySelectorAll('.x2m-filter .x2m-sort-btn')].find(b => b.textContent === ${JSON.stringify(t)})`
  await ev(`(${filterMode('Nội dung')})?.click(), 1`)
  await setFilter('CONST x')
  check('Tìm nội dung: ra b.md (cả khi thư mục đang thu gọn), dòng 4, không phân biệt hoa thường',
    (await waitFor(`!!(${treeRow('docs/b.md')}) && [...document.querySelectorAll('.x2m-search-hit')].some(h => h.textContent === '4const x = 1')`, 5000)) >= 0,
    await ev(`document.querySelector('.x2m-files')?.innerText`).catch(() => null))
  await ev(`document.querySelector('.x2m-search-hit')?.click(), 1`)
  check('Tìm nội dung: bấm kết quả -> mở b.md, tô sáng chỗ khớp trong preview',
    (await waitFor(`document.querySelector('.md-body h1')?.textContent === 'Trang B' && CSS.highlights.get('x2m-search')?.size >= 1`, 5000)) >= 0)
  await ev(`(${treeRow('docs/b.md')})?.querySelector('button')?.click(), 1`)
  await setFilter('khong-co-dau')
  check('Tìm nội dung: không khớp -> báo Không tìm thấy', (await waitFor(`document.querySelector('.x2m-search-results')?.innerText.includes('Không tìm thấy')`, 5000)) >= 0)
  await ev(`(${filterMode('Tên')})?.click(), 1`)
  await setFilter('')
  check('Tìm nội dung: về chế độ Tên -> cây file quay lại', (await waitFor(`!document.querySelector('.x2m-search-results') && !!(${treeRow('README.md')})`, 3000)) >= 0)

  // Link #anchor, link file#mục, Lùi/Tiến
  const metaTitle = `document.querySelector('.x2m-meta-title')?.textContent`
  const scrollTop = `(document.querySelector('.x2m-preview')?.scrollTop ?? 0)`
  const headingInView = (t) =>
    `(() => { const c = document.querySelector('.x2m-preview'); const h = [...document.querySelectorAll('.md-body h2')].find(x => x.textContent === ${JSON.stringify(t)}); if (!c || !h) return false; const d = h.getBoundingClientRect().top - c.getBoundingClientRect().top; return c.scrollTop > 100 && d > -5 && d < 120 })()`
  const clickLink = (t) => ev(`[...document.querySelectorAll('.md-body a')].find(a => a.textContent === ${JSON.stringify(t)})?.click(), 1`)
  await ev(`(${treeRow('README.md')})?.querySelector('button')?.click(), 1`)
  await waitFor(`${metaTitle} === 'README.md' && document.querySelector('.md-body h1')?.textContent === 'Trang chính'`, 5000)
  await clickLink('Tới mục cuối')
  check('Link #mục-cuối: cuộn tới tiêu đề "Mục cuối" trong file', (await waitFor(headingInView('Mục cuối'), 4000)) >= 0,
    await ev(`[${scrollTop}, [...document.querySelectorAll('.md-body a')].map(x => x.getAttribute('href'))]`))
  await clickLink('Sang B phần 2')
  check('Link docs/b.md#Phần%202: mở b.md rồi cuộn tới "Phần 2"',
    (await waitFor(`${metaTitle} === 'docs/b.md' && ${headingInView('Phần 2')}`, 5000)) >= 0, await ev(metaTitle))
  await ev(`document.activeElement && document.activeElement.blur(), 1`)
  await key('ArrowLeft', 'ArrowLeft', 37, 1)
  check('Alt+←: quay lại README.md, đúng chỗ "Mục cuối"',
    (await waitFor(`${metaTitle} === 'README.md' && ${headingInView('Mục cuối')}`, 5000)) >= 0, await ev(metaTitle))
  await key('ArrowLeft', 'ArrowLeft', 37, 1)
  check('Alt+← lần nữa: cùng README.md, về đầu file', (await waitFor(`${metaTitle} === 'README.md' && ${scrollTop} < 5`, 4000)) >= 0, await ev(scrollTop))
  await ev(`document.querySelector('button[aria-label="Tiến"]')?.click(), 1`)
  await ev(`document.querySelector('button[aria-label="Tiến"]')?.click(), 1`)
  check('Nút Tiến x2: lại docs/b.md ở "Phần 2"', (await waitFor(`${metaTitle} === 'docs/b.md' && ${headingInView('Phần 2')}`, 5000)) >= 0, await ev(metaTitle))
  check('Nút Tiến bị tắt ở cuối lịch sử, Lùi bật', await ev(`document.querySelector('button[aria-label="Tiến"]')?.disabled === true && document.querySelector('button[aria-label="Lùi"]')?.disabled === false`))

  // Tải lại khi cửa sổ được focus: nội dung mới, giữ vị trí cuộn
  const topBefore = await ev(scrollTop)
  writeFileSync(join(viewDir, 'docs', 'b.md'), bMd('Trang B mới'))
  await ev(`window.dispatchEvent(new Event('focus')), window.dispatchEvent(new Event('focus')), 1`)
  check('Focus lại cửa sổ: b.md đổi ngoài app -> tải lại, toast Đã tải lại',
    (await waitFor(`document.querySelector('.md-body h1')?.textContent === 'Trang B mới' && document.body.innerText.includes('Đã tải lại: b.md')`, 4000)) >= 0)
  check('Tải lại: không cuộn về đầu', Math.abs((await ev(scrollTop)) - topBefore) < 50, [topBefore, await ev(scrollTop)])

  // Ctrl+K: bảng lệnh
  await ev(`document.activeElement && document.activeElement.blur(), 1`)
  await key('k', 'KeyK', 75, 2)
  check('Ctrl+K: mở bảng lệnh (dialog modal), ô nhập có focus',
    (await waitFor(`!!document.querySelector('[role="dialog"][aria-modal="true"]') && document.activeElement?.classList.contains('x2m-palette-input')`, 2000)) >= 0)
  await key('Escape', 'Escape', 27)
  check('Esc: đóng bảng lệnh', (await waitFor(`!document.querySelector('.x2m-palette')`, 2000)) >= 0)
  await key('k', 'KeyK', 75, 2)
  await waitFor(`document.activeElement?.classList.contains('x2m-palette-input')`, 2000)
  await send('Input.insertText', { text: 'ＡＬＰ' })
  check('Ctrl+K: gõ ＡＬＰ (toàn角) -> alpha.md đứng đầu',
    (await waitFor(`document.querySelector('.x2m-palette-item[aria-selected="true"]')?.textContent.includes('alpha.md')`, 2000)) >= 0,
    await ev(`[...document.querySelectorAll('.x2m-palette-item')].map(x => x.textContent)`))
  await key('Enter', 'Enter', 13)
  check('Ctrl+K: Enter mở alpha.md, đóng bảng lệnh',
    (await waitFor(`!document.querySelector('.x2m-palette') && ${metaTitle} === 'alpha.md' && document.querySelector('.md-body h1')?.textContent === 'Alpha'`, 4000)) >= 0, await ev(metaTitle))

  // Dịch nhanh đoạn bôi đen: chưa có key -> popup hướng dẫn, không gọi mạng
  await ev(`(() => { const h = document.querySelector('.md-body h1'); const r = document.createRange(); r.selectNodeContents(h); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return 1 })()`)
  check('Dịch: bôi đen chữ trong bản xem -> hiện nút Dịch', (await waitFor(`!!document.querySelector('.x2m-tr-btn')`, 2000)) >= 0)
  await ev(`document.querySelector('.x2m-tr-btn')?.click(), 1`)
  check('Dịch: chưa có API Key -> popup báo cần nhập key, có chọn ngôn ngữ đích',
    (await waitFor(`!!document.querySelector('.x2m-tr-popup') && document.querySelector('.x2m-tr-popup').innerText.includes('API Key') && document.querySelectorAll('.x2m-tr-popup [role="radio"]').length === 3`, 4000)) >= 0,
    await ev(`document.querySelector('.x2m-tr-popup')?.innerText ?? null`))
  await key('Escape', 'Escape', 27)
  check('Dịch: Esc đóng popup', (await waitFor(`!document.querySelector('.x2m-tr-popup')`, 2000)) >= 0)

  // So sánh 新旧: hai file Markdown, chèn một dòng giữa bảng + sửa một ô
  const cmpDir = join(tmp, 'cmp')
  mkdirSync(cmpDir, { recursive: true })
  const tbl = (rows) => '## 画面\n\n### 【項目定義】\n\n| No | 項目ID | 項目名 |\n|---|---|---|\n' + rows.map((r, i) => `| ${i + 1} | ${r[0]} | ${r[1]} |`).join('\n') + '\n'
  writeFileSync(join(cmpDir, 'old.md'), tbl([['C01', '顧客コード'], ['C02', '顧客名'], ['C03', '電話番号']]))
  writeFileSync(join(cmpDir, 'new.md'), tbl([['C01', '顧客コード'], ['C09', 'メール'], ['C02', '顧客名称'], ['C03', '電話番号']]))
  await ev(`(${modeBtn('So sánh')})?.click(), 1`)
  check('So sánh: chế độ mới, không có thanh convert', (await waitFor(`!!(${modeBtn('So sánh')})?.classList.contains('active') && !document.querySelector('.x2m-footer') && !!document.querySelector('.x2m-compare-side')`, 2000)) >= 0)
  await dropFiles([join(cmpDir, 'old.md'), join(cmpDir, 'new.md')])
  check('So sánh: thả 2 file -> 1 dòng thêm, 1 dòng sửa (chèn giữa bảng không làm lệch phần sau)',
    (await waitFor(`(() => { const b = document.querySelector('.x2m-compare-bar')?.innerText ?? ''; return b.includes('+1') && b.includes('~1') && b.includes('−0') })()`, 5000)) >= 0,
    await ev(`document.querySelector('.x2m-compare-bar')?.innerText ?? document.querySelector('.x2m-compare')?.innerText ?? null`))
  check('So sánh: ô sửa tô chữ thêm/xóa trong dòng', await ev(`[...document.querySelectorAll('.x2m-compare-list mark')].some(m => m.textContent.includes('称'))`))
  await ev(`[...document.querySelectorAll('.x2m-compare-bar button')].find(b => b.getAttribute('aria-label')?.startsWith('Thay đổi sau'))?.click(), 1`)
  check('So sánh: thêm + sửa liền nhau là một cụm; nút thay đổi sau -> vị trí 1 / 1', (await waitFor(`document.querySelector('.x2m-compare-bar')?.innerText.includes('1 / 1')`, 2000)) >= 0)
  await ev(`[...document.querySelectorAll('.x2m-compare-bar button')].find(b => b.textContent.trim() === '改訂履歴')?.click(), 1`)
  check('So sánh: 改訂履歴 tự sinh dòng nêu dòng thêm và cột sửa',
    (await waitFor(`(document.querySelector('.x2m-rev-table')?.innerText ?? '').includes('行追加 1件（C09）') && document.querySelector('.x2m-rev-table').innerText.includes('C02: 項目名')`, 3000)) >= 0,
    await ev(`document.querySelector('.x2m-rev')?.innerText ?? null`))
  await ev(`(${modeBtn('Đọc Markdown')})?.click(), 1`)
  await waitFor(`!!document.querySelector('.x2m-files')`, 2000)

  // Trợ lý AI: chọn nhà cung cấp, key riêng từng bên (không gọi mạng)
  const providerBtn = (t) => `[...document.querySelectorAll('[aria-label="Nhà cung cấp AI"] button')].find(b => b.textContent.startsWith(${JSON.stringify(t)}))`
  check('AI: chưa có key -> hiện hộp cấu hình với 3 nhà cung cấp',
    (await waitFor(`document.querySelectorAll('[aria-label="Nhà cung cấp AI"] button').length === 3`, 3000)) >= 0)
  check('AI: có chọn ngữ cảnh tối đa 3 mức', await ev(`document.querySelectorAll('#x2m-ai-ctx option').length === 3`))
  await ev(`(${providerBtn('Claude')})?.click(), 1`)
  check('AI: chọn Claude -> ô key gợi ý sk-ant, nút đầu panel ghi Claude',
    (await waitFor(`(${providerBtn('Claude')})?.getAttribute('aria-checked') === 'true' && document.querySelector('.x2m-ai-keybox input[type=password]')?.placeholder.includes('sk-ant') && document.body.innerText.includes('🔑 Claude')`, 3000)) >= 0)
  if (process.env.E2E_SHOT) writeFileSync(process.env.E2E_SHOT, Buffer.from((await send('Page.captureScreenshot')).result.data, 'base64'))
  const cfg = await ev(`window.api.aiSetConfig({ apiKey: 'sk-ant-e2e-test-key-123456' })`)
  check('AI: lưu key Claude không đụng key Gemini/OpenAI', cfg?.provider === 'claude' && cfg.keys.claude === 'sk-a••••3456' && cfg.keys.gemini === '' && cfg.keys.openai === '', cfg)
  const cleared = await ev(`window.api.aiSetConfig({ apiKey: '' }).then(() => window.api.aiSetConfig({ provider: 'gemini' }))`)
  check('AI: xóa key Claude, quay lại Gemini', cleared?.provider === 'gemini' && cleared.keys.claude === '', cleared)

  await ev(`(${modeBtn('Excel → Markdown')})?.click(), 1`)
  await waitFor(`!!document.querySelector('.x2m-footer')`, 2000)

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
