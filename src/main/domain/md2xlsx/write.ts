// Ghi mô hình sheet/block thành workbook .xlsx theo bố cục đã duyệt (spec §5, §6).
// exceljs chỉ dùng để GHI; không bao giờ đọc file từ bên ngoài bằng exceljs.
// File này nạp exceljs nên chỉ được import động trong worker, không import từ main process.
import ExcelJS from 'exceljs'
import { toCellValue } from './cellValue'
import { displayWidth, estimateLines, splitByLines } from './layout'
import type { Block, Run, SheetModel, XCell } from './model'

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
/** Heading 游ゴシック 12 đậm: Excel AutoFit đúng 19.5pt mỗi dòng (đo 1–21 dòng, 21 dòng = 409.5pt). */
const HEADING_LINE_HEIGHT = 19.5
/**
 * Code MS Gothic 10: Excel AutoFit 12pt mỗi dòng, cộng 1.5pt khi ô có xuống dòng thật (đo: n dòng tự xuống = 12n,
 * n dòng thật = 12n + 1.5, n = 2–30), và không thấp hơn 15pt (chiều cao mặc định của hàng, font Normal Calibri 11).
 */
const CODE_LINE_HEIGHT = 12
const CODE_EXTRA_HEIGHT = 1.5
const CODE_MIN_HEIGHT = 15
/** Chiều cao hàng banner (pt). */
const BANNER_HEIGHT = 24
/** Excel không chấp nhận hàng cao hơn 409.5pt. */
export const MAX_ROW_HEIGHT = 409.5
/** Số dòng chữ tối đa trong một hàng (24 dòng = 396pt). */
const MAX_LINES_PER_ROW = Math.floor(MAX_ROW_HEIGHT / LINE_HEIGHT)
/** Heading: tối đa 21 dòng (409.5pt) mỗi hàng. */
const MAX_HEADING_LINES_PER_ROW = Math.floor(MAX_ROW_HEIGHT / HEADING_LINE_HEIGHT)
/** Code: tối đa 34 dòng (12 × 34 + 1.5 = 409.5pt) mỗi hàng. */
const MAX_CODE_LINES_PER_ROW = Math.floor((MAX_ROW_HEIGHT - CODE_EXTRA_HEIGHT) / CODE_LINE_HEIGHT)
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
/** Excel có tối đa 16 384 cột (XFD): bảng rộng hơn bị cắt bớt cột thay vì exceljs ném lỗi. */
const MAX_COLUMNS = 16384
/** Ảnh rộng hơn thì thu nhỏ (giữ tỉ lệ) để không kéo vùng in quá rộng. */
const MAX_IMAGE_WIDTH_PX = 800
/** Hàng mặc định cao 15pt = 20px (96 DPI): số hàng dành cho ảnh = chiều cao ảnh / 20. */
const DEFAULT_ROW_HEIGHT = 15
const DEFAULT_ROW_PX = 20

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

/**
 * http/https/mailto, và link nội bộ đã giải (`'Sheet'!A1`, do nameAndLinkSheets) thành hyperlink; scheme khác và
 * link nội bộ chưa giải (`#slug`, `x.md`) ghi chữ thuần.
 */
function isSafeLink(link: string): boolean {
  return /^(?:https?:|mailto:)/i.test(link) || INTERNAL_LINK_RE.test(link)
}
/** Dạng exceljs ghi thành hyperlink nội bộ (`location`); xlsxWriter bỏ quan hệ External thừa exceljs ghi kèm. */
const INTERNAL_LINK_RE = /^'(?:[^']|'')+'![A-Z]+\d+$/

// ---- Style (tạo đối tượng mới mỗi lần để các ô không dùng chung tham chiếu) ----
const font = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT_NAME, size: FONT_SIZE, ...extra })
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const thin = (): Partial<ExcelJS.Border> => ({ style: 'thin', color: { argb: COLOR_BORDER } })
const allBorders = (): Partial<ExcelJS.Borders> => ({ top: thin(), left: thin(), bottom: thin(), right: thin() })
const wrapTop = (): Partial<ExcelJS.Alignment> => ({ wrapText: true, vertical: 'top' })

interface Ctx {
  wb: ExcelJS.Workbook
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
  return Math.min(cols, MAX_COLUMNS)
}

/**
 * Merge hàng `row` cột `from..to` không qua ws.mergeCells: hàm đó so với MỌI vùng merge đã có (O(n²), 100 000 dòng
 * code treo hàng giờ). Vùng của ta không bao giờ chồng nhau; exceljs ghi `<mergeCells>` từ ô kiểu Merge nên kết quả
 * như mergeCells (ô phụ lấy style của ô chính).
 */
function merge(ws: ExcelJS.Worksheet, row: number, from: number, to: number): void {
  const master = ws.getCell(row, from)
  for (let c = from + 1; c <= to; c++) ws.getCell(row, c).merge(master)
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

/** Font của một run: đậm/nghiêng/gạch ngang cộng vào font nền; code dùng font đơn cách. */
function runFont(base: Partial<ExcelJS.Font>, r: Omit<Run, 'text'>): Partial<ExcelJS.Font> {
  const f: Partial<ExcelJS.Font> = { ...base }
  if (r.bold) f.bold = true
  if (r.italic) f.italic = true
  if (r.strike) f.strike = true
  if (r.code) f.name = CODE_FONT_NAME
  return f
}

/** Định dạng chung nếu mọi run có chữ (bỏ run chỉ khoảng trắng) cùng định dạng; khác nhau -> null (cần rich text). */
function uniformStyle(runs: Run[]): Omit<Run, 'text'> | null {
  const sig = runs.filter((r) => r.text.trim() !== '')
  const s = sig[0] ?? {}
  const same = (r: Run) => !r.bold === !s.bold && !r.italic === !s.italic && !r.strike === !s.strike && !r.code === !s.code
  return sig.every(same) ? s : null
}

/**
 * Ghi giá trị của một XCell: số/format theo toCellValue, link thành hyperlink có font link, `note` thành ghi chú Excel.
 * Định dạng inline: cả ô cùng một định dạng -> font của ô (giá trị vẫn qua toCellValue, `**10**` vẫn là số); nhiều
 * định dạng -> rich text (chữ thuần).
 */
function setCellContent(cell: ExcelJS.Cell, x: XCell, baseFont: Partial<ExcelJS.Font>): void {
  if (x.note !== undefined && x.note.trim() !== '') cell.note = cellText(x.note)
  if (x.link !== undefined && isSafeLink(x.link)) {
    cell.value = { text: cellText(x.text), hyperlink: clean(x.link) }
    cell.font = { ...baseFont, underline: true, color: { argb: COLOR_LINK } }
    return
  }
  const uniform = x.runs ? uniformStyle(x.runs) : {}
  cell.font = uniform ? runFont(baseFont, uniform) : baseFont
  if (x.text === '') return
  // shortcut: rich text dài quá giới hạn ô ghi chữ thuần đã cắt (không cắt từng run)
  if (!uniform && x.runs && x.text.length <= MAX_CELL_CHARS) {
    cell.value = { richText: x.runs.map((r) => ({ text: clean(r.text), font: runFont(baseFont, r) })) }
    return
  }
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
    // Căn ngang theo dòng phân cách `:---:` / `---:` / `:---` (cả header, như GFM)
    const horizontal = block.align?.[c]
    cell.alignment = horizontal ? { ...wrapTop(), horizontal } : wrapTop()
    if (header) cell.fill = fill(COLOR_HEADER_FILL)
  }
  for (let c = 0; c < cols; c++) put(row, c, block.header[c], true)
  block.rows.forEach((cells, i) => {
    for (let c = 0; c < cols; c++) put(row + 1 + i, c, cells[c], false)
  })
  // Danh sách thả xuống trên mọi hàng dữ liệu của cột (exceljs gộp các ô liền nhau thành một sqref)
  for (const v of block.validations ?? []) {
    if (v.col >= cols) continue
    const formulae = ['"' + v.values.map(clean).join(',') + '"']
    for (let i = 0; i < block.rows.length; i++) {
      ws.getCell(row + 1 + i, v.col + 1).dataValidation = { type: 'list', allowBlank: true, formulae }
    }
  }
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
    merge(ws, r, 2, span)
    // Excel không tự giãn chiều cao ô merge: dòng thật + dòng do chữ tự xuống dòng. Value 1 dòng thì để Excel tự
    // giãn hàng (theo ô nhãn); đã đặt chiều cao thì phải đủ cho cả ô nhãn tự xuống dòng ở cột A.
    // Có chữ đậm (rich text / cả ô đậm): ước lượng theo glyph đậm (rộng hơn) để không thiếu dòng
    const lines = estimateLines(item.value.text, valueWidth, item.value.runs?.some((x) => x.bold) ? 'bold' : 'body')
    if (lines > 1) setRowHeight(ws, r, Math.max(lines, estimateLines(item.label, labelWidth, 'bold')))
  })
  return block.items.length
}

/**
 * Heading: merge A..span (cùng bề rộng như đoạn văn), tự xuống dòng, chiều cao do app tính (19.5pt/dòng), nên
 * heading dài không tràn ra ngoài vùng in. Gạch dưới (viền dưới) trải cả vùng merge: ô phụ lấy style của ô chính khi
 * merge. Cao hơn 409.5pt thì tách thành các hàng merge liền nhau như đoạn văn; chỉ hàng cuối có gạch dưới.
 */
function writeHeading(ctx: Ctx, block: Extract<Block, { kind: 'heading' }>, row: number): number {
  const { ws, span } = ctx
  const width = sumWidths(ctx, 1, span)
  const pieces = splitByLines(block.text, width, MAX_HEADING_LINES_PER_ROW, MAX_CELL_CHARS, 'heading')
  pieces.forEach((piece, i) => {
    const r = row + i
    const cell = ws.getCell(r, 1)
    if (piece !== '') cell.value = cellText(piece)
    cell.font = font({ bold: true, size: 12, color: { argb: COLOR_HEADING } })
    if (i === pieces.length - 1) cell.border = { bottom: { style: 'medium', color: { argb: COLOR_HEADING } } }
    cell.alignment = wrapTop()
    merge(ws, r, 1, span)
    ws.getRow(r).height = Math.min(MAX_ROW_HEIGHT, HEADING_LINE_HEIGHT * estimateLines(piece, width, 'heading'))
  })
  return pieces.length
}

/**
 * Đoạn văn / ghi chú: merge A..span, tự xuống dòng, không viền, chiều cao do app tính.
 * Nếu cao hơn một hàng Excel cho phép (409.5pt) thì tách thành các hàng merge liền nhau,
 * không để chữ bị che; không có hàng trống giữa các mảnh.
 */
function writeText(ctx: Ctx, text: string, muted: boolean, row: number, link?: string): number {
  const { ws, span } = ctx
  const width = sumWidths(ctx, 1, span)
  const pieces = splitByLines(text, width, MAX_LINES_PER_ROW, MAX_CELL_CHARS)
  pieces.forEach((piece, i) => {
    const r = row + i
    const cell = ws.getCell(r, 1)
    // Đoạn có đúng một link (inlineCell): mọi mảnh là hyperlink tới link đó, chữ giữ nguyên
    if (link !== undefined && isSafeLink(link) && piece !== '') {
      cell.value = { text: cellText(piece), hyperlink: clean(link) }
      cell.font = font({ underline: true, color: { argb: COLOR_LINK } })
    } else {
      if (piece !== '') cell.value = cellText(piece)
      cell.font = font(muted ? { color: { argb: COLOR_MUTED } } : {})
    }
    cell.alignment = wrapTop()
    merge(ws, r, 1, span)
    setRowHeight(ws, r, estimateLines(piece, width))
  })
  return pieces.length
}

/**
 * Code: mỗi dòng code một hàng (không gộp các dòng), merge A..span, tự xuống dòng, chiều cao theo bề rộng đơn cách
 * của MS Gothic. Một dòng cao hơn 409.5pt thì tách thành các hàng merge liền nhau (nối lại bằng chuỗi rỗng ra dòng
 * gốc), như đoạn văn.
 */
function writeCode(ctx: Ctx, block: Extract<Block, { kind: 'code' }>, row: number): number {
  const { ws, span } = ctx
  const width = sumWidths(ctx, 1, span)
  let r = row
  for (const line of block.lines) {
    for (const piece of splitByLines(line, width, MAX_CODE_LINES_PER_ROW, MAX_CELL_CHARS, 'code')) {
      const cell = ws.getCell(r, 1)
      if (piece !== '') cell.value = cellText(piece)
      cell.font = font({ name: CODE_FONT_NAME })
      cell.alignment = wrapTop()
      merge(ws, r, 1, span)
      const lines = estimateLines(piece, width, 'code')
      ws.getRow(r).height = Math.min(MAX_ROW_HEIGHT, Math.max(CODE_MIN_HEIGHT, CODE_LINE_HEIGHT * lines + CODE_EXTRA_HEIGHT))
      r++
    }
  }
  return r - row
}

/**
 * Ảnh: đặt ở cột A hàng `row`, kích thước theo pixel của ảnh (thu nhỏ nếu rộng hơn MAX_IMAGE_WIDTH_PX), dành đủ số
 * hàng 15pt bên dưới để khối sau không đè lên ảnh. Chưa đọc được ảnh (adapter không điền `image`) -> ghi chữ alt.
 */
function writeImage(ctx: Ctx, block: Extract<Block, { kind: 'image' }>, row: number): number {
  const img = block.image
  if (!img) return writeText(ctx, block.alt, false, row)
  const scale = Math.min(1, MAX_IMAGE_WIDTH_PX / img.width)
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))
  const id = ctx.wb.addImage({ buffer: img.data as unknown as ExcelJS.Buffer, extension: img.extension })
  ctx.ws.addImage(id, { tl: { col: 0, row: row - 1 }, ext: { width, height }, editAs: 'oneCell' })
  const rows = Math.ceil(height / DEFAULT_ROW_PX)
  for (let r = row; r < row + rows; r++) ctx.ws.getRow(r).height = DEFAULT_ROW_HEIGHT
  return rows
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
      return writeText(ctx, block.text, true, row, block.link)
    case 'paragraph':
      return writeText(ctx, block.text, false, row, block.link)
    case 'image':
      return writeImage(ctx, block, row)
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
    const ctx: Ctx = { wb, ws, span, widths }

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
 * exceljs ghi link nội bộ thành `<hyperlink r:id=… location=…>` KÈM quan hệ External trỏ tới chính chuỗi `'Sheet'!A1`:
 * Excel đi theo r:id (một "file" không tồn tại). Bỏ r:id của mọi hyperlink có `location` và quan hệ tương ứng trong
 * `_rels` của sheet. Chữ trong ô đã được escape (`&lt;`) nên không thể giả làm thẻ `<hyperlink`.
 */
export function fixInternalLinks(sheetXml: string, relsXml: string | null): { sheet: string; rels: string | null } {
  const ids = new Set<string>()
  const sheet = sheetXml.replace(/<hyperlink\b[^>]*>/g, (tag) => {
    const m = /\sr:id="([^"]*)"/.exec(tag)
    if (!m || !/\slocation="/.test(tag)) return tag
    ids.add(m[1])
    return tag.replace(m[0], '')
  })
  if (ids.size === 0 || relsXml === null) return { sheet, rels: relsXml }
  const rels = relsXml.replace(/<Relationship\b[^>]*>/g, (tag) => (ids.has(/\sId="([^"]*)"/.exec(tag)?.[1] ?? '') ? '' : tag))
  return { sheet, rels }
}
