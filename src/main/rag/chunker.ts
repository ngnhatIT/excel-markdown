/* Bộ phân tích cấu trúc tài liệu Markdown & Nén không mất dữ liệu (Lossless Prompt Compression)
 * phục vụ Trợ lý AI (Gemini RAG). Giữ nguyên 100% nội dung bảng, lịch sử 版数 và ghi chú ※.
 */

export interface RagSection {
  id: string
  filePath: string
  relPath: string
  sheetName: string
  sectionTitle: string
  metaHeader: string
  content: string
  tokensEst: number
}

export interface RagDocument {
  filePath: string
  relPath: string
  mtime: number
  metaHeader: string
  outline: string[]
  fullContent: string
  tokensEst: number
  sections: RagSection[]
}

/** Ước lượng số token (~ 1 token cho mỗi 3 ký tự đối với văn bản trộn Nhật - Việt - Anh). */
export function estimateTokens(text: string): number {
  const t = text.trim()
  return t.length === 0 ? 0 : Math.max(1, Math.ceil(t.length / 3))
}

const unescapeHeading = (s: string): string => s.replace(/\\([#*~_`[\]()<>|-])/g, '$1').trim()

/** Thu gọn khoảng trắng đệm căn cột trong bảng Markdown và gộp các dòng trống thừa
 * mà KHÔNG làm mất bất kỳ dòng dữ liệu, bảng 版数 hay ghi chú ※ nào. */
export function compressMarkdownLossless(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length >= 3) {
      const cells = trimmed
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((c) => c.trim())
      if (cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))) {
        out.push('|' + cells.map(() => '---').join('|') + '|')
        continue
      }
      out.push('| ' + cells.join(' | ') + ' |')
      continue
    }
    out.push(rawLine.replace(/[ \t]+$/g, ''))
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Bóc tách khối YAML front-matter ở đầu file (nếu có) và trả về phần thân còn lại. */
function stripFrontMatter(md: string): { fmLines: string[]; body: string } {
  if (!md.startsWith('---\n')) return { fmLines: [], body: md }
  const endIdx = md.indexOf('\n---\n', 4)
  if (endIdx < 0) return { fmLines: [], body: md }
  const fmBlock = md.slice(4, endIdx).trim()
  const body = md.slice(endIdx + 5).trim()
  return { fmLines: fmBlock ? fmBlock.split('\n') : [], body }
}

/** Phân tích một file Markdown thành RagDocument kèm danh sách các RagSection theo ## / ###. */
export function parseMarkdownForRag(
  filePath: string,
  relPath: string,
  rawMd: string,
  mtime = 0
): RagDocument {
  const fullContent = compressMarkdownLossless(rawMd)
  if (!fullContent) {
    return {
      filePath,
      relPath,
      mtime,
      metaHeader: `[${relPath}]`,
      outline: [],
      fullContent: '',
      tokensEst: 0,
      sections: [],
    }
  }

  const { body } = stripFrontMatter(fullContent)
  const lines = body.split('\n')
  const metaParts: string[] = [relPath]
  const outline: string[] = []

  for (const line of lines) {
    if (line.startsWith('> 基本設計：')) {
      const docTitle = line.slice('> 基本設計：'.length).trim()
      if (docTitle && metaParts.length < 6) metaParts.push(docTitle)
    } else if (line.startsWith('- **')) {
      const m = /^-\s+\*\*([^*]+)\*\*:\s*(.+)$/.exec(line)
      if (m && metaParts.length < 7) {
        metaParts.push(`${m[1].trim()}: ${m[2].trim()}`)
      }
    }
    const hMatch = /^(#{2,3})\s+(.+)$/.exec(line)
    if (hMatch) {
      outline.push(unescapeHeading(hMatch[2]))
    }
  }

  const metaHeader = '[' + metaParts.join(' | ').slice(0, 220) + ']'
  const defaultSheet = relPath.replace(/\.(md|markdown)$/i, '')

  const sections: RagSection[] = []
  let currentSheet = defaultSheet
  let currentSection = 'Tổng quan'
  let buf: string[] = []

  const flush = (): void => {
    const content = buf.join('\n').trim()
    buf = []
    if (!content) return
    const idx = sections.length
    sections.push({
      id: `${relPath}#${idx}`,
      filePath,
      relPath,
      sheetName: currentSheet,
      sectionTitle: currentSection,
      metaHeader,
      content,
      tokensEst: estimateTokens(content),
    })
  }

  for (const line of lines) {
    const h2 = /^##\s+(.+)$/.exec(line)
    if (h2) {
      flush()
      currentSheet = unescapeHeading(h2[1]) || defaultSheet
      currentSection = 'Tổng quan'
      buf.push(line)
      continue
    }
    const h3 = /^###\s+(.+)$/.exec(line)
    if (h3) {
      flush()
      currentSection = unescapeHeading(h3[1]) || 'Mục'
      buf.push(line)
      continue
    }
    buf.push(line)
  }
  flush()

  return {
    filePath,
    relPath,
    mtime,
    metaHeader,
    outline,
    fullContent,
    tokensEst: estimateTokens(fullContent),
    sections,
  }
}
