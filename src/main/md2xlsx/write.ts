// Ghi mô hình sheet/block thành workbook .xlsx theo bố cục đã duyệt (spec §5, §6).
// exceljs chỉ dùng để GHI; không bao giờ đọc file từ bên ngoài bằng exceljs.
// File này nạp exceljs nên chỉ được import động trong worker, không import từ main process.
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { promises as fsp } from 'node:fs'
import { PARTIAL_SUFFIX } from '../workerProtocol'
import { toCellValue } from './cellValue'
import { displayWidth, estimateLines, splitByLines } from './layout'
import type { Block, SheetModel, XCell } from './model'

// ---- Hằng số bố cục (Global Constraints) ----
const FONT_NAME = '游ゴシック'
const CODE_FONT_NAME = 'MS Gothic'
const FONT_SIZE = 10

const COLOR_HEADER_FILL = 'FFDDE5F0'
const COLOR_LABEL_FILL = 'FFF2F2F2'
const COLOR_BORDER = 'FF808080'
const COLOR_HEADING = 'FF1F3864'
const COLOR_MUTED = 'FF595959'
const COLOR_LINK = 'FF0563C1'

/** Chiều cao một dòng chữ (pt): đo bằng Excel thật, 游ゴシック 10 tự giãn đúng 16.5pt mỗi dòng. */
export const LINE_HEIGHT = 16.5
/** Chiều cao hàng banner (pt). */
const BANNER_HEIGHT = 24
/** Excel không chấp nhận hàng cao hơn 409.5pt. */
export const MAX_ROW_HEIGHT = 409.5
/** Số dòng chữ tối đa trong một hàng (24 dòng = 396pt). */
const MAX_LINES_PER_ROW = Math.floor(MAX_ROW_HEIGHT / LINE_HEIGHT)
/** Bề rộng tối thiểu (số cột) của vùng merge, kể cả khi sheet không có bảng nào rộng như vậy. */
const MIN_SPAN = 4
/** Độ rộng cột tối thiểu / tối đa / phần cộng thêm quanh chữ. */
const MIN_COL_WIDTH = 6
const MAX_COL_WIDTH = 60
const COL_PADDING = 2
/**
 * Độ rộng Excel hiển thị cho cột không có dữ liệu. Cột này giữ mặc định của exceljs (exceljs coi
 * độ rộng 9 là mặc định và không ghi `<col>`), nên lúc hiển thị Excel dùng 8.43 (font Normal Calibri 11).
 * Dùng đúng 8.43 khi tính chiều cao hàng merge để ước lượng không bị thiếu dòng.
 */
const DEFAULT_COL_WIDTH = 8.43
/** exceljs coi độ rộng đúng 9 là mặc định và không ghi `<col>` (Column.isCustomWidth) -> Excel hiện cột mặc định. */
const EXCELJS_DEFAULT_WIDTH = 9
/** Ô Excel chứa tối đa 32 767 ký tự. */
const MAX_CELL_CHARS = 32767

/** exceljs đã tự bỏ C0 (trừ tab/LF/CR) và DEL khi mã hóa XML nhưng KHÔNG bỏ U+FFFE/U+FFFF — đều cấm trong XML 1.0. */
const XML_INVALID_RE = /[\uFFFE\uFFFF]/g

/** Bỏ ký tự cấm của XML 1.0 để Excel không đòi sửa file. */
function clean(text: string): string {
  return text.replace(XML_INVALID_RE, '')
}

/** Chữ ghi vào ô: bỏ ký tự cấm, cắt còn 32 767 ký tự (ký tự cuối là `…`) nếu dài hơn. */
function cellText(text: string): string {
  const t = clean(text)
  if (t.length <= MAX_CELL_CHARS) return t
  let cut = t.slice(0, MAX_CELL_CHARS - 1)
  // Không để lại nửa cặp surrogate ở chỗ cắt.
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return cut + '…'
}

/** Chỉ http/https/mailto thành hyperlink; scheme khác và link nội bộ `#…` ghi chữ thuần. */
function isSafeLink(link: string): boolean {
  return /^(?:https?:|mailto:)/i.test(link)
}

// ---- Style (tạo đối tượng mới mỗi lần để các ô không dùng chung tham chiếu) ----
const font = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT_NAME, size: FONT_SIZE, ...extra })
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const thin = (): Partial<ExcelJS.Border> => ({ style: 'thin', color: { argb: COLOR_BORDER } })
const allBorders = (): Partial<ExcelJS.Borders> => ({ top: thin(), left: thin(), bottom: thin(), right: thin() })
const wrapTop = (): Partial<ExcelJS.Alignment> => ({ wrapText: true, vertical: 'top' })

interface Ctx {
  ws: ExcelJS.Worksheet
  /** Số cột của vùng merge: max(4, số cột của bảng rộng nhất). */
  span: number
  /** Độ rộng đã đặt cho từng cột (chỉ số 0 = cột A); `undefined` = cột giữ mặc định (không có dữ liệu, hoặc tính ra đúng 9). */
  widths: (number | undefined)[]
}

/** Tổng độ rộng các cột `from..to` (đánh số từ 1, gồm cả hai đầu). */
function sumWidths(ctx: Ctx, from: number, to: number): number {
  let sum = 0
  for (let c = from; c <= to; c++) sum += ctx.widths[c - 1] ?? DEFAULT_COL_WIDTH
  return sum
}

/** Số cột thật của bảng (header hoặc hàng dài nhất). */
function tableColumns(block: Extract<Block, { kind: 'table' }>): number {
  let cols = block.header.length
  for (const row of block.rows) if (row.length > cols) cols = row.length
  return cols
}

/** Tính độ rộng cột của sheet và `span`. Cột không có dữ liệu không được đặt độ rộng (giữ mặc định). */
function computeLayout(blocks: Block[]): { span: number; widths: (number | undefined)[] } {
  const widest: number[] = []
  const touch = (col0: number, text: string) => {
    widest[col0] = Math.max(widest[col0] ?? 0, displayWidth(text))
  }
  let maxCols = 0
  for (const block of blocks) {
    if (block.kind === 'banner') {
      // Nhãn banner nằm ở cột A và cột B luôn có tiêu đề nên không tràn sang được: phải đủ rộng.
      touch(0, block.label)
    } else if (block.kind === 'table') {
      const cols = tableColumns(block)
      maxCols = Math.max(maxCols, cols)
      for (let c = 0; c < cols; c++) touch(c, block.header[c]?.text ?? '')
      for (const row of block.rows) for (let c = 0; c < cols; c++) touch(c, row[c]?.text ?? '')
    } else if (block.kind === 'meta') {
      for (const item of block.items) touch(0, item.label)
    }
  }
  const span = Math.max(MIN_SPAN, maxCols)
  const widths: (number | undefined)[] = []
  for (let c = 0; c < span; c++) {
    const w = widest[c]
    const width = w === undefined ? undefined : Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, w + COL_PADDING))
    // Độ rộng 9 exceljs không ghi ra file: coi như cột mặc định để ước lượng chiều cao theo đúng cột Excel hiện.
    widths[c] = width === EXCELJS_DEFAULT_WIDTH ? undefined : width
  }
  return { span, widths }
}

/** Ghi giá trị của một XCell: số/format theo toCellValue, link thành hyperlink có font link. */
function setCellContent(cell: ExcelJS.Cell, x: XCell, baseFont: Partial<ExcelJS.Font>): void {
  if (x.link !== undefined && isSafeLink(x.link)) {
    cell.value = { text: cellText(x.text), hyperlink: clean(x.link) }
    cell.font = { ...baseFont, underline: true, color: { argb: COLOR_LINK } }
    return
  }
  cell.font = baseFont
  if (x.text === '') return
  const { value, numFmt } = toCellValue(x.text)
  cell.value = typeof value === 'string' ? cellText(value) : value
  if (numFmt) cell.numFmt = numFmt
}

/** Đặt chiều cao hàng theo số dòng (không vượt mức tối đa của Excel; ô value của meta bị kẹp ở đây). */
function setRowHeight(ws: ExcelJS.Worksheet, row: number, lines: number): void {
  ws.getRow(row).height = Math.min(MAX_ROW_HEIGHT, LINE_HEIGHT * lines)
}

// ---- Ghi từng loại block; mỗi hàm trả về số hàng đã dùng ----

function writeBanner(ctx: Ctx, block: Extract<Block, { kind: 'banner' }>, row: number): number {
  const { ws } = ctx
  const label = ws.getCell(row, 1)
  if (block.label !== '') label.value = cellText(block.label)
  label.font = font({ bold: true, color: { argb: COLOR_MUTED } })
  label.alignment = { vertical: 'top' }
  const title = ws.getCell(row, 2)
  if (block.title !== '') title.value = cellText(block.title)
  title.font = font({ bold: true, size: 16 })
  title.alignment = { vertical: 'top' }
  ws.getRow(row).height = BANNER_HEIGHT
  return 1
}

function writeTable(ctx: Ctx, block: Extract<Block, { kind: 'table' }>, row: number): number {
  const { ws } = ctx
  const cols = tableColumns(block)
  if (cols === 0) return 0
  const put = (r: number, c: number, x: XCell | undefined, header: boolean) => {
    const cell = ws.getCell(r, c + 1)
    setCellContent(cell, x ?? { text: '' }, font(header ? { bold: true } : {}))
    cell.border = allBorders()
    cell.alignment = wrapTop()
    if (header) cell.fill = fill(COLOR_HEADER_FILL)
  }
  for (let c = 0; c < cols; c++) put(row, c, block.header[c], true)
  block.rows.forEach((cells, i) => {
    for (let c = 0; c < cols; c++) put(row + 1 + i, c, cells[c], false)
  })
  return 1 + block.rows.length
}

function writeMeta(ctx: Ctx, block: Extract<Block, { kind: 'meta' }>, row: number): number {
  const { ws, span } = ctx
  const labelWidth = sumWidths(ctx, 1, 1)
  const valueWidth = sumWidths(ctx, 2, span)
  block.items.forEach((item, i) => {
    const r = row + i
    const label = ws.getCell(r, 1)
    if (item.label !== '') label.value = cellText(item.label)
    label.font = font({ bold: true })
    label.fill = fill(COLOR_LABEL_FILL)
    label.border = allBorders()
    label.alignment = wrapTop()

    const value = ws.getCell(r, 2)
    setCellContent(value, item.value, font())
    // Viền mọi ô trong vùng merge; ô phụ lấy style của ô chính khi merge. Căn trái: value là số (vd `1.0`)
    // mặc định Excel căn phải, bị đẩy sang tận mép phải vùng merge.
    for (let c = 2; c <= span; c++) {
      const cell = ws.getCell(r, c)
      cell.border = allBorders()
      cell.alignment = { ...wrapTop(), horizontal: 'left' }
    }
    ws.mergeCells(r, 2, r, span)
    // Excel không tự giãn chiều cao ô merge: dòng thật + dòng do chữ tự xuống dòng. Value 1 dòng thì để Excel tự
    // giãn hàng (theo ô nhãn); đã đặt chiều cao thì phải đủ cho cả ô nhãn tự xuống dòng ở cột A.
    const lines = estimateLines(item.value.text, valueWidth)
    if (lines > 1) setRowHeight(ws, r, Math.max(lines, estimateLines(item.label, labelWidth)))
  })
  return block.items.length
}

function writeHeading(ctx: Ctx, block: Extract<Block, { kind: 'heading' }>, row: number): number {
  const cell = ctx.ws.getCell(row, 1)
  if (block.text !== '') cell.value = cellText(block.text)
  cell.font = font({ bold: true, size: 12, color: { argb: COLOR_HEADING } })
  cell.border = { bottom: { style: 'medium', color: { argb: COLOR_HEADING } } }
  cell.alignment = { vertical: 'top' }
  return 1
}

/**
 * Đoạn văn / ghi chú: merge A..span, tự xuống dòng, không viền, chiều cao do app tính.
 * Nếu cao hơn một hàng Excel cho phép (409.5pt) thì tách thành các hàng merge liền nhau,
 * không để chữ bị che; không có hàng trống giữa các mảnh.
 */
function writeText(ctx: Ctx, text: string, muted: boolean, row: number): number {
  const { ws, span } = ctx
  const width = sumWidths(ctx, 1, span)
  const pieces = splitByLines(text, width, MAX_LINES_PER_ROW, MAX_CELL_CHARS)
  pieces.forEach((piece, i) => {
    const r = row + i
    const cell = ws.getCell(r, 1)
    if (piece !== '') cell.value = cellText(piece)
    cell.font = font(muted ? { color: { argb: COLOR_MUTED } } : {})
    cell.alignment = wrapTop()
    ws.mergeCells(r, 1, r, span)
    setRowHeight(ws, r, estimateLines(piece, width))
  })
  return pieces.length
}

function writeCode(ctx: Ctx, block: Extract<Block, { kind: 'code' }>, row: number): number {
  block.lines.forEach((line, i) => {
    const cell = ctx.ws.getCell(row + i, 1)
    if (line !== '') cell.value = cellText(line)
    cell.font = font({ name: CODE_FONT_NAME })
    cell.alignment = { vertical: 'top' }
  })
  return block.lines.length
}

function writeBlock(ctx: Ctx, block: Block, row: number): number {
  switch (block.kind) {
    case 'banner':
      return writeBanner(ctx, block, row)
    case 'table':
      return writeTable(ctx, block, row)
    case 'meta':
      return writeMeta(ctx, block, row)
    case 'heading':
      return writeHeading(ctx, block, row)
    case 'note':
      return writeText(ctx, block.text, true, row)
    case 'paragraph':
      return writeText(ctx, block.text, false, row)
    case 'code':
      return writeCode(ctx, block, row)
  }
}

/** Dựng workbook từ các sheet đã có tên hợp lệ/duy nhất (không sanitize lại ở đây). */
export function buildWorkbook(sheets: SheetModel[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    })
    const { span, widths } = computeLayout(sheet.blocks)
    // Đặt độ rộng cột TRƯỚC khi tính chiều cao hàng merge (chiều cao phụ thuộc tổng độ rộng).
    // Cột không có dữ liệu giữ mặc định: không đặt, chỉ dùng DEFAULT_COL_WIDTH khi ước lượng.
    widths.forEach((w, i) => {
      if (w !== undefined) ws.getColumn(i + 1).width = w
    })
    const ctx: Ctx = { ws, span, widths }

    let row = 1
    for (const block of sheet.blocks) {
      const used = writeBlock(ctx, block, row)
      // Khối rỗng không để lại gì (kể cả hàng trống), tránh khoảng cách thừa.
      if (used === 0) continue
      row += used
      // Sau mọi block để 1 hàng trống, trừ heading (đi liền với nội dung bên dưới).
      if (block.kind !== 'heading') row += 1
    }
  }
  return wb
}

// ---- Ghi file an toàn ----

const IGNORED_ERRORS =
  '<ignoredErrors><ignoredError sqref="A1:XFD1048576" numberStoredAsText="1"/></ignoredErrors>'

/** Các phần tử đứng SAU ignoredErrors trong CT_Worksheet (khớp tiền tố: gồm cả legacyDrawingHF, drawingHF). */
const AFTER_IGNORED_ERRORS_RE =
  /<(?:smartTags|drawing|legacyDrawing|picture|oleObjects|controls|webPublishItems|tableParts|extLst)/

/**
 * Chèn `ignoredErrors` (bỏ tam giác xanh "số lưu dạng chữ") vào XML của một sheet.
 * Thứ tự phần tử theo schema CT_Worksheet là bắt buộc — sai vị trí Excel sẽ đòi sửa file:
 * ngay trước phần tử đầu tiên trong nhóm bên trên, không có thì trước `</worksheet>`.
 */
export function injectIgnoredErrors(xml: string): string {
  // Chỉ tìm phía sau sheetData để chữ trong ô không bị nhầm là phần tử của sheet.
  let from = xml.indexOf('</sheetData>')
  if (from < 0) from = Math.max(0, xml.indexOf('<sheetData/>'))
  const m = AFTER_IGNORED_ERRORS_RE.exec(xml.slice(from))
  const at = m ? from + m.index : xml.lastIndexOf('</worksheet>')
  if (at < 0) return xml
  return xml.slice(0, at) + IGNORED_ERRORS + xml.slice(at)
}

/**
 * Ghi workbook ra `outPath` an toàn: ghi `outPath + PARTIAL_SUFFIX` rồi đổi tên, nên file cũ
 * không bao giờ bị hỏng nửa chừng. Lỗi → xóa file tạm và ném lại đúng lỗi gốc.
 */
export async function saveWorkbook(
  wb: ExcelJS.Workbook,
  outPath: string,
  deps: { rename?: (from: string, to: string) => Promise<void> } = {}
): Promise<void> {
  const partial = outPath + PARTIAL_SUFFIX
  try {
    const raw = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    const zip = await JSZip.loadAsync(raw)
    for (const file of zip.file(/^xl\/worksheets\/sheet\d+\.xml$/)) {
      zip.file(file.name, injectIgnoredErrors(await file.async('string')))
    }
    const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    await fsp.writeFile(partial, out)
    await (deps.rename ?? fsp.rename)(partial, outPath)
  } catch (err) {
    // Dọn file tạm; lỗi dọn không được che mất lỗi gốc.
    await fsp.rm(partial, { force: true }).catch(() => undefined)
    throw err
  }
}
