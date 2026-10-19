/* Excel -> Markdown converter.
 * Hiểu các định dạng tài liệu 基本設計 (Backlog): banner 基本設計, meta 機能ID/画面ID/
 * テーブルID..., section 【...】/■..., bảng No/№/項番, ô merge, ô nhiều dòng, công thức.
 */
import * as fs from 'node:fs'
import * as XLSX from 'xlsx'
import type { ConvertOptions } from '../types'

// SheetJS >= 0.20: bản ESM (vitest dùng) không tự nạp `fs`, readFile/writeFile sẽ lỗi
// "Cannot access file". Bản CJS (main process build) không cần nhưng gọi cũng vô hại.
XLSX.set_fs(fs)

export interface SheetResult {
  sheet: string
  markdown: string
}

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
])
const HEADER_LABELS = new Set(['No', '№', '項番'])
const DOC_KIND = '基本設計'
/** Prefix cho dòng nối tiếp (sub-bullet) dưới meta. */
const SUB_BULLET = '  - '

type WorkSheet = XLSX.WorkSheet

function getCell(ws: WorkSheet, r: number, c: number): string {
  const cell = ws[XLSX.utils.encode_cell({ r, c })]
  if (!cell) return ''
  try {
    const text = XLSX.utils.format_cell(cell).trim()
    const target = cell.l?.Target?.trim()
    if (target && text && text !== target) {
      return '[' + text + '](' + target + ')'
    }
    return text
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
function effectiveRange(ws: WorkSheet): XLSX.Range | null {
  const declared = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref'] as string) : null
  const s = declared ? declared.s : { r: 0, c: 0 }
  const limR = declared ? declared.e.r : Infinity
  const limC = declared ? declared.e.c : Infinity
  let maxR = -1
  let maxC = -1
  const take = (r: number, c: number): void => {
    if (r < s.r || c < s.c) return
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
function sheetToGrid(ws: WorkSheet): string[][] {
  const ref = effectiveRange(ws)
  if (!ref) return []
  const merges = ws['!merges'] || []
  const grid: string[][] = []
  for (let r = ref.s.r; r <= ref.e.r; r++) {
    const row: string[] = []
    for (let c = ref.s.c; c <= ref.e.c; c++) row.push(getCell(ws, r, c))
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
    if (gr === bannerIdx) continue
    // Ô gốc nằm ngoài vùng quét (ô gốc rỗng hoặc ngoài !ref) -> không có gì để lan.
    if (gr < 0 || gr >= grid.length || gc < 0 || gc >= grid[gr].length) continue
    // Chỉ lan giá trị merge theo chiều dọc (cùng cột, các dòng dưới ô gốc).
    // Merge ngang giữ nguyên tại ô gốc để markdown gọn.
    const v = grid[gr][gc]
    if (v) {
      const last = Math.min(m.e.r - ref.s.r, grid.length - 1)
      for (let rr = gr + 1; rr <= last; rr++) {
        if (!grid[rr][gc]) grid[rr][gc] = v
      }
    }
  }
  return grid
}

function escCell(v: string, multiline: 'br' | 'space'): string {
  let s = v.replace(/\|/g, '\\|')
  s = multiline === 'space' ? s.replace(/\r?\n/g, ' ') : s.replace(/\r?\n/g, '<br>')
  // Chỉ gộp space/tab ASCII. Khoảng trắng toàn角 (U+3000) là nội dung: căn chỉnh
  // giữa chữ và thụt lề dòng 2+ trong ô nhiều dòng của tài liệu tiếng Nhật.
  return s.replace(/[ \t]+/g, ' ').trim()
}

const isSectionTitle = (s: string): boolean =>
  /^【[^】]+】$/.test(s) || s.startsWith('■')

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

/** Render bảng, bỏ các cột trống toàn bảng để markdown gọn. */
function renderTable(header: string[], rows: string[][], opts: ConvertOptions): string {
  const keptIdx: number[] = []
  header.forEach((h, i) => {
    if (h !== '' || rows.some((r) => (r[i] ?? '') !== '')) keptIdx.push(i)
  })
  if (keptIdx.length === 0) return ''
  const h = keptIdx.map((i) => escCell(header[i], opts.multiline))
  const lines = ['| ' + h.join(' | ') + ' |', '|' + h.map(() => '---').join('|') + '|']
  for (const r of rows) {
    lines.push('| ' + keptIdx.map((i) => escCell(r[i] ?? '', opts.multiline)).join(' | ') + ' |')
  }
  return lines.join('\n')
}

/** Convert một worksheet thành Markdown, hiểu định dạng tài liệu 基本設計. */
export function sheetToMarkdown(ws: WorkSheet, sheetName: string, opts: ConvertOptions): string {
  const grid = sheetToGrid(ws)
  const out: string[] = []
  if (opts.includeSheetTitle) out.push('## ' + sheetName, '')

  let i = 0
  while (i < grid.length && nonEmptyCount(grid[i]) === 0) i++
  if (i >= grid.length) return ''

  // ---- Banner 基本設計 ----
  if (grid[i][0] === DOC_KIND) {
    const labels: { idx: number; v: string }[] = []
    grid[i].forEach((v, idx) => {
      if (idx > 0 && v !== '') labels.push({ idx, v })
    })
    const docTitle = labels.length > 0 && labels[0].v !== sheetName ? labels[0].v : ''
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
  let tableRows: string[][] = []
  let lastMetaLabel: string | null = null
  const flushTable = (): void => {
    if (tableHeader) {
      const t = renderTable(tableHeader, tableRows, opts)
      if (t) out.push(t, '')
      tableHeader = null
      tableRows = []
    }
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
      if (tableHeader && !isSectionTitle(fe)) {
        // Dòng ma do merge dọc lan header xuống -> bỏ qua
        if (isHeaderGhost(r, tableHeader)) {
          continue
        }
        tableRows.push(r) // dòng nối tiếp trong bảng (vd: チェック対象項目 xuống dòng)
      } else if (lastMetaLabel && !tableHeader && !isSectionTitle(fe) && v) {
        // Dòng 1 ô ngay sau meta (vd: 画面遷移 xuống dòng) -> sub-bullet nối tiếp.
        if (out.length > 0 && out[out.length - 1] === '') out.pop()
        out.push(SUB_BULLET + v)
      } else if (META_LABELS.has(fe)) {
        // Ô đơn lẻ trùng tên meta label -> bullet không giá trị
        flushTable()
        out.push('- **' + v + '**', '')
        lastMetaLabel = fe
      } else if (isSectionTitle(fe)) {
        flushTable()
        lastMetaLabel = null
        out.push('### ' + v, '')
      } else {
        flushTable()
        lastMetaLabel = null
        // Dòng 1 ô đứng ngay trên bảng -> coi là tiêu đề của bảng đó
        const nr = grid[i + 1]
        const nnr = grid[i + 2]
        const nfe = nr?.find((x) => x !== '') ?? ''
        const aboveTable = !!nr && isTableHeaderRow(nr, nnr, nfe, nonEmptyCount(nr))
        out.push((aboveTable ? '### ' : '> ') + v, '')
      }
      continue
    }
    if (isMetaRow(r)) {
      flushTable()
      for (const p of parseMetaPairs(r)) {
        let val = p.values.join(' ')
        if (/^\d+$/.test(p.values[0] ?? '') && p.values.length > 1) {
          val = p.values[0] + '. ' + p.values.slice(1).join(' ')
        }
        val = escCell(val, opts.multiline)
        if (p.label === lastMetaLabel && val) {
          out.push(SUB_BULLET + val)
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
        if (/^\d+$/.test(vals[0] ?? '') && vals.length > 1) {
          cval = vals[0] + '. ' + vals.slice(1).join(' ')
        }
        cval = escCell(cval, opts.multiline)
        if (cval) {
          if (out.length > 0 && out[out.length - 1] === '') out.pop()
          out.push(SUB_BULLET + cval)
        }
        continue
      }
    }
    if (tableHeader) {
      if (isHeaderGhost(r, tableHeader)) {
        continue
      }
      if (HEADER_LABELS.has(fe)) {
        flushTable()
        tableHeader = r.slice()
        tableRows = []
      } else {
        tableRows.push(r)
      }
      continue
    }
    // Nhận diện dòng tiêu đề bảng khi chưa mở bảng
    const next = grid[i + 1]
    const looksHeader = isTableHeaderRow(r, next, fe, n)
    if (looksHeader) {
      tableHeader = r.slice()
      tableRows = []
      lastMetaLabel = null
      continue
    }
    lastMetaLabel = null
    out.push(
      escCell(
        r.filter((v) => v !== '').join(' '),
        opts.multiline
      ),
      ''
    )
  }
  flushTable()
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}

/** Liệt kê sheet của file Excel kèm số dòng và cờ ẩn. Ném lỗi nếu file không đọc được. */
export function listSheets(
  filePath: string,
  skipDelSheets: boolean
): { name: string; rows: number; hidden: boolean }[] {
  const wb = XLSX.readFile(filePath, { cellDates: false, sheetRows: 0 })
  return wb.SheetNames.filter((sn) => !(skipDelSheets && /^DEL_/i.test(sn))).map((sn) => {
    const ref = effectiveRange(wb.Sheets[sn])
    const rows = ref ? ref.e.r - ref.s.r + 1 : 0
    const hidden = wb.Workbook?.Sheets?.[wb.SheetNames.indexOf(sn)]?.Hidden === 1
    return { name: sn, rows, hidden }
  })
}

/** Convert một sheet theo tên. Ném lỗi nếu không tìm thấy sheet. */
export function convertSheet(filePath: string, sheetName: string, opts: ConvertOptions): string {
  const wb = XLSX.readFile(filePath, { cellDates: false })
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error('Không tìm thấy sheet: ' + sheetName)
  return sheetToMarkdown(ws, sheetName, opts)
}

/** Convert nhiều sheet của một workbook. Bỏ qua sheet không tồn tại;
 * bỏ sheet rỗng nếu opts.skipEmptySheets. */
export function convertWorkbook(
  filePath: string,
  sheetNames: string[],
  opts: ConvertOptions
): SheetResult[] {
  const wb = XLSX.readFile(filePath, { cellDates: false })
  const results: SheetResult[] = []
  for (const sn of sheetNames) {
    const ws = wb.Sheets[sn]
    if (!ws) continue
    const md = sheetToMarkdown(ws, sn, opts)
    if (opts.skipEmptySheets && md.trim() === '') continue
    results.push({ sheet: sn, markdown: md })
  }
  return results
}

/** Gộp markdown các sheet cho per-workbook mode: bỏ sheet rỗng để không
 * tạo separator `---` thừa giữa các khoảng trống. */
export function joinWorkbookMarkdown(base: string, sheets: SheetResult[]): string {
  const parts = sheets.map((s) => s.markdown.trim()).filter((m) => m !== '')
  return '# ' + base + '\n\n' + parts.join('\n\n---\n\n') + '\n'
}

/** Tên file an toàn trên Windows: thay ký tự cấm, cắt ngắn, bỏ dấu chấm /
 * khoảng trắng ở cuối (Windows cấm tên kết thúc bằng chúng). */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Tên file an toàn trên Windows: thay ký tự cấm bằng `_`, cắt ngắn,
 * bỏ dấu chấm/khoảng trắng ở cuối, prefix `_` cho tên reserved (CON, NUL...).
 * Trả về 'sheet' nếu rỗng sau khi làm sạch. */
export function safeFileName(name: string, maxLen = 80): string {
  let cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, maxLen).replace(/[. ]+$/, '')
  if (WINDOWS_RESERVED.test(cleaned.split('.')[0])) cleaned = '_' + cleaned
  return cleaned.slice(0, maxLen) || 'sheet'
}

/** Trả về tên file chưa dùng: nếu `wanted` đã có trong `used` thì thêm hậu tố
 * ` (2)`, ` (3)`... Tên được chọn sẽ được thêm vào `used`. */
export function dedupeFileName(wanted: string, used: Set<string>): string {
  if (!used.has(wanted)) {
    used.add(wanted)
    return wanted
  }
  const dot = wanted.lastIndexOf('.')
  const stem = dot >= 0 ? wanted.slice(0, dot) : wanted
  const ext = dot >= 0 ? wanted.slice(dot) : ''
  let n = 2
  while (used.has(stem + ' (' + n + ')' + ext)) n++
  const name = stem + ' (' + n + ')' + ext
  used.add(name)
  return name
}
