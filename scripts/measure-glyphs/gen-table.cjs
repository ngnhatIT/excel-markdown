// Bước 3 — sinh src/main/md2xlsx/glyphTable.ts từ kết quả đo data/precise-<kiểu>.txt (bước 2, precise.ps1).
//   node scripts/measure-glyphs/gen-table.cjs           ghi đè glyphTable.ts
//   node scripts/measure-glyphs/gen-table.cjs --check   chỉ so sánh, khác thì thoát mã 1
const fs = require('fs')
const path = require('path')

const here = __dirname
const target = path.join(here, '..', '..', 'src', 'main', 'md2xlsx', 'glyphTable.ts')

/** Đọc một file kết quả precise.ps1: bỏ dòng tiêu đề, mỗi dòng `mã hex \t h1 \t n`. */
function read(style) {
  return fs
    .readFileSync(path.join(here, 'data', `precise-${style}.txt`), 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(1)
    .map((l) => {
      const [h, h1, n] = l.split('\t')
      return { cp: parseInt(h, 16), h1: +h1, n: +n }
    })
}

// em = bề rộng chữ toàn角 (px) của kiểu chữ; U = cận trên (không gồm) của bề rộng vùng chữ (px) trong cột 150
// (1055px), suy từ bề rộng nguyên của chữ ASCII đo cùng cách (vùng chữ 1014px ở cỡ 10, 1012px ở 12 đậm);
// copies = số bản sao đã dùng khi đo (n >= copies: không rộng hơn 1em).
const STYLES = {
  r10: { em: 13, U: 1015, copies: 78 }, // 游ゴシック 10
  b10: { em: 13, U: 1015, copies: 78 }, // 游ゴシック 10 đậm
  b12: { em: 16, U: 1013, copies: 63 }, // 游ゴシック 12 đậm (heading)
  code10: { em: 14, U: 1015, copies: 72 } // MS Gothic 10 (code)
}
const REF = 0x3042 // あ: mốc 1em (đứng đầu danh sách đo)

const data = {}
for (const s of Object.keys(STYLES)) data[s] = new Map(read(s).map((x) => [x.cp, x]))
const cps = [...data.r10.keys()].filter((c) => c !== REF).sort((a, b) => a - b)

// Bề rộng mỗi ký tự đổi về 1em = 13px, lấy max của bốn kiểu, làm tròn lên.
const px = new Map()
for (const c of cps) {
  let t = 13
  for (const [s, { em, U, copies }] of Object.entries(STYLES)) {
    const x = data[s].get(c)
    if (!x) throw new Error(`thiếu U+${c.toString(16)} trong precise-${s}.txt`)
    if (x.h1 !== data[s].get(REF).h1) throw new Error(`U+${c.toString(16)} làm dòng cao hơn (${s}): cần mô hình riêng`)
    const w = x.n >= copies ? em : U / x.n
    t = Math.max(t, (13 * w) / em)
  }
  px.set(c, Math.ceil(t - 1e-9))
}

// Ký tự liền nhau gộp thành một khoảng, lấy max.
const runs = []
for (const c of cps.filter((c) => px.get(c) > 13)) {
  const last = runs[runs.length - 1]
  if (last && last.to === c - 1) {
    last.to = c
    last.px = Math.max(last.px, px.get(c))
  } else runs.push({ from: c, to: c, px: px.get(c) })
}
const hex = (c) => c.toString(16).toUpperCase().padStart(4, '0')
const tokens = runs.map((r) => (r.from === r.to ? `${hex(r.from)}:${r.px}` : `${hex(r.from)}-${hex(r.to)}:${r.px}`))
const lines = []
let cur = ''
for (const t of tokens) {
  if (cur.length + 1 + t.length > 110) {
    lines.push(cur)
    cur = t
  } else cur = cur ? cur + ' ' + t : t
}
if (cur) lines.push(cur)
const chars = runs.reduce((n, r) => n + r.to - r.from + 1, 0)

const ts = `// Ký tự BMP ngoài ASCII mà Excel hiển thị rộng hơn 1em (dữ liệu đo, sinh tự động — không sửa tay).
// Sinh lại: scripts/measure-glyphs (README.md): run.ps1 đo bằng Excel 16 thật -> data/precise-*.txt,
// rồi \`node scripts/measure-glyphs/gen-table.cjs\` ghi file này.
//
// Đo bằng Excel 16 thật (COM, 96 DPI), cột rộng 150 (1055px), wrapText, AutoFit:
// 1. Quét U+00A0–U+FFFF: mỗi ký tự lặp đủ số lần để vừa đúng một dòng nếu nó rộng 1em (78 lần ở 游ゴシック 10
//    thường/đậm, 63 lần ở 游ゴシック 12 đậm, 72 lần ở MS Gothic 10); hàng AutoFit cao hơn một dòng = rộng hơn 1em.
// 2. Với ký tự bị đánh dấu: tìm nhị phân số ký tự tối đa n trên một dòng -> bề rộng < (bề rộng vùng chữ + 1) / n.
// 3. Đổi về cỡ chữ có 1em = 13px (游ゴシック 10), lấy max của bốn kiểu chữ app dùng, làm tròn lên; các ký tự liền
//    nhau gộp thành một khoảng lấy max. Không ký tự nào làm dòng cao hơn bình thường.
// ${chars} ký tự, ${runs.length} khoảng. Định dạng: \`HHHH:px\` hoặc \`HHHH-HHHH:px\` (mã hex, px ở 1em = 13px).
// Ký tự không có trong bảng (CJK, kana, ký hiệu thường gặp ※ … → ① ○…) đo được không quá 1em.
export const WIDE_GLYPHS = \`
${lines.join('\n')}
\`
`

if (process.argv.includes('--check')) {
  const now = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n')
  if (now !== ts) {
    console.error('glyphTable.ts KHÁC kết quả sinh từ data/ — chạy lại không có --check để ghi đè')
    process.exit(1)
  }
  console.log(`glyphTable.ts khớp data/ (${chars} ký tự, ${runs.length} khoảng)`)
} else {
  fs.writeFileSync(target, ts)
  console.log(`đã ghi ${path.relative(process.cwd(), target)}: ${chars} ký tự, ${runs.length} khoảng`)
}
