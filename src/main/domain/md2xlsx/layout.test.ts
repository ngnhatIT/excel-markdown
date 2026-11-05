import { describe, expect, it } from 'vitest'
import { WIDE_GLYPHS } from './glyphTable'
import { displayWidth, estimateLines, parseWideGlyphs, splitByLines } from './layout'

describe('parseWideGlyphs (bảng glyphTable.ts)', () => {
  it('đọc đủ bảng đo: 618 khoảng, 1468 ký tự, px > 13 (rộng hơn 1em)', () => {
    const ranges = parseWideGlyphs(WIDE_GLYPHS)
    expect(ranges).toHaveLength(618)
    expect(ranges.reduce((n, r) => n + r.to - r.from + 1, 0)).toBe(1468)
    for (const r of ranges) {
      expect(r.to).toBeGreaterThanOrEqual(r.from)
      expect(r.px).toBeGreaterThan(13)
    }
    expect(ranges.find((r) => r.from <= 0xfdfd && 0xfdfd <= r.to)?.px).toBe(92)
  })

  it('token sai định dạng -> ném lỗi (không lặng lẽ bỏ qua)', () => {
    expect(parseWideGlyphs('0152:15\n01C4:15 2E3A-2E3B:25')).toHaveLength(3)
    for (const bad of ['0152', '01c4:15', '2E3B-2E3A:25', 'ZZZZ:15', '0152:15:1', '1F600:20'])
      expect(() => parseWideGlyphs(bad), bad).toThrow()
  })
})

describe('displayWidth', () => {
  it('ký tự mã > 0xFF tính 2, còn lại tính 1', () => {
    expect(displayWidth('aあ')).toBe(3)
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('')).toBe(0)
  })

  it('chuỗi nhiều dòng lấy dòng rộng nhất', () => {
    expect(displayWidth('ab\nあいう')).toBe(6)
    expect(displayWidth('abcdef\nあ')).toBe(6)
    expect(displayWidth('ab\r\nあいう')).toBe(6)
  })

  it('cặp surrogate (ký tự ngoài BMP) tính một ký tự rộng 2, không phải 4', () => {
    expect(displayWidth('😀')).toBe(2)
    expect(displayWidth('a😀')).toBe(3)
  })
})

describe('estimateLines', () => {
  it('một dòng ngắn là 1 dòng; dòng dài chia theo tổng độ rộng', () => {
    expect(estimateLines('ab', 10)).toBe(1)
    expect(estimateLines('a'.repeat(25), 10)).toBe(3)
    expect(estimateLines('あ'.repeat(6), 10)).toBe(2)
  })

  it('cộng dồn từng dòng thật; dòng trống vẫn chiếm 1 dòng', () => {
    expect(estimateLines('a\nb', 10)).toBe(2)
    expect(estimateLines('', 10)).toBe(1)
    expect(estimateLines('a\n\nb', 10)).toBe(3)
    expect(estimateLines('a'.repeat(25) + '\nb', 10)).toBe(4)
  })

  it('đúng biên: chữ toàn角 rộng 2, vừa khít không thêm dòng', () => {
    expect(estimateLines('あ'.repeat(5), 10)).toBe(1)
    expect(estimateLines('あ'.repeat(6), 12)).toBe(1)
    expect(estimateLines('あ'.repeat(6), 11.9)).toBe(2)
  })

  it('độ rộng chữ Latin theo glyph 游ゴシック: chữ hoa/số rộng hơn 1, chữ hẹp (i, l, .) dưới 1', () => {
    // 40 chữ 'W' rộng gần gấp đôi 40 đơn vị; 40 chữ 'i' chưa tới một nửa
    expect(estimateLines('W'.repeat(40), 40)).toBe(2)
    expect(estimateLines('i'.repeat(40), 20)).toBe(1)
    // số và chữ hoa vượt 1 đơn vị: 10 ký tự không vừa vùng rộng 10
    expect(estimateLines('0123456789', 10)).toBe(2)
    expect(estimateLines('ABCDEFGHIJ', 10)).toBe(2)
  })

  it('ký tự ngoài ASCII (Latin-1, Hy Lạp, ký hiệu) tính như toàn角; katakana nửa角 như số', () => {
    expect(estimateLines('×'.repeat(6), 11)).toBe(2)
    expect(estimateLines('ｱ'.repeat(10), 11)).toBe(1)
  })

  it('emoji (Emoji_Presentation) và ký tự đo được rộng hơn 1em tính theo bề rộng đo bằng Excel thật', () => {
    // Excel 16, cột 150 (1055px): 78 chữ あ mỗi dòng nhưng chỉ 56 chữ ✅/⏰/⭕ (~18px), 67 chữ ⟶ (~15px),
    // 42 chữ ⸻ (~24px), 13 chữ U+FDFD (~78px) -> nhiều hơn số đó phải ra >= 2 dòng
    expect(estimateLines('\u2705'.repeat(57), 150)).toBeGreaterThanOrEqual(2)
    expect(estimateLines('\u23F0'.repeat(57), 150)).toBeGreaterThanOrEqual(2)
    expect(estimateLines('\u2B55'.repeat(57), 150)).toBeGreaterThanOrEqual(2)
    expect(estimateLines('\u27F6'.repeat(68), 150)).toBeGreaterThanOrEqual(2)
    expect(estimateLines('\u2E3B'.repeat(43), 150)).toBeGreaterThanOrEqual(2)
    expect(estimateLines('\uFDFD'.repeat(14), 150)).toBeGreaterThanOrEqual(2)
    // ⚪ có trong 游ゴシック (đo: 78 chữ/dòng như あ) nhưng là Emoji_Presentation: tính như emoji (dư, không thiếu)
    expect(estimateLines('\u26AA'.repeat(57), 150)).toBeGreaterThanOrEqual(2)
  })

  it('ký tự ngoài ASCII không đo được rộng hơn 1em vẫn tính đúng 1em (không làm hàng cao thừa)', () => {
    // ※ … → ① ○ đều 78 chữ/dòng trong Excel như あ
    for (const ch of ['\u203B', '\u2026', '\u2192', '\u2460', '\u25CB', 'あ']) expect(estimateLines(ch.repeat(75), 150)).toBe(1)
  })

  it("kiểu chữ 'code' (MS Gothic 10, đơn cách): mọi chữ ASCII 7px, toàn角 14px; chữ hẹp không được tính hẹp", () => {
    // Excel, cột 150: 144 chữ bất kỳ (i, W, khoảng trắng…) và 72 chữ あ mỗi dòng
    expect(estimateLines('i'.repeat(145), 150, 'code')).toBeGreaterThanOrEqual(2)
    expect(estimateLines('l'.repeat(145), 150, 'code')).toBeGreaterThanOrEqual(2)
    expect(estimateLines('あ'.repeat(73), 150, 'code')).toBeGreaterThanOrEqual(2)
    // cùng chuỗi ở 游ゴシック (i 3px) vừa một dòng
    expect(estimateLines('i'.repeat(145), 150)).toBe(1)
    // ước lượng không thừa quá: 130 chữ (Excel: 1 dòng) -> 1 dòng; 140 chữ -> tối đa 2
    expect(estimateLines('i'.repeat(130), 150, 'code')).toBe(1)
  })

  it("kiểu chữ 'heading' (游ゴシック 12 đậm): bề rộng glyph lớn hơn cỡ 10 (đo bằng Excel)", () => {
    // Excel, cột 150: 63 chữ あ, 67 chữ W, 202 chữ i mỗi dòng
    expect(estimateLines('あ'.repeat(64), 150, 'heading')).toBeGreaterThanOrEqual(2)
    expect(estimateLines('W'.repeat(68), 150, 'heading')).toBeGreaterThanOrEqual(2)
    expect(estimateLines('i'.repeat(203), 150, 'heading')).toBeGreaterThanOrEqual(2)
    expect(estimateLines('\u2705'.repeat(45), 150, 'heading')).toBeGreaterThanOrEqual(2)
    expect(estimateLines('あ'.repeat(60), 150, 'heading')).toBe(1)
    // cỡ 10 thường vẫn như cũ
    expect(estimateLines('あ'.repeat(64), 150)).toBe(1)
  })

  it('tự xuống dòng theo từ: từ Latin không bị cắt khi còn vừa một dòng mới', () => {
    // mỗi từ 13 chữ 'i' ≈ 6 đơn vị: hai từ + khoảng trắng không vừa vùng rộng 10 -> mỗi từ một dòng
    const word = 'i'.repeat(13)
    expect(estimateLines([word, word, word].join(' '), 10)).toBe(3)
    // cùng tổng độ rộng nhưng là một từ liền (cắt theo ký tự): chỉ 2 dòng
    expect(estimateLines(word.repeat(3) + 'ii', 10)).toBe(2)
  })

  it('từ dài hơn một dòng bị cắt theo ký tự (không treo)', () => {
    expect(estimateLines('W'.repeat(100), 10)).toBeGreaterThanOrEqual(19)
    expect(estimateLines('x', 0.1)).toBe(1)
  })

  it('chỉ xuống dòng sau khoảng trắng ASCII (và sau dấu -): cụm chữ Nhật là một từ, không vừa phần còn lại thì sang dòng mới', () => {
    // từ đầu dòng dài hơn một dòng: cắt theo ký tự, mỗi dòng đầy
    expect(estimateLines('あ'.repeat(10), 10)).toBe(2)
    // 'ab ' rồi cụm 8 chữ toàn角 (16 đơn vị): cụm sang dòng mới rồi mới cắt -> 1 + 2 dòng (Excel đo: như vậy)
    expect(estimateLines('ab ' + 'あ'.repeat(8), 10)).toBe(3)
    expect(estimateLines('ab ' + 'あ'.repeat(6), 10)).toBe(3)
    // khoảng trắng toàn角 không phải chỗ xuống dòng: cả chuỗi là một từ, cắt theo ký tự -> 2 dòng
    expect(estimateLines('ab　' + 'あ'.repeat(6), 10)).toBe(2)
  })

  it('khoảng trắng cuối dòng được treo, không tự tạo dòng mới', () => {
    expect(estimateLines('i'.repeat(13) + ' '.repeat(40), 6.2)).toBe(1)
    expect(estimateLines('i'.repeat(13) + '   ' + 'i', 6.2)).toBe(2)
  })

  describe("dấu '-' (U+002D): Excel xuống dòng sau mỗi dấu '-', một dấu '-' cuối dòng được treo", () => {
    // Đo bằng Excel 16 (MS Gothic 10, cột 285px chứa đúng 38 chữ ASCII 7px). Kiểu 'code' với vùng rộng 40.93 cũng
    // chứa đúng 38 chữ -> số dòng của mô hình phải BẰNG số dòng Excel AutoFit trong mọi mẫu dưới đây.
    const W = 40.93
    const x = (n: number) => 'x'.repeat(n)
    const lines = (s: string) => estimateLines(s, W, 'code')

    it('vùng rộng chứa đúng 38 chữ', () => {
      expect(lines(x(38))).toBe(1)
      expect(lines(x(39))).toBe(2)
    })

    it.each([
      ['x16 - x39 (sau chữ)', x(16) + '-' + x(39), 3],
      ['trước chữ số (x-1)', x(16) + '-1' + x(39), 3],
      ['sau chữ số (1-x)', x(16) + '1-' + x(39), 3],
      ['giữa chữ số (1-2)', x(16) + '1-2' + x(39), 3],
      ['giữa chữ toàn角 (あ-あ)', x(16) + 'あ-あ' + x(39), 3],
      ['trước chữ toàn角 (x-あ)', x(16) + '-あ' + x(39), 3],
      ['sau chữ toàn角 (あ-x)', x(16) + 'あ-' + x(39), 3],
      ['trước dấu câu (-. -/ -( -")', x(16) + '-./("' + x(39), 3],
      ['hai dấu (--)', x(16) + '--' + x(39), 3],
      ['sau khoảng trắng ( -): dấu - ở lại dòng trên', x(16) + ' -' + x(38), 2],
      ['sau khoảng trắng, trước chữ số ( -1)', x(16) + ' -' + '1'.repeat(38), 2],
      ['xuống sau dấu - cuối của --', x(16) + '--' + x(38), 2],
      ['xuống sau dấu - cuối của ---', x(16) + '---' + x(38), 2],
      ['- đầu ô', '-' + x(39), 3],
      ['-- đầu ô', '--' + x(39), 3],
      ['- đầu dòng sau khi xuống ở khoảng trắng', x(38) + ' -' + x(39), 4]
    ])('xuống dòng sau dấu -: %s', (_, s, n) => {
      expect(lines(s)).toBe(n)
    })

    it.each([
      ['một dấu - ngay sau dòng đầy được treo', 'y ' + x(36) + '-' + x(38), 2],
      ['hai dấu - : chỉ một dấu treo', 'y ' + x(36) + '--' + x(38), 3],
      ['một dấu - sau từ dài đầy dòng', x(38) + '-' + x(38), 2],
      ['hai dấu - sau từ dài đầy dòng', x(38) + '--' + x(38), 3],
      ['dấu - rồi khoảng trắng: cả hai treo', x(38) + '- ' + x(38), 2],
      ['khoảng trắng rồi dấu -: dấu - không treo', x(38) + ' -' + x(38), 3],
      ['x37 -- x38', x(37) + '--' + x(38), 2],
      ['phần trước dấu - đã tràn: không treo', 'y ' + x(37) + '-' + x(38), 3],
      ['dòng đầy rồi - (treo) rồi từ ngắn', 'y ' + x(36) + '-' + x(5), 2],
      ['dòng đầy rồi -- (dấu thứ hai treo)', 'y ' + x(35) + '--' + x(5), 2],
      ['dòng đầy rồi ---', 'y ' + x(35) + '---' + x(5), 2],
      ['từ dài bị cắt rồi mới đến -', x(39) + '-' + x(38), 3]
    ])('treo: %s', (_, s, n) => {
      expect(lines(s)).toBe(n)
    })

    it('các ký tự khác không phải chỗ xuống dòng (đo: / ? , . ) ! % ; | _ ‐ – — ‑ NBSP)', () => {
      for (const c of ['/', '?', ',', '.', ')', '!', '%', ';', '|', '_', '\u2010', '\u2013', '\u2014', '\u2011', '\u00A0'])
        expect(lines(x(16) + c + x(39)), c).toBe(2)
    })
  })

  it('tổng độ rộng không hợp lệ không sinh Infinity/NaN', () => {
    expect(Number.isFinite(estimateLines('abc', 0))).toBe(true)
    expect(estimateLines('abc', 0)).toBeGreaterThanOrEqual(1)
  })
})

describe('splitByLines', () => {
  // Nửa cặp surrogate (cao không có thấp theo sau, hoặc thấp không có cao đứng trước).
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

  it('văn bản vừa trong giới hạn -> một khối nguyên vẹn', () => {
    expect(splitByLines('a\nb\nc', 10, 24)).toEqual(['a\nb\nc'])
    expect(splitByLines('', 10, 24)).toEqual([''])
  })

  it('60 dòng ngắn, tối đa 24 dòng mỗi khối -> 24 + 24 + 12; nối lại bằng xuống dòng ra bản gốc', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `l${i}`)
    const rows = splitByLines(lines.join('\n'), 10, 24)
    expect(rows.map((r) => r.split('\n').length)).toEqual([24, 24, 12])
    expect(rows.join('\n')).toBe(lines.join('\n'))
  })

  it('dòng bị wrap tính theo estimateLines: ghép nguyên dòng thật, không cắt dòng đi vừa', () => {
    // mỗi dòng 25 ký tự / rộng 10 = 3 dòng hiển thị; tối đa 7 -> 2 dòng thật mỗi khối (6 <= 7 < 9)
    const lines = Array.from({ length: 5 }, () => 'a'.repeat(25))
    const rows = splitByLines(lines.join('\n'), 10, 7)
    expect(rows.map((r) => r.split('\n').length)).toEqual([2, 2, 1])
    for (const r of rows) expect(estimateLines(r, 10)).toBeLessThanOrEqual(7)
  })

  it('một dòng tự nó vượt giới hạn -> cắt theo độ rộng hiển thị, mỗi mảnh vừa maxLines, nối lại ra bản gốc', () => {
    const line = 'x'.repeat(20000)
    const rows = splitByLines(line, 33.72, 24)
    expect(rows.length).toBeGreaterThan(1)
    for (const r of rows) expect(estimateLines(r, 33.72)).toBeLessThanOrEqual(24)
    expect(rows.join('')).toBe(line)
  })

  it('dòng quá dài nằm giữa các dòng ngắn: dòng ngắn ở khối riêng, thứ tự không đổi', () => {
    const rows = splitByLines('a\n' + 'x'.repeat(5000) + '\nb', 33.72, 24)
    expect(rows[0]).toBe('a')
    expect(rows[rows.length - 1]).toBe('b')
    expect(rows.slice(1, -1).join('')).toBe('x'.repeat(5000))
  })

  it('cắt dòng dài không làm vỡ cặp surrogate; ký tự rộng 2 vẫn vừa giới hạn', () => {
    const line = '😀'.repeat(3000) + 'あ'.repeat(3000)
    const rows = splitByLines(line, 33.72, 24)
    expect(rows.join('')).toBe(line)
    for (const r of rows) {
      expect(r).not.toMatch(lone)
      expect(estimateLines(r, 33.72)).toBeLessThanOrEqual(24)
    }
  })

  it('dòng dài nhiều từ: mỗi mảnh vừa maxLines theo cách xuống dòng theo từ, nối lại ra bản gốc', () => {
    const line = 'SELECT CUSTOMER_ID, CUSTOMER_NAME FROM TBL_CUSTOMER WHERE DELETE_FLG = 0 '.repeat(200)
    const rows = splitByLines(line, 50, 24)
    expect(rows.length).toBeGreaterThan(1)
    for (const r of rows) expect(estimateLines(r, 50)).toBeLessThanOrEqual(24)
    expect(rows.join('')).toBe(line)
    // không cắt quá vụn: tổng số dòng hiển thị của các mảnh bằng số dòng của cả dòng gốc
    expect(rows.reduce((n, r) => n + estimateLines(r, 50), 0)).toBe(estimateLines(line, 50))
  })

  it('maxChars: khối không vượt số ký tự tối đa (ghép dòng và cắt dòng dài)', () => {
    const rows = splitByLines(['aaaa', 'bbbb', 'cccc'].join('\n'), 1000, 24, 9)
    expect(rows).toEqual(['aaaa\nbbbb', 'cccc'])
    const cut = splitByLines('y'.repeat(25), 1000, 24, 10)
    expect(cut.map((r) => r.length)).toEqual([10, 10, 5])
    expect(cut.join('')).toBe('y'.repeat(25))
  })

  it('tổng độ rộng không hợp lệ không treo', () => {
    expect(splitByLines('abc', 0, 24).join('')).toBe('abc')
  })
})
