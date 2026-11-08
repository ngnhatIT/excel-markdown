/* Xuất cuộc trò chuyện Trợ lý AI ra Markdown (thuần, có test). */
import type { RagCitation } from '../../../shared/types'

/** Đường dẫn giả của bản dán (trùng PASTE_PATH của useMdViewer; không import hook vào hàm thuần). */
const PASTE_PATH = 'clipboard:paste'

export interface ChatExportEntry {
  role: 'user' | 'model'
  text: string
  citations?: RagCitation[]
  isError?: boolean
}

const escText = (s: string): string => s.replace(/([\\[\]])/g, '\\$1')

/** Đường dẫn của trích dẫn tương đối với thư mục gốc (phân cách `/`); file ngoài thư mục thì dùng relPath. */
function citationRel(c: RagCitation, rootDir: string | null): string {
  const root = rootDir?.replace(/[\\/]+$/, '') ?? ''
  const inRoot = root !== '' && c.filePath.startsWith(root) && /^[\\/]/.test(c.filePath.slice(root.length))
  return (inRoot ? c.filePath.slice(root.length + 1) : c.relPath).replace(/\\/g, '/')
}

function citationLine(c: RagCitation, rootDir: string | null): string {
  if (c.filePath === PASTE_PATH) return `- Dán từ clipboard › ${escText(c.sectionTitle)}`
  const rel = citationRel(c, rootDir)
  // Khoảng trắng / ngoặc trong tên file: bọc <...> (CommonMark) để link không vỡ
  const dest = /[\s()]/.test(rel) ? `<${rel}>` : rel
  return `- [${escText(rel)} › ${escText(c.sectionTitle)}](${dest})`
}

/** Markdown của cuộc trò chuyện: mỗi câu hỏi một mục `##` (trích dạng quote), câu trả lời giữ nguyên Markdown,
 * trích dẫn thành link tương đối tới file nguồn. Câu trả lời lỗi bị bỏ. */
export function chatToMarkdown(entries: readonly ChatExportEntry[], rootDir: string | null): string {
  const out: string[] = ['# Trò chuyện Trợ lý AI', '']
  if (rootDir) out.push(`Thư mục: \`${rootDir}\``, '')
  let n = 0
  for (const e of entries) {
    if (e.isError) continue
    if (e.role === 'user') {
      out.push(`## Câu hỏi ${++n}`, '', ...e.text.trim().split('\n').map((l) => (l ? `> ${l}` : '>')), '')
      continue
    }
    out.push('### Trả lời', '', e.text.trim(), '')
    if (e.citations && e.citations.length > 0) {
      out.push('**Nguồn:**', '', ...e.citations.map((c) => citationLine(c, rootDir)), '')
    }
  }
  return out.join('\n').trimEnd() + '\n'
}
