// Ước lượng kích thước hiển thị chữ trong ô Excel (spec §5).
// Excel không tự giãn chiều cao ô merge, nên app phải tự tính số dòng.
// Ước lượng được phép dư (thừa khoảng trắng), không được thiếu (chữ bị che).

import { WIDE_GLYPHS } from './glyphTable'

/** Tách dòng thật của một ô (chấp nhận cả CRLF và CR lẻ). */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}

// ---- Độ rộng cột bảng (spec §5: CJK tính 2) ----

/** Độ rộng một ký tự (một code point) khi tính độ rộng cột: mã > 0xFF (CJK, toàn角…) tính 2, còn lại tính 1. */
function charWidth(ch: string): number {
  return ch.codePointAt(0)! > 0xff ? 2 : 1
}

/** Độ rộng một dòng. */
function lineWidth(line: string): number {
  let width = 0
  // Duyệt theo code point để cặp surrogate (ký tự ngoài BMP) chỉ tính một ký tự.
  for (const ch of line) width += charWidth(ch)
  return width
}

/** Độ rộng hiển thị của chuỗi (dùng tính độ rộng cột); chuỗi nhiều dòng lấy dòng rộng nhất. */
export function displayWidth(s: string): number {
  let max = 0
  for (const line of splitLines(s)) max = Math.max(max, lineWidth(line))
  return max
}

// ---- Số dòng khi Excel tự xuống dòng (chiều cao hàng merge) ----
//
// Đo bằng Excel 16 thật (96 DPI, COM AutoFit):
// - Excel xếp chữ 游ゴシック 10 theo bề rộng glyph nguyên (px) của font ở cỡ 13px: một cột rộng 1055px chứa vừa
//   78 chữ toàn角 (13), 144 chữ '0' (7), 338 chữ 'i' (3), 84 chữ 'W' (12) trên một dòng — khoảng 6.73 px glyph cho
//   mỗi đơn vị độ rộng cột. Ở đây lấy 6.5 px/đơn vị (chữ toàn角 = đúng 2 đơn vị như quy tắc độ rộng cột) để ước
//   lượng luôn dư một chút.
// - Excel chỉ xuống dòng sau khoảng trắng ASCII và sau dấu '-' (U+002D); khoảng trắng cuối dòng được "treo", không
//   cần vừa; một "từ" không vừa phần còn lại của dòng thì sang dòng mới, từ dài hơn cả một dòng thì cắt theo ký tự.
//   Chữ Nhật không có khoảng trắng cũng là một từ (vd `mixed カタカナ…`: cả cụm カタカナ sang dòng mới). Mô hình này
//   khớp đúng số dòng AutoFit của 100/102 mẫu đo (2 mẫu còn lại lệch do bề rộng, đã được hệ số 6.5 bù).
// - Dấu '-' (đo bằng MS Gothic 10 và 游ゴシック 10, cột chứa đúng 38 / 45 chữ): xuống dòng được ngay sau MỌI dấu '-',
//   bất kể ký tự hai bên (chữ, chữ số `-1`, chữ toàn角, dấu câu, khoảng trắng ` -`, dấu '-' khác `--`, đầu ô); không
//   xuống dòng trước dấu '-'. Một dấu '-' ngay sau phần đã vừa dòng được treo ở cuối dòng (như khoảng trắng nhưng chỉ
//   một dấu: `x38--x38` ra 3 dòng, `x38-x38` ra 2 dòng); phần trước nó đã tràn (vd `x38 -`) thì không treo. Các ký
//   tự khác KHÔNG phải chỗ xuống dòng: / ? , . ) ! % ; | _ ( [ { … ‐ – — ‑ (U+2010–U+2014), NBSP, U+3000, 、。・ và
//   giữa chữ toàn角.

/** Số px glyph (cỡ 13px) ứng với một đơn vị độ rộng cột. */
const GLYPH_PX_PER_UNIT = 6.5

/** Bề rộng glyph (px, 游ゴシック cỡ 13px) của ASCII 0x20–0x7E, đo bằng Excel 16 (xem trên). */
// prettier-ignore
const ASCII_GLYPH_PX = [
  4, 4, 5, 8, 8, 10, 9, 3, 5, 5, 6, 9, 3, 6, 3, 6, //  ! " # $ % & ' ( ) * + , - . /
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 4, 4, 9, 9, 9, 7, // 0-9 : ; < = > ?
  11, 8, 9, 9, 10, 8, 8, 9, 10, 4, 5, 9, 8, 12, 10, 10, // @ A-O
  9, 10, 9, 8, 8, 10, 8, 12, 8, 8, 8, 5, 7, 5, 7, 7, // P-Z [ \ ] ^ _
  7, 7, 8, 7, 8, 7, 4, 7, 8, 3, 4, 7, 3, 11, 8, 7, // ` a-o
  8, 8, 5, 7, 5, 8, 6, 10, 6, 6, 6, 5, 5, 5, 9 // p-z { | } ~
]
/** Như ASCII_GLYPH_PX nhưng cho chữ đậm (nhãn meta), đo cùng cách: đậm rộng hơn tới 1px (vd i 3 -> 4, a 7 -> 8). */
// prettier-ignore
const ASCII_BOLD_GLYPH_PX = [
  4, 5, 6, 8, 8, 11, 10, 3, 5, 5, 7, 10, 4, 6, 4, 7, //  ! " # $ % & ' ( ) * + , - . /
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 4, 4, 10, 10, 10, 7, // 0-9 : ; < = > ?
  12, 9, 9, 9, 10, 8, 8, 10, 10, 4, 6, 9, 8, 12, 10, 10, // @ A-O
  9, 10, 9, 9, 9, 10, 9, 12, 9, 9, 8, 5, 8, 5, 7, 7, // P-Z [ \ ] ^ _
  7, 8, 8, 7, 8, 8, 5, 8, 8, 4, 4, 7, 4, 12, 8, 8, // ` a-o
  8, 8, 5, 7, 5, 8, 7, 11, 7, 7, 6, 5, 5, 5, 9 // p-z { | } ~
]
/**
 * Heading: 游ゴシック 12 đậm (cỡ 16px), đo cùng cách (cột 1055px, vùng chữ ~1012px): vd i 5, a 9, W 15, khoảng
 * trắng 5; chữ toàn角 16, katakana nửa角 8.
 */
// prettier-ignore
const ASCII_HEADING_GLYPH_PX = [
  5, 6, 7, 10, 10, 13, 12, 4, 6, 6, 8, 12, 4, 7, 4, 8, //  ! " # $ % & ' ( ) * + , - . /
  9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 5, 5, 12, 12, 12, 9, // 0-9 : ; < = > ?
  14, 11, 11, 11, 12, 10, 10, 12, 12, 5, 7, 11, 10, 15, 13, 12, // @ A-O
  11, 12, 11, 11, 11, 12, 11, 15, 11, 11, 10, 6, 10, 6, 8, 8, // P-Z [ \ ] ^ _
  8, 9, 10, 9, 10, 9, 6, 9, 10, 5, 5, 9, 5, 15, 10, 9, // ` a-o
  10, 10, 6, 9, 6, 10, 9, 13, 9, 9, 8, 6, 6, 6, 11 // p-z { | } ~
]
/**
 * Code: MS Gothic 10 là font đơn cách: mọi ký tự ASCII (cả khoảng trắng, i, l, W) đều 7px, chữ toàn角 14px (đo: 144
 * chữ ASCII bất kỳ / 72 chữ あ mỗi dòng ở cột 1055px). Bảng 游ゴシック sẽ tính `i`/`l` quá hẹp -> thiếu dòng.
 */
const ASCII_CODE_GLYPH_PX: readonly number[] = new Array(0x7f - 0x20).fill(7)

/** Chữ toàn角 (CJK, kana, ký hiệu…) và mọi ký tự ngoài ASCII không có trong bảng: 1em (游ゴシック 10 = 13px). */
const WIDE_GLYPH_PX = 13
/** Katakana nửa角 (U+FF61–U+FF9F): 0.5em, đo được như chữ số. */
const HALF_GLYPH_PX = 7
/**
 * Ký tự ngoài BMP (emoji, CJK mở rộng B…) lấy từ font khác, và emoji trong BMP (`\p{Emoji_Presentation}`, vd ✅ ❌ ⭐):
 * Excel hiển thị emoji ~18–19px (đo: 56 chữ ✅/⭐/⌛ mỗi dòng ở cột 1055px, so với 78 chữ あ; mọi ký tự
 * U+1F000–U+1FFFF lặp 50 lần vẫn vừa một dòng, tức ≤ ~20px) -> 20px.
 */
const ASTRAL_GLYPH_PX = 20

/** Bề rộng (px ở 1em = 13px) của ký tự BMP ngoài ASCII; 0 = 1em. Dựng một lần từ WIDE_GLYPHS + emoji. */
let bmpGlyphPx: Uint8Array | undefined

function buildBmpGlyphPx(): Uint8Array {
  const table = new Uint8Array(0x10000)
  for (const token of WIDE_GLYPHS.split(/\s+/)) {
    const m = /^([0-9A-F]{4})(?:-([0-9A-F]{4}))?:(\d+)$/.exec(token)
    if (!m) continue
    const from = parseInt(m[1], 16)
    const to = m[2] ? parseInt(m[2], 16) : from
    for (let cp = from; cp <= to; cp++) table[cp] = Number(m[3])
  }
  const emoji = /\p{Emoji_Presentation}/u
  for (let cp = 0x80; cp < 0x10000; cp++) {
    // bỏ nửa cặp surrogate (không phải ký tự)
    if (cp >= 0xd800 && cp <= 0xdfff) continue
    if (emoji.test(String.fromCharCode(cp))) table[cp] = Math.max(table[cp], ASTRAL_GLYPH_PX)
  }
  return table
}

/**
 * Kiểu chữ của ô khi ước lượng (mỗi kiểu có bề rộng glyph đo riêng bằng Excel thật):
 * `body` 游ゴシック 10 (đoạn văn, ghi chú, value meta), `bold` 游ゴシック 10 đậm (nhãn meta),
 * `heading` 游ゴシック 12 đậm, `code` MS Gothic 10.
 */
export type TextStyle = 'body' | 'bold' | 'heading' | 'code'

interface GlyphMetrics {
  /** Bề rộng (px) của ASCII 0x20–0x7E. */
  ascii: readonly number[]
  /** Chữ toàn角 (1em, px); ký tự ngoài ASCII trong bảng đo / emoji được nhân theo tỉ lệ `em / 13`. */
  em: number
  /** Katakana nửa角 (px). */
  half: number
}

const METRICS: Record<TextStyle, GlyphMetrics> = {
  body: { ascii: ASCII_GLYPH_PX, em: WIDE_GLYPH_PX, half: HALF_GLYPH_PX },
  bold: { ascii: ASCII_BOLD_GLYPH_PX, em: WIDE_GLYPH_PX, half: HALF_GLYPH_PX },
  heading: { ascii: ASCII_HEADING_GLYPH_PX, em: 16, half: 8 },
  code: { ascii: ASCII_CODE_GLYPH_PX, em: 14, half: 7 }
}

/** Bề rộng (đơn vị độ rộng cột) của một code point khi Excel hiển thị bằng kiểu chữ `m`. */
function glyphWidth(cp: number, m: GlyphMetrics): number {
  let px: number
  if (cp >= 0x20 && cp <= 0x7e) px = m.ascii[cp - 0x20]
  else if (cp >= 0xff61 && cp <= 0xff9f) px = m.half
  else if (cp > 0xffff) px = (ASTRAL_GLYPH_PX * m.em) / WIDE_GLYPH_PX
  else {
    // Latin-1, Hy Lạp, Kirin, ký hiệu…: nhiều chữ là toàn角 trong 游ゴシック (× ± ° §) -> tính 1em cho chắc;
    // ký tự đo được rộng hơn (emoji, ⟶, ⸻, U+FDFD…) theo bảng đo (px ở 1em = 13px, đổi theo cỡ chữ).
    const wide = (bmpGlyphPx ??= buildBmpGlyphPx())[cp]
    px = wide ? (wide * m.em) / WIDE_GLYPH_PX : m.em
  }
  return px / GLYPH_PX_PER_UNIT
}

/** Khoảng trắng ASCII: chỗ xuống dòng của Excel (khoảng trắng toàn角 U+3000 không phải). */
const SPACE = 0x20
/** Dấu '-' ASCII: Excel xuống dòng được ngay sau nó (‐ – — U+2010–U+2014 thì không). */
const HYPHEN = 0x2d

/**
 * Mô phỏng Excel tự xuống dòng một dòng thật trong vùng rộng `width` (đơn vị độ rộng cột), bắt đầu từ chỉ số
 * `from` (UTF-16). Trả về chỉ số bắt đầu của từng dòng hiển thị (phần tử đầu là `from`); dừng sớm khi đã có
 * `limit` dòng. Xuống dòng tham lam ngay trước ký tự đầu tiên sau một dãy khoảng trắng, hoặc ngay sau một dấu '-';
 * khoảng trắng không bao giờ làm tràn dòng; một dấu '-' ngay sau phần đã vừa dòng được treo; từ không vừa phần còn
 * lại thì sang dòng mới; từ dài hơn cả một dòng thì cắt theo ký tự (không cắt giữa cặp surrogate). Chạy lại từ một
 * chỉ số đầu dòng cho ra đúng các dòng như khi chạy liền từ đầu (splitByLines dựa vào điều này).
 */
function wrapStarts(line: string, from: number, width: number, limit: number, m: GlyphMetrics): number[] {
  const starts = [from]
  let lineStart = from
  let x = 0
  /** Chỗ được xuống dòng gần nhất trong dòng hiện tại (-1 = chưa có) và độ rộng tính tới đó. */
  let lastBreak = -1
  let xAtBreak = 0
  let prev = -1
  for (let i = from; i < line.length; ) {
    const cp = line.codePointAt(i)!
    const size = cp > 0xffff ? 2 : 1
    const w = glyphWidth(cp, m)
    if (cp === SPACE) {
      // Khoảng trắng "treo" ở cuối dòng: cộng độ rộng nhưng không xuống dòng vì nó.
      x += w
      prev = cp
      i += size
      continue
    }
    if (i > lineStart && (prev === SPACE || prev === HYPHEN)) {
      lastBreak = i
      xAtBreak = x
    }
    // Ký tự đầu dòng luôn được đặt (vùng hẹp hơn một ký tự vẫn không treo). Dấu '-' tràn dòng mà phần trước nó vừa
    // dòng thì treo (Excel đo: `x38-x38` 2 dòng, `x38--x38` 3 dòng, `x38 -x38` 3 dòng ở vùng 38 chữ).
    while (i > lineStart && x + w > width && !(cp === HYPHEN && x <= width)) {
      if (lastBreak > lineStart) {
        // Cả từ đang dở sang dòng mới
        lineStart = lastBreak
        x -= xAtBreak
      } else {
        // Từ dài hơn cả dòng: cắt ngay trước ký tự này
        lineStart = i
        x = 0
      }
      lastBreak = -1
      starts.push(lineStart)
      if (starts.length >= limit) return starts
    }
    x += w
    prev = cp
    i += size
  }
  return starts
}

/** Vùng rộng hợp lệ: phòng tổng độ rộng <= 0/NaN (coi như 1) để không sinh Infinity/NaN. */
function safeWidth(totalWidth: number): number {
  return totalWidth > 0 ? totalWidth : 1
}

/**
 * Số dòng hiển thị khi chữ tự xuống dòng trong vùng rộng `totalWidth` (tổng độ rộng các cột merge):
 * Σ theo từng dòng thật của số dòng khi mô phỏng xuống dòng (dòng trống vẫn là 1 dòng), theo kiểu chữ `style`.
 */
export function estimateLines(text: string, totalWidth: number, style: TextStyle = 'body'): number {
  const width = safeWidth(totalWidth)
  const m = METRICS[style]
  let lines = 0
  for (const line of splitLines(text)) lines += wrapStarts(line, 0, width, Infinity, m).length
  return lines
}

/**
 * Chia `text` thành các khối liên tiếp, mỗi khối hiển thị tối đa `maxLines` dòng trong vùng rộng
 * `totalWidth` (theo estimateLines) và dài tối đa `maxChars` đơn vị UTF-16. Dùng để tách đoạn văn
 * quá cao thành nhiều hàng merge (một hàng Excel cao tối đa 409.5pt).
 *
 * - Dòng thật được xếp nguyên vẹn, tham lam, theo thứ tự; các dòng trong cùng khối nối bằng `\n`.
 * - Một dòng thật tự nó đã vượt giới hạn bị cắt tại chỗ xuống dòng của mô phỏng, mỗi mảnh `maxLines` dòng
 *   hiển thị là một khối riêng (mảnh quá `maxChars` thì bớt dòng, một dòng hiển thị quá `maxChars` thì cắt theo
 *   ký tự, không cắt giữa cặp surrogate). Nối các mảnh của cùng một dòng bằng chuỗi rỗng ra lại dòng gốc.
 * - Luôn trả về ít nhất một khối. `style`: kiểu chữ (như estimateLines).
 */
export function splitByLines(
  text: string,
  totalWidth: number,
  maxLines: number,
  maxChars = Infinity,
  style: TextStyle = 'body'
): string[] {
  const width = safeWidth(totalWidth)
  const m = METRICS[style]
  const perBlock = Math.max(1, Math.floor(maxLines))
  const blocks: string[] = []
  let cur: string[] = []
  let curLines = 0
  let curChars = 0
  const flush = () => {
    if (cur.length === 0) return
    blocks.push(cur.join('\n'))
    cur = []
    curLines = 0
    curChars = 0
  }

  for (const line of splitLines(text)) {
    const lines = wrapStarts(line, 0, width, perBlock + 1, m).length
    if (lines > perBlock || line.length > maxChars) {
      flush()
      cutLongLine(line, width, perBlock, maxChars, m, blocks)
      continue
    }
    if (cur.length > 0 && (curLines + lines > maxLines || curChars + 1 + line.length > maxChars)) flush()
    curChars += (cur.length > 0 ? 1 : 0) + line.length
    curLines += lines
    cur.push(line)
  }
  flush()
  return blocks.length > 0 ? blocks : ['']
}

/** Cắt một dòng thật quá dài thành các mảnh (xem splitByLines) và thêm vào `out`. */
function cutLongLine(
  line: string,
  width: number,
  maxLines: number,
  maxChars: number,
  m: GlyphMetrics,
  out: string[]
): void {
  let pos = 0
  while (pos < line.length) {
    // Đầu của tối đa maxLines + 1 dòng hiển thị tính từ pos; mảnh = maxLines dòng đầu.
    const starts = wrapStarts(line, pos, width, maxLines + 1, m)
    let k = Math.min(maxLines, starts.length)
    const endOf = (n: number) => (n < starts.length ? starts[n] : line.length)
    while (k > 1 && endOf(k) - pos > maxChars) k--
    let end = endOf(k)
    if (end - pos > maxChars) {
      // Một dòng hiển thị dài hơn maxChars: cắt theo ký tự, không để lại nửa cặp surrogate.
      end = pos + maxChars
      const last = line.charCodeAt(end - 1)
      if (last >= 0xd800 && last <= 0xdbff) end = end - 1 > pos ? end - 1 : end + 1
    }
    out.push(line.slice(pos, end))
    pos = end
  }
}
