/* Excel -> Markdown converter.
 * Hiểu các định dạng tài liệu 基本設計 (Backlog): banner 基本設計, meta 機能ID/画面ID/
 * テーブルID..., section 【...】/■..., bảng No/№/項番, header gộp nhiều tầng,
 * ô merge ngang/dọc, dòng ghi chú ※ cuối bảng, ô nhiều dòng, công thức.
 */
import * as XLSX from 'xlsx'
import type { ConvertOptions, VerticalMergeMode } from '../../../types'
import { escapeMarkdownInline, type SheetResult } from './output'

// Giữ API cũ: test và code cũ import các hàm này từ converter.
export { dedupeFileName, escapeMarkdownInline, joinWorkbookMarkdown, safeFileName, type SheetResult } from './output'
// Re-export outbound adapters để tương thích ngược với tests và worker cũ
export { convertSheet, convertWorkbook, listSheets, readWorkbook } from '../../adapters/outbound/xlsxFiles'

const META_LABELS = new Set([
  '機能ID',
  '機能名',
  '画面ID',
  '画面名',
  'テーブルID',
  'テーブル名',
  '更新種別',
  '画面遷移',
  '動作環境',
  'システム名',
  'サブシステム名',
  'モジュールID',
  'モジュール名',
  'バッチID',
  'バッチ名',
  '帳票ID',
  '帳票名',
  'API ID',
  'API名',
  'エンドポイント',
  '対象システム',
  '前提条件',
  'トリガー',
])
const HEADER_LABELS = new Set(['No', '№', '項番', '번호', '#'])
const DOC_KIND = '基本設計'
/** Prefix cho dòng nối tiếp (sub-bullet) dưới meta. */
const SUB_BULLET = '  - '

type WorkSheet = XLSX.WorkSheet

/** Merge ngang trên một dòng trong hệ tọa độ của grid (đã trừ ref.s). */
interface HMergeSpan {
  sc: number
  ec: number
}

interface GridData {
  grid: string[][]
  /** Các vùng merge ngang theo từng dòng của grid (r -> danh sách [sc, ec]) */
  hMergesByRow: Map<number, HMergeSpan[]>
  /** Các ô được sinh ra từ merge dọc (dạng `${r},${c}`) */
  vMergedCells: Set<string>
}

/** Escape cú pháp *đầu block* cho text đứng đầu dòng (đoạn văn, quote, sub-bullet):
 * `# x` (heading), `> x` (quote), `- x`/`+ x` (list), `---` (đường kẻ), `1. x`/`1) x` (list số).
 * `***`/`___` đã được escape inline. */
function escapeBlockStart(s: string): string {
  if (/^(#{1,6}|[-+])(\s|$)/.test(s) || /^-{3,}[\s-]*$/.test(s) || s.startsWith('>')) return '\\' + s
  return s.replace(/^(\d{1,9})([.)])(?=\s|$)/, '$1\\$2')
}

/** Parse `A1:F40` / `B2` (không phân biệt hoa thường); chuỗi lạ -> null (= cả sheet). */
export function parseRange(s: string | undefined): XLSX.Range | null {
  const t = (s ?? '').trim()
  if (!/^[A-Za-z]{1,3}\d{1,7}(:[A-Za-z]{1,3}\d{1,7})?$/.test(t)) return null
  const r = XLSX.utils.decode_range(t.toUpperCase())
  return r.s.r >= 0 && r.s.r <= r.e.r && r.s.c <= r.e.c ? r : null
}

function getCell(ws: WorkSheet, r: number, c: number, esc: boolean, formulas = false): string {
  const cell = ws[XLSX.utils.encode_cell({ r, c })]
  if (!cell) return ''
  try {
    const text = XLSX.utils.format_cell(cell).trim()
    if (formulas && typeof cell.f === 'string' && cell.f !== '') {
      // shortcut: công thức chứa backtick/xuống dòng bị làm phẳng, đủ cho đọc hiểu
      const f = '`=' + cell.f.replace(/[`\r\n]+/g, ' ') + '`'
      return text ? (esc ? escapeMarkdownInline(text) : text) + ' ' + f : f
    }
    const target = cell.l?.Target?.trim()
    if (target && text && text !== target) {
      if (!esc) return '[' + text + '](' + target + ')'
      const label = escapeMarkdownInline(text).replace(/(?<!\\)[[\]]/g, '\\$&')
      // encodeURIComponent không encode ( ) nên tự map; ngoặc/khoảng trắng làm gãy cú pháp link
      const href = target.replace(/[ ()<>]/g, (ch: string) => '%' + ch.charCodeAt(0).toString(16).toUpperCase())
      return '[' + label + '](' + href + ')'
    }
    return esc ? escapeMarkdownInline(text) : text
  } catch {
    return ''
  }
}

const nonEmptyCount = (row: string[]): number => {
  let n = 0
  for (const v of row) if (v !== '') n++
  return n
}

/** Ô có nội dung thật (bỏ ô rỗng / chỉ khoảng trắng). Rẻ hơn format_cell. */
function hasContent(cell: XLSX.CellObject | undefined): boolean {
  if (!cell || cell.v === undefined || cell.v === null) return false
  return typeof cell.v !== 'string' || cell.v.trim() !== ''
}

/** Range cần quét. Góc trên-trái giữ theo `!ref` (vị trí cột không đổi), góc dưới-phải
 * cắt về ô có nội dung cuối cùng, kể cả vùng merge dọc từ ô có nội dung.
 * Excel ghi `!ref` theo vùng có *định dạng* (kẻ viền, tô màu một ô lạc ở xa...), nên
 * `!ref` có thể phình tới hàng triệu ô trống -> quét toàn bộ sẽ treo main process.
 * Thiếu `!ref` (file hỏng / ws dựng tay) thì bắt đầu từ A1. Trả null nếu không có nội dung. */
function effectiveRange(ws: WorkSheet, clip: XLSX.Range | null = null): XLSX.Range | null {
  const declared = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref'] as string) : null
  const s0 = declared ? declared.s : { r: 0, c: 0 }
  const s = clip ? { r: Math.max(s0.r, clip.s.r), c: Math.max(s0.c, clip.s.c) } : s0
  const limR = Math.min(declared ? declared.e.r : Infinity, clip ? clip.e.r : Infinity)
  const limC = Math.min(declared ? declared.e.c : Infinity, clip ? clip.e.c : Infinity)
  let maxR = -1
  let maxC = -1
  const take = (r: number, c: number): void => {
    if (r < s.r || c < s.c) return
    if (clip && (r > limR || c > limC)) return
    if (r > maxR) maxR = Math.min(r, limR)
    if (c > maxC) maxC = Math.min(c, limC)
  }
  for (const k of Object.keys(ws)) {
    if (k[0] === '!' || !hasContent(ws[k] as XLSX.CellObject)) continue
    const { r, c } = XLSX.utils.decode_cell(k)
    if (r >= 0 && c >= 0) take(r, c)
  }
  for (const m of ws['!merges'] || []) {
    // Merge dọc lan giá trị ô gốc xuống tới m.e.r (xem sheetToGrid)
    if (hasContent(ws[XLSX.utils.encode_cell(m.s)] as XLSX.CellObject)) take(m.e.r, m.s.c)
  }
  if (maxR < s.r || maxC < s.c) return null
  return { s, e: { r: maxR, c: maxC } }
}

/** Dòng banner tiêu đề (基本設計 + merge 2D) phải được phát hiện trước khi lan merge dọc,
 * nếu không giá trị banner sẽ rò rỉ xuống các dòng dưới. */
function sheetToGrid(
  ws: WorkSheet,
  esc: boolean,
  clip: XLSX.Range | null = null,
  formulas = false
): GridData {
  const ref = effectiveRange(ws, clip)
  const hMergesByRow = new Map<number, HMergeSpan[]>()
  const vMergedCells = new Set<string>()
  if (!ref) return { grid: [], hMergesByRow, vMergedCells }
  const merges = ws['!merges'] || []
  const grid: string[][] = []
  for (let r = ref.s.r; r <= ref.e.r; r++) {
    const row: string[] = []
    for (let c = ref.s.c; c <= ref.e.c; c++) row.push(getCell(ws, r, c, esc, formulas))
    grid.push(row)
  }
  let bannerIdx = -1
  for (let r = 0; r < grid.length; r++) {
    if (nonEmptyCount(grid[r]) === 0) continue
    if (grid[r][0] === DOC_KIND) bannerIdx = r
    break
  }
  for (const m of merges) {
    const gr = m.s.r - ref.s.r
    const gc = m.s.c - ref.s.c
    const gec = Math.min(m.e.c - ref.s.c, (grid[0]?.length ?? 1) - 1)
    if (gr === bannerIdx) continue
    // Ô gốc nằm ngoài vùng quét (ô gốc rỗng hoặc ngoài !ref) -> không có gì để lan.
    if (gr < 0 || gr >= grid.length || gc < 0 || gc >= grid[gr].length) continue
    if (gec > gc) {
      const list = hMergesByRow.get(gr) ?? []
      list.push({ sc: gc, ec: gec })
      hMergesByRow.set(gr, list)
    }
    // Lan giá trị merge theo chiều dọc (cùng cột, các dòng dưới ô gốc) và đánh dấu vMergedCells.
    const v = grid[gr][gc]
    if (v) {
      const last = Math.min(m.e.r - ref.s.r, grid.length - 1)
      for (let rr = gr + 1; rr <= last; rr++) {
        if (!grid[rr][gc]) {
          grid[rr][gc] = v
          vMergedCells.add(`${rr},${gc}`)
        }
      }
    }
  }
  return { grid, hMergesByRow, vMergedCells }
}

function escCell(v: string, multiline: 'br' | 'space'): string {
  let s = v.replace(/\|/g, '\\|')
  s = multiline === 'space' ? s.replace(/\r?\n/g, ' ') : s.replace(/\r?\n/g, '<br>')
  // Chỉ gộp space/tab ASCII. Khoảng trắng toàn角 (U+3000) là nội dung: căn chỉnh
  // giữa chữ và thụt lề dòng 2+ trong ô nhiều dòng của tài liệu tiếng Nhật.
  return s.replace(/[ \t]+/g, ' ').trim()
}

/** Độ rộng hiển thị xấp xỉ của chuỗi trong font monospace (CJK / toàn角 tính bằng 2 ký tự ASCII). */
function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0
    w +=
      (code >= 0x1100 &&
        (code <= 0x115f ||
          code === 0x2329 ||
          code === 0x232a ||
          (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
          (code >= 0xac00 && code <= 0xd7a3) ||
          (code >= 0xf900 && code <= 0xfaff) ||
          (code >= 0xfe10 && code <= 0xfe19) ||
          (code >= 0xfe30 && code <= 0xfe6f) ||
          (code >= 0xff00 && code <= 0xff60) ||
          (code >= 0xffe0 && code <= 0xffe6)))
        ? 2
        : 1
  }
  return w
}

function padDisplay(s: string, targetWidth: number): string {
  const pad = targetWidth - displayWidth(s)
  return pad > 0 ? s + ' '.repeat(pad) : s
}

const isSectionTitle = (s: string): boolean =>
  /^【[^】]+】$/.test(s) || s.startsWith('■')

/** Nhận diện dòng ghi chú cuối bảng (bắt đầu bằng ※, 注：, 注:, 注), ＊). */
const isFootnoteText = (s: string): boolean =>
  /^(※|＊|注[：:）)]|Note[:：])/i.test(s.trim())

interface MetaPair {
  label: string
  values: string[]
}

/** Một dòng có thể chứa nhiều cặp meta: 機能ID | v | 機能名 | v | 画面ID |... */
function parseMetaPairs(row: string[]): MetaPair[] {
  const pairs: MetaPair[] = []
  let cur: MetaPair | null = null
  for (const v of row) {
    if (META_LABELS.has(v)) {
      if (cur) pairs.push(cur)
      cur = { label: v, values: [] }
    } else if (v !== '' && cur) {
      cur.values.push(v)
    }
  }
  if (cur) pairs.push(cur)
  return pairs
}

/** Gộp các cột nằm trong vùng merge ngang của header (khi header tại các cột phụ đang rỗng)
 * để tránh sinh ra cột không tên `|  |` trong bảng Markdown. */
function consolidateMergedCols(
  header: string[],
  rows: string[][],
  headerSpans: HMergeSpan[]
): { header: string[]; rows: string[][] } {
  const activeSpans = headerSpans.filter(
    (sp) =>
      sp.ec > sp.sc &&
      (header[sp.sc] ?? '') !== '' &&
      header.slice(sp.sc + 1, sp.ec + 1).every((h) => (h ?? '') === '')
  )
  if (activeSpans.length === 0) return { header, rows }
  const nextRows = rows.map((r) => {
    const copy = r.slice()
    for (const sp of activeSpans) {
      const parts: string[] = []
      for (let c = sp.sc; c <= sp.ec; c++) {
        const val = copy[c] ?? ''
        if (val !== '') parts.push(val)
        if (c > sp.sc) copy[c] = ''
      }
      copy[sp.sc] = parts.join(' ')
    }
    return copy
  })
  return { header, rows: nextRows }
}

/** Render bảng, bỏ các cột trống toàn bảng để markdown gọn. Hỗ trợ căn thẳng cột khi opts.alignTables = true. */
function renderTable(
  rawHeader: string[],
  rawRows: string[][],
  opts: ConvertOptions,
  headerSpans: HMergeSpan[] = []
): string {
  const { header, rows } = consolidateMergedCols(rawHeader, rawRows, headerSpans)
  const maxCols = Math.max(header.length, ...rows.map((r) => r.length))
  const keptIdx: number[] = []
  for (let i = 0; i < maxCols; i++) {
    if ((header[i] ?? '') !== '' || rows.some((r) => (r[i] ?? '') !== '')) keptIdx.push(i)
  }
  if (keptIdx.length === 0) return ''
  const h = keptIdx.map((i) => escCell(header[i] ?? '', opts.multiline))
  const bodyMatrix = rows.map((r) => keptIdx.map((i) => escCell(r[i] ?? '', opts.multiline)))

  let head: string[]
  let body: string[]
  if (opts.alignTables) {
    const widths = keptIdx.map((_, colIdx) =>
      Math.max(3, displayWidth(h[colIdx]), ...bodyMatrix.map((row) => displayWidth(row[colIdx])))
    )
    head = [
      '| ' + h.map((cell, idx) => padDisplay(cell, widths[idx])).join(' | ') + ' |',
      '| ' + widths.map((w) => '-'.repeat(w)).join(' | ') + ' |',
    ]
    body = bodyMatrix.map(
      (row) => '| ' + row.map((cell, idx) => padDisplay(cell, widths[idx])).join(' | ') + ' |'
    )
  } else {
    head = ['| ' + h.join(' | ') + ' |', '|' + h.map(() => '---').join('|') + '|']
    body = bodyMatrix.map((row) => '| ' + row.join(' | ') + ' |')
  }

  const n = opts.chunkRows > 0 ? Math.floor(opts.chunkRows) : 0
  if (n === 0 || body.length <= n) return [...head, ...body].join('\n')
  // Mỗi khối tự đủ nghĩa (header lặp lại) để chia nhỏ cho RAG/LLM.
  const chunks: string[] = []
  for (let i = 0; i < body.length; i += n) chunks.push([...head, ...body.slice(i, i + n)].join('\n'))
  return chunks.join('\n\n')
}

/** Nếu dòng `rowIdx` là header có merge ngang (nhóm cột) và dòng `rowIdx + 1` là dòng tiêu đề phụ
 * (các cột ngoài vùng merge ngang đều rỗng hoặc trùng với dòng `rowIdx` do merge dọc, còn trong vùng
 * merge ngang có tên cột con), gộp 2 dòng thành 1 header dạng `Nhóm / Cột con`. */
function tryMergeTwoRowHeader(
  topRow: string[],
  subRow: string[] | undefined,
  spans: HMergeSpan[] | undefined
): string[] | null {
  if (!subRow || !spans || spans.length === 0) return null
  const validSpans = spans.filter((sp) => sp.ec > sp.sc && (topRow[sp.sc] ?? '') !== '')
  if (validSpans.length === 0) return null

  const inSpan = (c: number): HMergeSpan | undefined =>
    validSpans.find((sp) => c >= sp.sc && c <= sp.ec)

  let hasSubLabels = false
  const len = Math.max(topRow.length, subRow.length)
  for (let c = 0; c < len; c++) {
    const sp = inSpan(c)
    const topVal = topRow[c] ?? ''
    const subVal = subRow[c] ?? ''
    if (sp) {
      const groupLabel = topRow[sp.sc] ?? ''
      if (subVal !== '' && subVal !== groupLabel) hasSubLabels = true
    } else {
      // Ngoài vùng merge ngang: dòng sub-header chỉ được rỗng hoặc trùng dòng trên (do merge dọc)
      if (subVal !== '' && subVal !== topVal) return null
    }
  }
  if (!hasSubLabels) return null

  const merged: string[] = []
  for (let c = 0; c < len; c++) {
    const sp = inSpan(c)
    const subVal = subRow[c] ?? ''
    if (sp) {
      const groupLabel = topRow[sp.sc] ?? ''
      if (subVal !== '' && subVal !== groupLabel) {
        merged.push(`${groupLabel} / ${subVal}`)
      } else {
        merged.push(c === sp.sc ? groupLabel : '')
      }
    } else {
      merged.push(topRow[c] || subVal || '')
    }
  }
  return merged
}

/** Áp dụng chế độ xử lý ô merge dọc cho một dòng dữ liệu trong bảng. */
function applyVerticalMergeMode(
  row: string[],
  rowIdx: number,
  vMergedCells: Set<string>,
  mode: VerticalMergeMode
): string[] {
  if (mode === 'repeat') return row
  return row.map((val, colIdx) => {
    if (!vMergedCells.has(`${rowIdx},${colIdx}`)) return val
    return mode === 'ditto' ? '↑' : ''
  })
}

/** Trích xuất nhanh tiêu đề tài liệu (từ banner 基本設計) và các cặp META_LABELS đầu sheet
 * để làm giàu YAML front-matter cho RAG/LLM. Không trả trường rỗng để giữ tương thích ngược. */
export function extractSheetMeta(
  ws: WorkSheet | undefined,
  sheetName: string
): { title?: string; meta?: Record<string, string> } {
  if (!ws) return {}
  const { grid } = sheetToGrid(ws, false)
  let i = 0
  while (i < grid.length && nonEmptyCount(grid[i]) === 0) i++
  if (i >= grid.length) return {}

  let title: string | undefined
  if (grid[i][0] === DOC_KIND) {
    const firstLabel = grid[i].slice(1).find((v) => v !== '')
    if (firstLabel && firstLabel !== sheetName) {
      title = firstLabel.replace(/\r?\n/g, ' ').trim()
    }
    i++
  }

  const meta: Record<string, string> = {}
  for (; i < grid.length; i++) {
    const r = grid[i]
    if (nonEmptyCount(r) === 0) continue
    if (META_LABELS.has(r[0])) {
      for (const p of parseMetaPairs(r)) {
        const val = p.values.join(' ').replace(/\r?\n/g, ' ').trim()
        if (val && !(p.label in meta)) meta[p.label] = val
      }
    } else if (HEADER_LABELS.has(r.find((x) => x !== '') ?? '') || isSectionTitle(r.find((x) => x !== '') ?? '')) {
      break
    }
  }

  const out: { title?: string; meta?: Record<string, string> } = {}
  if (title) out.title = title
  if (Object.keys(meta).length > 0) out.meta = meta
  return out
}

/** Convert một worksheet thành Markdown, hiểu định dạng tài liệu 基本設計. */
export function sheetToMarkdown(ws: WorkSheet, sheetName: string, opts: ConvertOptions): string {
  // Option có thể thiếu khi store cũ / caller cũ: mặc định escape.
  const esc = opts.escapeMarkdown !== false
  const vMergeMode: VerticalMergeMode = opts.verticalMerge ?? 'repeat'
  /** Text do người dùng nhập đứng đầu dòng (đoạn văn, quote, sub-bullet). */
  const blk = (s: string): string => (esc ? escapeBlockStart(s) : s)
  const title = esc ? escapeMarkdownInline(sheetName) : sheetName
  const { grid, hMergesByRow, vMergedCells } = sheetToGrid(
    ws,
    esc,
    parseRange(opts.range),
    opts.showFormulas === true
  )
  const out: string[] = []
  if (opts.includeSheetTitle) out.push('## ' + title, '')

  let i = 0
  while (i < grid.length && nonEmptyCount(grid[i]) === 0) i++
  if (i >= grid.length) return ''

  // ---- Banner 基本設計 ----
  if (grid[i][0] === DOC_KIND) {
    const labels: { idx: number; v: string }[] = []
    grid[i].forEach((v, idx) => {
      if (idx > 0 && v !== '') labels.push({ idx, v })
    })
    const docTitle = labels.length > 0 && labels[0].v !== title ? labels[0].v : ''
    out.push('> ' + DOC_KIND + (docTitle ? '：' + escCell(docTitle, opts.multiline) : ''), '')
    // Khối 版数/作成日/作成者: các dòng tiếp theo chỉ có giá trị tại đúng các cột label
    const versionLabels = labels.slice(1)
    const versionCols = new Set(versionLabels.map((l) => l.idx))
    const dataRows: string[][] = []
    let j = i + 1
    if (versionCols.size > 0) {
      for (; j < grid.length; j++) {
        const r = grid[j]
        let count = 0
        let foreign = false
        r.forEach((v, idx) => {
          if (v !== '') {
            count++
            if (!versionCols.has(idx)) foreign = true
          }
        })
        if (count === 0) break
        if (foreign) {
          const vr: string[] = r.map(() => '')
          let hasVersion = false
          r.forEach((v, idx) => {
            if (v !== '' && versionCols.has(idx)) {
              vr[idx] = v
              r[idx] = ''
              hasVersion = true
            }
          })
          if (hasVersion) dataRows.push(vr)
          break
        }
        dataRows.push(r)
      }
    }
    if (dataRows.length > 0) {
      const hdr = versionLabels.filter((l) => dataRows.some((r) => r[l.idx] !== ''))
      if (hdr.length > 0) {
        const hrow: string[] = grid[i].map(() => '')
        hdr.forEach((l) => {
          hrow[l.idx] = l.v
        })
        const t = renderTable(hrow, dataRows, opts)
        if (t) out.push(t, '')
      }
      i = j
    } else {
      i = i + 1
    }
  }

  let tableHeader: string[] | null = null
  let tableHeaderSpans: HMergeSpan[] = []
  let tableRows: string[][] = []
  let lastMetaLabel: string | null = null
  /** Sub-bullet meta không có dòng trống phía sau (để các dòng nối tiếp liền nhau).
   * Block mới (bảng, heading, quote, đoạn văn) phải cách 1 dòng trống, nếu không
   * Markdown nuốt nó vào list item (bảng nằm trong <li>, đoạn văn nối lazy). */
  const startBlock = (): void => {
    if (out.length > 0 && out[out.length - 1] !== '') out.push('')
  }
  const flushTable = (): void => {
    if (tableHeader) {
      const t = renderTable(tableHeader, tableRows, opts, tableHeaderSpans)
      if (t) {
        startBlock()
        out.push(t, '')
      }
      tableHeader = null
      tableHeaderSpans = []
      tableRows = []
    }
  }
  const openTableAt = (rowIdx: number): void => {
    const r = grid[rowIdx]
    const spans = hMergesByRow.get(rowIdx) ?? []
    const merged2 = tryMergeTwoRowHeader(r, grid[rowIdx + 1], spans)
    if (merged2) {
      tableHeader = merged2
      // Khi đã tách thành cột con ở dòng 2, chỉ giữ các span không bị tách
      tableHeaderSpans = hMergesByRow.get(rowIdx + 1) ?? []
      i = rowIdx + 1
    } else {
      tableHeader = r.slice()
      tableHeaderSpans = spans
    }
    tableRows = []
    lastMetaLabel = null
  }
  const isMetaRow = (r: string[]): boolean => META_LABELS.has(r[0])
  /** Dòng "ma" do merge dọc lan giá trị header xuống: mọi ô có giá trị đều
   * trùng header hiện tại -> bỏ qua, không coi là dòng dữ liệu. */
  const isHeaderGhost = (r: string[], th: string[]): boolean =>
    r.length <= th.length &&
    r.some((c) => c !== '') &&
    r.every((c, i) => c === '' || c === th[i])
  /** Heuristic nhận diện dòng tiêu đề bảng. Mặc định cần >= 3 ô;
   * khi bật detectTwoColTables thì bảng 2 cột cũng được nhận diện. */
  const isTableHeaderRow = (row: string[], next: string[] | undefined, fe: string, n: number): boolean => {
    if (HEADER_LABELS.has(fe)) return true
    const minCols = opts.detectTwoColTables ? 2 : 3
    return n >= minCols && !!next && nonEmptyCount(next) >= 2 && !isMetaRow(next)
  }

  for (; i < grid.length; i++) {
    const r = grid[i]
    const n = nonEmptyCount(r)
    if (n === 0) {
      flushTable()
      lastMetaLabel = null
      continue
    }
    const feIdx = r.findIndex((v) => v !== '')
    const fe = r[feIdx]

    if (n === 1) {
      const v = escCell(fe, opts.multiline)
      const rowSpans = hMergesByRow.get(i) ?? []
      const isFullWidthMergedNote =
        feIdx === 0 && rowSpans.some((sp) => sp.sc === 0 && sp.ec >= 2)
      if (tableHeader && !isSectionTitle(fe) && !isFootnoteText(fe) && !isFullWidthMergedNote) {
        // Dòng ma do merge dọc lan header xuống -> bỏ qua
        if (isHeaderGhost(r, tableHeader)) {
          continue
        }
        tableRows.push(applyVerticalMergeMode(r, i, vMergedCells, vMergeMode)) // dòng nối tiếp trong bảng
      } else if (lastMetaLabel && !tableHeader && !isSectionTitle(fe) && v) {
        // Dòng 1 ô ngay sau meta (vd: 画面遷移 xuống dòng) -> sub-bullet nối tiếp.
        if (out.length > 0 && out[out.length - 1] === '') out.pop()
        out.push(SUB_BULLET + blk(v))
      } else if (META_LABELS.has(fe)) {
        // Ô đơn lẻ trùng tên meta label -> bullet không giá trị
        flushTable()
        out.push('- **' + v + '**', '')
        lastMetaLabel = fe
      } else if (isSectionTitle(fe)) {
        flushTable()
        lastMetaLabel = null
        startBlock()
        out.push('### ' + v, '')
      } else {
        flushTable()
        lastMetaLabel = null
        // Dòng 1 ô đứng ngay trên bảng -> coi là tiêu đề của bảng đó (trừ khi là dòng ghi chú ※)
        const nr = grid[i + 1]
        const nnr = grid[i + 2]
        const nfe = nr?.find((x) => x !== '') ?? ''
        const aboveTable =
          !isFootnoteText(fe) && !!nr && isTableHeaderRow(nr, nnr, nfe, nonEmptyCount(nr))
        startBlock()
        out.push(aboveTable ? '### ' + v : '> ' + blk(v), '')
      }
      continue
    }
    if (isMetaRow(r)) {
      flushTable()
      for (const p of parseMetaPairs(r)) {
        let val = p.values.join(' ')
        // "N. text" do engine tự đánh số -> không escape đầu block
        const numbered = /^\d+$/.test(p.values[0] ?? '') && p.values.length > 1
        if (numbered) {
          val = p.values[0] + '. ' + p.values.slice(1).join(' ')
        }
        val = escCell(val, opts.multiline)
        if (p.label === lastMetaLabel && val) {
          out.push(SUB_BULLET + (numbered ? val : blk(val)))
        } else {
          out.push('- **' + p.label + '**' + (val ? ': ' + val : ''))
          lastMetaLabel = p.label
        }
      }
      out.push('')
      continue
    }
    if (lastMetaLabel && !tableHeader && r[0] === '') {
      const next2 = grid[i + 1]
      const looksHeader2 = isTableHeaderRow(r, next2, fe, n)
      if (!looksHeader2) {
        const vals = r.filter((v) => v !== '')
        let cval = vals.join(' ')
        const numbered = /^\d+$/.test(vals[0] ?? '') && vals.length > 1
        if (numbered) {
          cval = vals[0] + '. ' + vals.slice(1).join(' ')
        }
        cval = escCell(cval, opts.multiline)
        if (cval) {
          if (out.length > 0 && out[out.length - 1] === '') out.pop()
          out.push(SUB_BULLET + (numbered ? cval : blk(cval)))
        }
        continue
      }
    }
    if (tableHeader) {
      if (isHeaderGhost(r, tableHeader)) {
        continue
      }
      if (HEADER_LABELS.has(fe) && !vMergedCells.has(`${i},${feIdx}`)) {
        flushTable()
        openTableAt(i)
      } else {
        tableRows.push(applyVerticalMergeMode(r, i, vMergedCells, vMergeMode))
      }
      continue
    }
    // Nhận diện dòng tiêu đề bảng khi chưa mở bảng
    const next = grid[i + 1]
    const looksHeader = isTableHeaderRow(r, next, fe, n)
    if (looksHeader) {
      openTableAt(i)
      continue
    }
    lastMetaLabel = null
    startBlock()
    out.push(blk(escCell(r.filter((v) => v !== '').join(' '), opts.multiline)), '')
  }
  flushTable()
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}

export type WorkBook = XLSX.WorkBook

/** Liệt kê sheet của workbook kèm số dòng (theo nội dung thật) và cờ ẩn. */
export function listSheetsInWorkbook(
  wb: WorkBook,
  skipDelSheets: boolean
): { name: string; rows: number; hidden: boolean }[] {
  return wb.SheetNames.filter((sn) => !(skipDelSheets && /^DEL_/i.test(sn))).map((sn) => {
    const ref = effectiveRange(wb.Sheets[sn])
    const rows = ref ? ref.e.r - ref.s.r + 1 : 0
    const hidden = wb.Workbook?.Sheets?.[wb.SheetNames.indexOf(sn)]?.Hidden === 1
    return { name: sn, rows, hidden }
  })
}

/** Convert một sheet của workbook theo tên. Ném lỗi nếu không tìm thấy sheet. */
export function convertSheetInWorkbook(wb: WorkBook, sheetName: string, opts: ConvertOptions): string {
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error('Không tìm thấy sheet: ' + sheetName)
  return sheetToMarkdown(ws, sheetName, opts)
}

/** Convert nhiều sheet của một workbook. Bỏ qua sheet không tồn tại;
 * bỏ sheet rỗng nếu opts.skipEmptySheets. */
export function convertSheetsInWorkbook(
  wb: WorkBook,
  sheetNames: string[],
  opts: ConvertOptions
): SheetResult[] {
  const results: SheetResult[] = []
  for (const sn of sheetNames) {
    const ws = wb.Sheets[sn]
    if (!ws) continue
    const md = sheetToMarkdown(ws, sn, opts)
    if (opts.skipEmptySheets && md.trim() === '') continue
    results.push({ sheet: sn, markdown: md, ...extractSheetMeta(ws, sn) })
  }
  return results
}
