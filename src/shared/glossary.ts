/* 用語集 của dự án: file `用語集.md` / `glossary.md` (bảng Markdown cột 日本語 | Tiếng Việt | English | 備考).
 * Dùng cho dịch nhanh (giữ đúng thuật ngữ), RAG (bung từ khóa Việt/Anh -> Nhật) và gợi ý tạo file từ Bản đồ thiết kế.
 * Thuần, dùng chung main + renderer. File là dữ liệu không tin cậy: mọi thứ đều có giới hạn. */
import { splitTableRow } from './specDiff'
import type { SpecIndex } from './specIndex'
import { foldText } from './textFold'

export interface GlossaryEntry {
  ja: string
  vi: string
  en: string
  note: string
}

/** Tên file 用語集 (không phân biệt hoa thường), tìm ở gốc thư mục rồi tới thư mục con sâu tối đa 2 cấp */
export const GLOSSARY_FILES = ['用語集.md', 'glossary.md']
export const GLOSSARY_MAX = 2000
/** Thuật ngữ dài hơn bị cắt (ô bảng bất thường không phình prompt) */
const TERM_MAX = 80

/** File 用語集 trong danh sách đường dẫn tương đối (`/`): nông nhất, rồi theo thứ tự danh sách. */
export function findGlossaryRel(rels: string[]): string | undefined {
  let best: string | undefined
  let bestDepth = 3
  for (const rel of rels) {
    const parts = rel.split('/')
    const depth = parts.length - 1
    const name = parts[parts.length - 1].normalize('NFKC').toLowerCase()
    if (depth < bestDepth && GLOSSARY_FILES.includes(name)) {
      best = rel
      bestDepth = depth
    }
  }
  return best
}

const key = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[\s*_`]/g, '')
const HEADER: Record<keyof GlossaryEntry, string[]> = {
  ja: ['日本語', 'japanese', 'ja', '用語'],
  vi: ['ベトナム語', 'tiếngviệt', 'vietnamese', 'vi'],
  en: ['英語', 'english', 'en'],
  note: ['備考', 'note', 'notes', 'ghichú'],
}
/** Bỏ escape Markdown của converter (`\_`, `\|`), `**`, `` ` ``, xuống dòng; một dòng, tối đa TERM_MAX ký tự. */
const cell = (s: string | undefined): string =>
  (s ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!<>~&|])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TERM_MAX)

/** Mọi bảng có cột 日本語 + (Tiếng Việt hoặc English) -> mục; hàng thiếu ja hoặc thiếu cả vi lẫn en bị bỏ. */
export function parseGlossary(md: string): GlossaryEntry[] {
  const out: GlossaryEntry[] = []
  const lines = md.split(/\r?\n/)
  for (let i = 0; i + 1 < lines.length && out.length < GLOSSARY_MAX; i++) {
    if (!lines[i].trimStart().startsWith('|') || !/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) continue
    const head = splitTableRow(lines[i]).map(key)
    const col = (k: keyof GlossaryEntry): number => head.findIndex((h) => HEADER[k].includes(h))
    const idx = { ja: col('ja'), vi: col('vi'), en: col('en'), note: col('note') }
    if (idx.ja < 0 || (idx.vi < 0 && idx.en < 0)) continue
    for (i += 2; i < lines.length && lines[i].trimStart().startsWith('|') && out.length < GLOSSARY_MAX; i++) {
      const cells = splitTableRow(lines[i])
      const e = { ja: cell(cells[idx.ja]), vi: idx.vi < 0 ? '' : cell(cells[idx.vi]), en: idx.en < 0 ? '' : cell(cells[idx.en]), note: idx.note < 0 ? '' : cell(cells[idx.note]) }
      if (e.ja && (e.vi || e.en)) out.push(e)
    }
  }
  return out
}

const fold = (s: string): string => foldText(s.normalize('NFKC'))
const ASCII_WORD = /^[a-z0-9 _.-]+$/

/** Mục có thuật ngữ ja / vi / en xuất hiện trong `text` (không phân biệt hoa thường, toàn/bán角, hiragana/katakana).
 * Thuật ngữ ASCII phải đứng nguyên từ (`order` không khớp `ordering`); ký tự đơn bỏ qua. */
export function termsIn(text: string, entries: readonly GlossaryEntry[], max = 40): GlossaryEntry[] {
  const hay = fold(text)
  const out: GlossaryEntry[] = []
  for (const e of entries) {
    if (out.length >= max) break
    const hit = [e.ja, e.vi, e.en].some((t) => {
      const n = fold(t).trim()
      if (n.length < 2) return false
      if (!ASCII_WORD.test(n)) return hay.includes(n)
      let at = hay.indexOf(n)
      while (at >= 0) {
        if (!/[a-z0-9_]/.test(hay[at - 1] ?? '') && !/[a-z0-9_]/.test(hay[at + n.length] ?? '')) return true
        at = hay.indexOf(n, at + 1)
      }
      return false
    })
    if (hit) out.push(e)
  }
  return out
}

/** Hàng gợi ý cho 用語集: 論理名 bảng / cột (en = 物理名 để tham khảo) và tên màn hình; vi để trống cho người dùng điền.
 * Bỏ thuật ngữ đã có trong 用語集 hiện tại và trùng lặp. */
export function suggestGlossary(index: SpecIndex, max = 1000): GlossaryEntry[] {
  const seen = new Set((index.glossary?.entries ?? []).map((e) => fold(e.ja)))
  const out: GlossaryEntry[] = []
  const add = (ja: string, en: string, note: string): void => {
    const j = ja.replace(/\s+/g, ' ').trim()
    if (j.length < 2 || seen.has(fold(j)) || out.length >= max) return
    seen.add(fold(j))
    out.push({ ja: j, vi: '', en, note })
  }
  for (const t of index.tables) {
    add(t.logicalName, t.tableName, `テーブル ${t.tableName}`)
    for (const c of t.columns) add(c.logical, c.name, `カラム ${t.tableName}.${c.name}`)
  }
  for (const s of index.screens) add(s.name, '', `画面 ${s.id}`)
  return out
}

/** Bảng Markdown của 用語集 (parseGlossary đọc lại được). */
export function glossaryMarkdown(entries: readonly GlossaryEntry[]): string {
  const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ')
  const rows = entries.map((e) => `| ${esc(e.ja)} | ${esc(e.vi)} | ${esc(e.en)} | ${esc(e.note)} |`)
  return ['# 用語集', '', '| 日本語 | Tiếng Việt | English | 備考 |', '|---|---|---|---|', ...rows].join('\n') + '\n'
}
