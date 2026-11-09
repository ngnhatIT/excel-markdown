/* Vẽ sơ đồ Mermaid (flowchart, sequence, gantt...) từ khối ```mermaid trong Markdown.
 * Thư viện mermaid nặng nên chỉ nạp (import động) khi tài liệu thật sự có sơ đồ.
 * securityLevel 'strict': nhãn trong sơ đồ được làm sạch, không chạy click/script. */
import type { Mermaid } from 'mermaid'
import { t } from '../i18n'

export type MermaidTheme = 'dark' | 'default'

const PALETTE: Record<MermaidTheme, Record<string, string>> = {
  dark: {
    darkMode: 'true',
    background: 'transparent',
    primaryColor: '#1b2a42',
    primaryBorderColor: '#5b8def',
    primaryTextColor: '#e8edf4',
    secondaryColor: '#15343a',
    secondaryBorderColor: '#3fb5a8',
    tertiaryColor: '#1a2230',
    lineColor: '#8494a8',
    textColor: '#d5dde8',
    edgeLabelBackground: '#141c28',
    noteBkgColor: '#2b2615',
    noteTextColor: '#f0e2b8',
    actorBkg: '#1b2a42',
    actorBorder: '#5b8def',
    signalColor: '#c4cedb',
    fontSize: '14px',
  },
  default: {
    background: 'transparent',
    primaryColor: '#eaf1ff',
    primaryBorderColor: '#1d5bd6',
    primaryTextColor: '#161f2c',
    secondaryColor: '#e6f6f3',
    secondaryBorderColor: '#168a7a',
    tertiaryColor: '#f6f8fb',
    lineColor: '#68778c',
    textColor: '#263142',
    edgeLabelBackground: '#ffffff',
    noteBkgColor: '#fff6dd',
    noteTextColor: '#5a4310',
    actorBkg: '#eaf1ff',
    actorBorder: '#1d5bd6',
    signalColor: '#3a4659',
    fontSize: '14px',
  },
}

let lib: Promise<Mermaid> | null = null
let seq = 0
// mermaid.render không chạy song song được: xếp hàng mọi lần vẽ
let queue: Promise<unknown> = Promise.resolve()

function load(): Promise<Mermaid> {
  lib ??= import('mermaid').then((m) => m.default)
  return lib
}

/** Vẽ một sơ đồ ra chuỗi SVG; lỗi cú pháp ném Error có message của mermaid. */
export function renderMermaid(source: string, theme: MermaidTheme): Promise<string> {
  const job = queue.then(async () => {
    const mermaid = await load()
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      // Lỗi cú pháp: ném lỗi cho caller, không chèn hình "bom" của mermaid vào trang
      suppressErrorRendering: true,
      // Màu theo bảng màu của app (một màu nhấn xanh), không dùng màu xám mặc định của mermaid
      theme: 'base',
      themeVariables: PALETTE[theme],
      fontFamily: 'inherit',
      // Nhãn SVG thuần (không foreignObject/HTML): đo chữ đúng dưới CSP, in và xuất HTML ổn định.
      // Kích thước tự nhiên (useMaxWidth false), CSS chỉ thu nhỏ khi sơ đồ rộng hơn khung.
      htmlLabels: false,
      flowchart: { curve: 'basis', padding: 12, htmlLabels: false, useMaxWidth: false },
      sequence: { useMaxWidth: false },
      gantt: { useMaxWidth: false },
      class: { useMaxWidth: false },
      state: { useMaxWidth: false },
      er: { useMaxWidth: false },
    })
    const { svg } = await mermaid.render(`x2m-mmd-${++seq}`, source)
    return svg
  })
  queue = job.catch(() => undefined)
  return job
}

const BLOCKS = 'pre > code.language-mermaid, .mmd[data-src]'

/* CSP của app (style-src 'self') chặn <style> và style="" trong SVG nếu chèn bằng innerHTML.
 * Nên SVG được dựng trong một document tách rời (không áp CSS, không vi phạm CSP), gỡ hết style
 * ra rồi áp lại qua CSSOM (CSP cho phép) — không cần nới CSP:
 * <style> -> stylesheet adopt vào document (CSS của mermaid đã giới hạn theo #id sơ đồ),
 * style="" -> element.style.cssText. Sheet của sơ đồ không còn trên trang thì được gỡ. */
const sheets = new Map<string, CSSStyleSheet>()

function svgElement(svg: string): Element {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (root.nodeName !== 'svg') throw new Error(t('mermaid.invalidSvg'))
  for (const [id, sheet] of sheets) {
    if (!document.getElementById(id)) {
      sheets.delete(id)
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet)
    }
  }
  for (const st of Array.from(root.querySelectorAll('style'))) {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(st.textContent ?? '')
    sheets.set(root.id, sheet)
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
    st.remove()
  }
  const styled = [root, ...Array.from(root.querySelectorAll('[style]'))].filter((el) => el.hasAttribute('style'))
  const inline = styled.map((el) => {
    const css = el.getAttribute('style') ?? ''
    el.removeAttribute('style')
    return css
  })
  const node = document.importNode(root, true)
  // importNode giữ thứ tự cây: duyệt lại theo cùng thứ tự để gán style qua CSSOM
  const copies = [node, ...Array.from(node.querySelectorAll('*'))]
  const originals = [root, ...Array.from(root.querySelectorAll('*'))]
  styled.forEach((el, i) => {
    ;(copies[originals.indexOf(el)] as SVGElement).style.cssText = inline[i]
  })
  return node
}

/** Thay mọi khối mermaid trong `root` bằng sơ đồ SVG. Khối đã vẽ (giữ nguồn ở data-src) được vẽ lại
 * theo `theme` mới. Sơ đồ sai cú pháp: giữ nguyên mã nguồn kèm dòng báo lỗi. */
export async function renderMermaidIn(root: HTMLElement, theme: MermaidTheme): Promise<void> {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(BLOCKS))) {
    const host = el.matches('code') ? (el.parentElement as HTMLElement) : el
    const source = el.dataset.src ?? el.textContent ?? ''
    if (host.dataset.theme === theme) continue
    let svg: Element
    try {
      svg = svgElement(await renderMermaid(source, theme))
    } catch (err) {
      if (!host.isConnected || host.classList.contains('mmd-error')) continue
      host.classList.add('mmd-error')
      host.insertAdjacentHTML('afterend', `<p class="mmd-error-msg"></p>`)
      ;(host.nextElementSibling as HTMLElement).textContent =
        t('mermaid.error', { err: err instanceof Error ? err.message.split('\n')[0] : String(err) })
      continue
    }
    // Tài liệu có thể đã đổi trong lúc chờ vẽ
    if (!host.isConnected) continue
    const box = document.createElement('div')
    box.className = 'mmd'
    box.dataset.src = source
    box.dataset.theme = theme
    box.setAttribute('role', 'img')
    box.setAttribute('aria-label', t('mermaid.aria'))
    box.append(svg)
    host.replaceWith(box)
    fitViewBox(svg as SVGSVGElement)
  }
}

/* Trên Electron, viewBox mermaid tự tính có thể lệch khỏi nội dung thật (gốc âm, nội dung tràn phải -> sơ đồ bị cắt).
 * Tính lại từ getBBox khi SVG đã nằm trong trang (chỉ đo được lúc đó). */
function fitViewBox(svg: SVGSVGElement): void {
  const b = svg.getBBox()
  if (!b.width || !b.height) return
  const pad = 8
  const [w, h] = [b.width + 2 * pad, b.height + 2 * pad]
  svg.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${w} ${h}`)
  svg.setAttribute('width', String(w))
  svg.setAttribute('height', String(h))
}

/** Bản HTML (đã sanitize) với khối mermaid đã thay bằng SVG, dùng cho trang HTML xuất ra. */
export async function inlineMermaid(html: string, theme: MermaidTheme): Promise<string> {
  if (!html.includes('language-mermaid')) return html
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html')
  const root = doc.getElementById('r') as HTMLElement
  for (const code of Array.from(root.querySelectorAll('pre > code.language-mermaid'))) {
    const pre = code.parentElement as HTMLElement
    try {
      const svg = await renderMermaid(code.textContent ?? '', theme)
      const box = doc.createElement('figure')
      box.className = 'mmd'
      box.innerHTML = svg
      pre.replaceWith(box)
    } catch {
      /* sai cú pháp: giữ khối code gốc */
    }
  }
  return root.innerHTML
}
