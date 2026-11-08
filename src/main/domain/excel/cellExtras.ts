/* Thông tin của ô mà SheetJS bản community không đưa vào worksheet:
 * - gạch ngang cả ô (見え消し): font của style ô có `<strike/>` (xl/styles.xml + thuộc tính `s` của `<c>`);
 * - danh sách thả xuống (入力規則 type="list"): `<dataValidations>` (cả bản x14 trong extLst);
 * - link nội bộ `#'Sheet'!A1` / tên định nghĩa -> tên sheet đích.
 * Hai mục đầu đọc từ XML gốc trong `wb.files` lúc readWorkbook, TRƯỚC khi bỏ part sheet; chỉ giữ bản gọn
 * (tập địa chỉ ô, danh sách lựa chọn) gắn lên workbook để cache của worker không giữ XML lớn.
 */
import * as XLSX from 'xlsx'
import { attr, decodeXml, elements, inner, readRels, readText, runsText, type Files } from './drawings'

export interface ListRule {
  /** sqref nguyên văn, vd `C2:C50` hoặc `C2:C50 E2:E9` */
  ref: string
  /** Ô trên-trái của vùng đầu tiên (0-based) */
  row: number
  col: number
  /** Các lựa chọn (rỗng = không giải được, khi đó hiển thị công thức) */
  values: string[]
  formula: string
}

export interface SheetExtras {
  /** Địa chỉ ô (`B3`) có font gạch ngang cả ô */
  struck?: Set<string>
  lists?: ListRule[]
  /** Đích hyperlink nội bộ (`#'Sheet'!A1`, `#TênĐịnhNghĩa`) -> tên sheet; không phải link nội bộ / không giải được -> undefined */
  sheetOf?: (target: string) => string | undefined
}

const EXTRAS = Symbol('x2mCellExtras')
// File không tin cậy: giới hạn lượng XML quét và số kết quả giữ lại
const MAX_SHEET_BYTES = 64 * 1024 * 1024
const MAX_DV_BYTES = 4 * 1024 * 1024
const MAX_STRUCK = 100_000
const MAX_RULES = 1000
const MAX_LIST_VALUES = 100
const MAX_SCAN_CELLS = 10_000

/** Font có gạch ngang: `<strike/>`, `<strike val="1"/>` (không tính `val="0"`/`"false"`). */
export function hasStrike(fontXml: string): boolean {
  const m = /<(?:\w+:)?strike\b[^>]{0,200}>/.exec(fontXml)
  const v = m ? attr(m[0], 'val') : '0'
  return v !== '0' && v !== 'false'
}

/** Chỉ số cellXfs có font gạch ngang. */
function struckStyles(styles: string): Set<number> {
  const fonts = elements(inner(styles, 'fonts') ?? '', 'font').map(hasStrike)
  const out = new Set<number>()
  elements(inner(styles, 'cellXfs') ?? '', 'xf').forEach((xf, i) => {
    if (fonts[Number(attr(xf.slice(0, xf.indexOf('>') + 1), 'fontId') ?? 0)]) out.add(i)
  })
  return out
}

/** Ô có giá trị (không tự đóng) mang style gạch ngang.
 * shortcut: bỏ qua ô thiếu thuộc tính `r` (Excel luôn ghi), thêm khi gặp file thật cần. */
function struckCells(xml: string, styles: Set<number>): Set<string> {
  const out = new Set<string>()
  const re = /<(?:\w+:)?c\s[^>]{0,1000}>/g
  for (let m = re.exec(xml); m && out.size < MAX_STRUCK; m = re.exec(xml)) {
    if (m[0].endsWith('/>')) continue
    const s = /\ss="(\d+)"/.exec(m[0])?.[1]
    const r = /\sr="([A-Z]{1,3}\d{1,7})"/.exec(m[0])?.[1]
    if (s && r && styles.has(Number(s))) out.add(r)
  }
  return out
}

/** Tham chiếu `Sheet!$A$1:$B$2` / `'Tên sheet'!A1` / `A1:A5` / tên định nghĩa -> sheet + vùng (bỏ `$`).
 * `sheet`: sheet mặc định khi tham chiếu không ghi sheet (undefined = bắt buộc có sheet). */
export function refTarget(wb: XLSX.WorkBook, s: string, sheet?: string): { sheet: string; range: string } | undefined {
  let t = s.trim().replace(/^=/, '')
  const idx = sheet === undefined ? -1 : wb.SheetNames.indexOf(sheet)
  const names = (wb.Workbook?.Names ?? []).filter((n) => n.Name.toLowerCase() === t.toLowerCase())
  const name = names.find((n) => n.Sheet === idx) ?? names.find((n) => n.Sheet == null)
  if (name) t = name.Ref
  const m = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.*)$/.exec(t)
  const sh = m ? (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]) : name ? undefined : sheet
  if (!sh || !wb.Sheets[sh]) return undefined
  return { sheet: sh, range: (m ? m[3] : t).replace(/\$/g, '') }
}

/** Giá trị của vùng ô (theo thứ tự hàng, bỏ ô rỗng), tối đa MAX_LIST_VALUES. */
function rangeValues(wb: XLSX.WorkBook, sheet: string, range: string): string[] {
  // Cả cột (`$A:$A`, cách hay dùng cho list master) -> A1:A1048576; phần dưới chỉ quét tới dòng có dữ liệu
  range = range.replace(/^([A-Z]{1,3}):([A-Z]{1,3})$/i, '$11:$21048576')
  if (!/^[A-Z]{1,3}\d{1,7}(:[A-Z]{1,3}\d{1,7})?$/i.test(range)) return []
  const ws = wb.Sheets[sheet]
  if (!ws) return []
  const r = XLSX.utils.decode_range(range.toUpperCase())
  const decl = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null
  // Vùng kiểu A1:A1048576: chỉ quét phần có dữ liệu
  const er = decl ? Math.min(r.e.r, decl.e.r) : r.e.r
  const ec = decl ? Math.min(r.e.c, decl.e.c) : r.e.c
  const out: string[] = []
  let scanned = 0
  for (let row = r.s.r; row <= er; row++) {
    for (let c = r.s.c; c <= ec; c++) {
      if (out.length >= MAX_LIST_VALUES || ++scanned > MAX_SCAN_CELLS) return out
      const cell = ws[XLSX.utils.encode_cell({ r: row, c })] as XLSX.CellObject | undefined
      const v = cell ? XLSX.utils.format_cell(cell).trim() : ''
      if (v) out.push(v)
    }
  }
  return out
}

/** Các 入力規則 type="list" của một sheet. `xml` là đoạn XML chứa `<dataValidation>` (thường bản cuối sheet). */
export function listRules(xml: string, wb: XLSX.WorkBook, sheet: string): ListRule[] {
  const out: ListRule[] = []
  for (const dv of elements(xml, 'dataValidation', MAX_RULES)) {
    const open = dv.slice(0, dv.indexOf('>') + 1)
    if (attr(open, 'type') !== 'list') continue
    // x14 (Excel 2010+, thường dùng khi tham chiếu sheet khác): sqref và công thức nằm trong phần tử con
    const ref = (attr(open, 'sqref') ?? decodeXml(inner(dv, 'sqref') ?? '')).trim()
    const f1 = inner(dv, 'formula1') ?? ''
    const formula = decodeXml(inner(f1, 'f') ?? f1).trim()
    const first = /^([A-Z]{1,3}\d{1,7})/i.exec(ref.replace(/\$/g, ''))
    if (!first || !formula) continue
    const { r, c } = XLSX.utils.decode_cell(first[1].toUpperCase())
    let values: string[]
    if (formula.startsWith('"')) {
      values = formula.replace(/^"|"$/g, '').split(',').map((v) => v.trim()).filter((v) => v !== '').slice(0, MAX_LIST_VALUES)
    } else {
      const t = refTarget(wb, formula, sheet)
      values = t ? rangeValues(wb, t.sheet, t.range) : []
    }
    out.push({ ref, row: r, col: c, values, formula })
  }
  return out
}

/** Đọc gạch ngang + 入力規則 của mọi sheet từ `wb.files` và gắn bản gọn lên workbook. Gọi trước khi bỏ part sheet. */
export function attachCellExtras(wb: XLSX.WorkBook): void {
  const files = (wb as { files?: Files }).files
  if (!files) return
  const rels = readRels(files, 'xl/workbook.xml')
  const stylesPath = [...rels.values()].find((x) => x.type.endsWith('/styles'))?.path ?? 'xl/styles.xml'
  const styles = readText(files, stylesPath)
  const struckXf = styles ? struckStyles(styles) : new Set<number>()
  const out = new Map<string, SheetExtras>()
  wb.SheetNames.forEach((sn, i) => {
    const rid = (wb.Workbook?.Sheets?.[i] as { id?: string } | undefined)?.id
    const path = rid ? rels.get(rid)?.path : undefined
    const c = path ? files[path]?.content : undefined
    if (!c) return
    const buf = Buffer.from(c.buffer, c.byteOffset, c.byteLength)
    // shortcut: sheet XML > 64MB thì bỏ qua gạch ngang cả ô (đọc phần đầu), nâng khi gặp file thật
    const struck = struckXf.size > 0 ? struckCells(buf.toString('utf8', 0, MAX_SHEET_BYTES), struckXf) : new Set<string>()
    const at = buf.indexOf('dataValidation')
    const from = at < 0 ? -1 : Math.max(0, buf.lastIndexOf('<', at))
    const lists = from < 0 ? [] : listRules(buf.toString('utf8', from, from + MAX_DV_BYTES), wb, sn)
    if (struck.size > 0 || lists.length > 0) out.set(sn, { struck, lists })
  })
  Object.defineProperty(wb, EXTRAS, { value: out })
}

/** Thông tin thêm của một sheet cho converter (workbook không qua readWorkbook / file .xls: chỉ có link nội bộ). */
export function sheetExtras(wb: XLSX.WorkBook, sheetName: string): SheetExtras {
  const x = (wb as { [EXTRAS]?: Map<string, SheetExtras> })[EXTRAS]?.get(sheetName)
  return { ...x, sheetOf: (t) => (t.startsWith('#') ? refTarget(wb, t.slice(1))?.sheet : undefined) }
}

/** Các run của rich text (`cell.r` của SheetJS là XML `<r>` gốc) kèm cờ gạch ngang. */
export const richRuns = (xml: string): { text: string; strike: boolean }[] =>
  elements(xml, 'r').map((run) => ({ text: runsText(run), strike: hasStrike(inner(run, 'rPr') ?? '') }))
