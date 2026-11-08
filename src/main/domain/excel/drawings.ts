/* Lớp vẽ của sheet .xlsx: ảnh, shape/text box, mũi tên (xl/drawings/drawingN.xml).
 * SheetJS bản community không đọc phần này; ta đọc thẳng các part XML mà
 * `readFile(..., { bookFiles: true })` giữ lại trong `wb.files`.
 * Biểu đồ (c:chart) đọc từ giá trị cache trong xl/charts/chartN.xml: loại, tiêu đề, bảng số liệu.
 * shortcut: chưa đọc SmartArt, biểu đồ kiểu mới (chartex: waterfall, treemap...) và lớp vẽ của file .xls (BIFF) — thêm khi có tài liệu thật cần.
 */
import { posix } from 'node:path'
import * as XLSX from 'xlsx'
import { safeFileName } from './output'

export interface DrawingItem {
  /** Ô neo trên-trái (0-based, toạ độ sheet) */
  row: number
  col: number
  /** Vùng chiếm, vd `B10` hoặc `B10:F12` */
  ref: string
  /** Chữ trong các shape của anchor (mỗi phần tử có thể nhiều dòng) */
  texts: string[]
  /** Ảnh: `name` = tên file trong xl/media */
  images: { name: string; alt: string }[]
  /** Mũi tên/đường nối đã suy ra hai đầu */
  arrow?: { from: string; to: string; both: boolean; label?: string }
  /** Biểu đồ: số liệu lấy từ cache Excel đã lưu trong file */
  charts: ChartData[]
}

export interface ChartData {
  /** Loại biểu đồ tiếng Nhật, vd `縦棒グラフ`, nhiều loại (combo) nối bằng `・` */
  type: string
  title?: string
  /** Nhãn trục danh mục (hoặc giá trị X của biểu đồ phân tán) */
  categories: string[]
  series: { name: string; values: string[] }[]
}

export interface SheetDrawings {
  items: DrawingItem[]
  /** Nội dung ảnh theo tên file (chỉ ảnh được tham chiếu) */
  media: Record<string, Uint8Array>
}

type Files = Record<string, { content?: Uint8Array } | undefined>

const NS = '(?:\\w+:)?'
/** Thẻ mở tối đa bấy nhiêu ký tự: XML không tin cậy thiếu `>` không làm regex quét tới cuối file ở mỗi vị trí. */
const TAG = '[^>]{0,4000}'

/** Các phần tử `<ns:name ...>...</ns:name>` (cả `<name/>`), theo thứ tự, không xét lồng cùng tên.
 * Tìm thẻ đóng bằng indexOf và dừng khi thiếu: XML hỏng/độc (vạn thẻ mở không đóng) không làm
 * regex lười `[\s\S]*?` quét lại cả file từ mỗi thẻ mở (O(n²), treo worker hàng giờ). */
function elements(xml: string, names: string, limit = Infinity): string[] {
  const out: string[] = []
  const open = new RegExp(`<(\\w+:)?(${names})(?=[\\s>/])${TAG}>`, 'g')
  for (let m = open.exec(xml); m && out.length < limit; m = open.exec(xml)) {
    if (m[0].endsWith('/>')) {
      out.push(m[0])
      continue
    }
    const close = `</${m[1] ?? ''}${m[2]}>`
    const end = xml.indexOf(close, open.lastIndex)
    if (end < 0) break
    out.push(xml.slice(m.index, end + close.length))
    open.lastIndex = end + close.length
  }
  return out
}

/** Nội dung bên trong phần tử `tag` đầu tiên (undefined nếu không có hoặc tự đóng). */
function inner(xml: string, tag: string): string | undefined {
  const e = elements(xml, tag, 1)[0]
  return e && !e.endsWith('/>') ? e.slice(e.indexOf('>') + 1, e.lastIndexOf('</')) : undefined
}

/** Ghép chữ của mọi `<a:t>` trong `xml`. */
const runsText = (xml: string): string => elements(xml, 't').map((t) => decodeXml(inner(t, 't') ?? '')).join('')

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
    const k = e.toLowerCase()
    if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10))
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[k] ?? _m
  })
}

const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? decodeXml(m[1]) : undefined
}

function readText(files: Files, path: string): string | null {
  const c = files[path]?.content
  return c ? Buffer.from(c).toString('utf8') : null
}

/** Relationship Id -> đường dẫn part tuyệt đối trong zip (không có `/` đầu). */
function readRels(files: Files, partPath: string): Map<string, { type: string; path: string }> {
  const dir = posix.dirname(partPath)
  const xml = readText(files, posix.join(dir, '_rels', posix.basename(partPath) + '.rels'))
  const out = new Map<string, { type: string; path: string }>()
  if (!xml) return out
  for (const m of xml.matchAll(new RegExp(`<Relationship\\b${TAG}>`, 'g'))) {
    const id = attr(m[0], 'Id')
    const target = attr(m[0], 'Target')
    if (!id || !target || attr(m[0], 'TargetMode') === 'External') continue
    const path = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(dir, target))
    out.set(id, { type: attr(m[0], 'Type') ?? '', path })
  }
  return out
}

interface Pos {
  col: number
  row: number
  colOff: number
  rowOff: number
}

function readPos(xml: string | undefined): Pos | null {
  if (!xml) return null
  const num = (n: string): number => Number(new RegExp(`<${NS}${n}>(-?\\d+)<`).exec(xml)?.[1] ?? 0)
  return { col: num('col'), row: num('row'), colOff: num('colOff'), rowOff: num('rowOff') }
}

/** Chữ của một shape: các đoạn `<a:p>` nối bằng xuống dòng, bỏ đoạn rỗng. */
function shapeText(sp: string): string {
  const paras = elements(inner(sp, 'txBody') ?? '', 'p').map(runsText)
  return paras.map((s) => s.trim()).filter((s) => s !== '').join('\n')
}

interface Rect {
  c1: number
  r1: number
  c2: number
  r2: number
}

/** Khoảng cách (theo ô) từ điểm tới hình chữ nhật; 0 = nằm trong. */
const distTo = (rc: Rect, c: number, r: number): number =>
  Math.max(rc.c1 - c, 0, c - rc.c2) + Math.max(rc.r1 - r, 0, r - rc.r2)

const CHART_TYPES: Record<string, string> = {
  barChart: '棒グラフ',
  bar3DChart: '棒グラフ',
  lineChart: '折れ線グラフ',
  line3DChart: '折れ線グラフ',
  pieChart: '円グラフ',
  pie3DChart: '円グラフ',
  ofPieChart: '円グラフ',
  doughnutChart: 'ドーナツグラフ',
  areaChart: '面グラフ',
  area3DChart: '面グラフ',
  scatterChart: '散布図',
  radarChart: 'レーダーチャート',
  bubbleChart: 'バブルチャート',
  stockChart: '株価チャート',
  surfaceChart: '等高線グラフ',
  surface3DChart: '等高線グラフ',
}
// shortcut: file độc có thể khai báo số điểm rất lớn; cắt ở 1 000 danh mục, nâng khi gặp biểu đồ thật lớn hơn
const MAX_CHART_POINTS = 1000

/** Các điểm `<c:pt idx="i"><c:v>..</c:v></c:pt>` trong một phần tử (cache chuỗi/số) -> mảng theo idx. */
function chartPoints(xml: string | undefined): string[] {
  const out: string[] = []
  if (!xml) return out
  for (const pt of elements(xml, 'pt')) {
    const idx = Number(attr(pt.slice(0, pt.indexOf('>')), 'idx') ?? out.length)
    if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_CHART_POINTS) continue
    out[idx] = decodeXml(inner(pt, 'v') ?? '').trim()
  }
  return Array.from(out, (v) => v ?? '')
}

/** Chữ của tiêu đề (rich text `<a:t>` hoặc cache của tham chiếu ô). */
function chartTitle(xml: string | undefined): string | undefined {
  if (!xml) return undefined
  const t = (runsText(xml) || chartPoints(xml).join(' ') || decodeXml(inner(xml, 'v') ?? '')).trim()
  return t || undefined
}

/** Đọc một part xl/charts/chartN.xml. Không có series nào -> null. */
export function parseChart(xml: string): ChartData | null {
  const plot = inner(xml, 'plotArea') ?? ''
  const types: string[] = []
  const series: ChartData['series'] = []
  let categories: string[] = []
  for (const g of elements(plot, '\\w+Chart')) {
    let type = CHART_TYPES[/^<(?:\w+:)?(\w+)/.exec(g)?.[1] ?? '']
    if (!type) continue
    if (type === '棒グラフ') type = /<(?:\w+:)?barDir\s+val="bar"/.test(g) ? '横棒グラフ' : '縦棒グラフ'
    if (!types.includes(type)) types.push(type)
    for (const x of elements(g, 'ser')) {
      const cat = chartPoints(inner(x, 'cat') ?? inner(x, 'xVal'))
      if (cat.length > categories.length) categories = cat
      const name = chartTitle(inner(x, 'tx')) ?? '系列' + (series.length + 1)
      series.push({ name, values: chartPoints(inner(x, 'val') ?? inner(x, 'yVal')) })
    }
  }
  if (series.length === 0) return null
  const title = /<(?:\w+:)?autoTitleDeleted\s+val="1"/.test(xml) ? undefined : chartTitle(inner(xml.replace(plot, ''), 'title'))
  return { type: types.join('・'), ...(title ? { title } : {}), categories, series }
}

/** Đọc lớp vẽ của một sheet. Không có drawing (hoặc file .xls) -> rỗng. */
export function sheetDrawings(wb: XLSX.WorkBook, sheetName: string): SheetDrawings {
  const empty: SheetDrawings = { items: [], media: {} }
  const files = (wb as { files?: Files }).files
  const idx = wb.SheetNames.indexOf(sheetName)
  const rid = (wb.Workbook?.Sheets?.[idx] as { id?: string } | undefined)?.id
  if (!files || !rid) return empty
  const sheetPath = readRels(files, 'xl/workbook.xml').get(rid)?.path
  if (!sheetPath) return empty
  const drawingPaths = [...readRels(files, sheetPath).values()]
    .filter((r) => r.type.endsWith('/drawing'))
    .map((r) => r.path)

  const items: DrawingItem[] = []
  const media: Record<string, Uint8Array> = {}
  for (const dPath of drawingPaths) {
    const xml = readText(files, dPath)
    if (!xml) continue
    const rels = readRels(files, dPath)
    const textById = new Map<string, string>()
    const boxes: { rect: Rect; text: string; txBox: boolean; item: DrawingItem }[] = []
    const arrows: { rect: Rect; xml: string; item: DrawingItem }[] = []

    for (const anchor of elements(xml, 'twoCellAnchor|oneCellAnchor|absoluteAnchor')) {
      const from = readPos(inner(anchor, 'from')) ?? {
        col: 0,
        row: 0,
        colOff: 0,
        rowOff: 0,
      }
      const toPos = readPos(inner(anchor, 'to'))
      // `to` có offset 0 = dừng ở mép trái/trên ô đó -> ô cuối thật là ô trước
      const c2 = toPos ? Math.max(from.col, toPos.colOff === 0 ? toPos.col - 1 : toPos.col) : from.col
      const r2 = toPos ? Math.max(from.row, toPos.rowOff === 0 ? toPos.row - 1 : toPos.row) : from.row
      const rect: Rect = { c1: from.col, r1: from.row, c2, r2 }
      const tl = XLSX.utils.encode_cell({ r: from.row, c: from.col })
      const br = XLSX.utils.encode_cell({ r: r2, c: c2 })
      const item: DrawingItem = { row: from.row, col: from.col, ref: tl === br ? tl : tl + ':' + br, texts: [], images: [], charts: [] }

      for (const p of elements(anchor, 'pic')) {
        const embed = /\sr:embed="([^"]+)"/.exec(p)?.[1]
        const path = embed ? rels.get(embed)?.path : undefined
        const content = path ? files[path]?.content : undefined
        if (!path || !content) continue
        // Tên part do file Excel đặt (không tin cậy): `\` cũng là phân cách trên Windows -> chặn path traversal khi ghi ảnh
        const name = safeFileName(posix.basename(path.replace(/\\/g, '/')))
        media[name] = content
        const nv = new RegExp(`<${NS}cNvPr\\b${TAG}>`).exec(p)?.[0] ?? ''
        item.images.push({ name, alt: attr(nv, 'descr') || attr(nv, 'name') || name })
      }
      for (const c of anchor.matchAll(new RegExp(`<${NS}chart\\b[^>]{0,4000}?\\sr:id="([^"]+)"`, 'g'))) {
        const path = rels.get(c[1])?.path
        const chart = path ? readText(files, path) : null
        const data = chart ? parseChart(chart) : null
        if (data) item.charts.push(data)
      }
      for (const sp of elements(anchor, 'sp')) {
        const text = shapeText(sp)
        const id = attr(new RegExp(`<${NS}cNvPr\\b${TAG}>`).exec(sp)?.[0] ?? '', 'id')
        if (!text) continue
        if (id) textById.set(id, text)
        item.texts.push(text)
        boxes.push({ rect, text, txBox: /txBox="1"/.test(sp), item })
      }
      for (const c of elements(anchor, 'cxnSp')) arrows.push({ rect, xml: c, item })
      if (item.texts.length > 0 || item.images.length > 0 || item.charts.length > 0 || arrows.some((x) => x.item === item)) items.push(item)
    }

    // Hai đầu mũi tên: ưu tiên shape được nối (stCxn/endCxn), không thì shape gần đầu mút nhất.
    const oneLine = (s: string): string => s.replace(/\s*\n\s*/g, ' ')
    const nodes = boxes.filter((b) => !b.txBox)
    const nearest = (c: number, r: number): string | undefined => {
      let best: { d: number; area: number; text: string } | undefined
      for (const b of nodes) {
        const d = distTo(b.rect, c, r)
        const area = (b.rect.c2 - b.rect.c1 + 1) * (b.rect.r2 - b.rect.r1 + 1)
        if (d <= 1 && (!best || d < best.d || (d === best.d && area < best.area))) best = { d, area, text: b.text }
      }
      return best?.text
    }
    for (const ar of arrows) {
      const flipH = /\sflipH="1"/.test(ar.xml)
      const flipV = /\sflipV="1"/.test(ar.xml)
      const end = (tag: string): boolean => {
        const t = attr(new RegExp(`<${NS}${tag}\\b${TAG}>`).exec(ar.xml)?.[0] ?? '', 'type')
        return !!t && t !== 'none'
      }
      const sx = flipH ? ar.rect.c2 : ar.rect.c1
      const sy = flipV ? ar.rect.r2 : ar.rect.r1
      const ex = flipH ? ar.rect.c1 : ar.rect.c2
      const ey = flipV ? ar.rect.r1 : ar.rect.r2
      const glued = (tag: string): string | undefined => {
        const id = attr(new RegExp(`<${NS}${tag}\\b${TAG}>`).exec(ar.xml)?.[0] ?? '', 'id')
        return id ? textById.get(id) : undefined
      }
      let a = glued('stCxn') ?? nearest(sx, sy)
      let b = glued('endCxn') ?? nearest(ex, ey)
      if (!a || !b || a === b) continue // đường trang trí, không nối hai shape
      // Mũi tên chỉ có đầu ở điểm bắt đầu (headEnd) -> đảo chiều
      if (end('headEnd') && !end('tailEnd')) [a, b] = [b, a]
      // Text box gần thân mũi tên nhất (đè lên hoặc cách ≤ 1 ô) = nhãn của nó (vd 「はい」「行ダブルクリック」)
      const r = ar.rect
      const gap = (x: Rect): number =>
        Math.max(0, x.c1 - r.c2, r.c1 - x.c2) + Math.max(0, x.r1 - r.r2, r.r1 - x.r2)
      const label = boxes
        .filter((x) => x.txBox && gap(x.rect) <= 1)
        .sort((x, y) => gap(x.rect) - gap(y.rect))[0]
      if (label) {
        label.item.texts = label.item.texts.filter((t) => t !== label.text)
        label.txBox = false
      }
      ar.item.arrow = { from: oneLine(a), to: oneLine(b), both: end('headEnd') && end('tailEnd'), label: label && oneLine(label.text) }
    }
  }
  return {
    items: items
      .filter((it) => it.texts.length > 0 || it.images.length > 0 || it.charts.length > 0 || it.arrow)
      .sort((x, y) => x.row - y.row || x.col - y.col),
    media,
  }
}
