/* Chọn tài liệu cho một câu hỏi AI từ yêu cầu của renderer (thuần, test được không cần Electron).
 * Mọi đường dẫn từ renderer được kiểm: chỉ file .md tuyệt đối, file theo thư mục phải nằm trong thư mục đó.
 */
import { basename, isAbsolute, join, relative } from 'node:path'
import type { AiAskRequest } from '../../../shared/types'
import { isInsideDir, isMarkdownPath } from '../guards'
import { parseMarkdownForRag, type RagDocument } from './chunker'

/** shortcut: hỏi cả thư mục chỉ đọc RAG_MAX_FILES file đầu (chấm điểm chạy trên main) và báo số file bỏ qua;
 * nâng khi thư mục thật thường vượt mức này. */
export const RAG_MAX_FILES = 500
export const RAG_MAX_LOOSE = 100

/** Đường dẫn giả của bản Markdown dán từ clipboard (trùng PASTE_PATH ở renderer). */
export const PASTE_ID = 'clipboard:paste'

export type LoadRagDoc = (absPath: string, relPath: string) => Promise<RagDocument | null>

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export async function collectRagDocuments(
  req: AiAskRequest,
  load: LoadRagDoc
): Promise<{ docs: RagDocument[]; skippedFiles: number }> {
  const isPasteActive = req.activeFilePath === PASTE_ID
  const pasteText =
    typeof req.pastedMarkdown === 'string' && req.pastedMarkdown.trim() !== ''
      ? req.pastedMarkdown
      : isPasteActive && typeof req.activeMarkdown === 'string'
        ? req.activeMarkdown
        : ''
  const pasteDoc = (label: string, text: string): RagDocument => parseMarkdownForRag(PASTE_ID, label, text, Date.now())
  const rootDir = typeof req.rootDir === 'string' && isAbsolute(req.rootDir) ? req.rootDir : null

  if (req.scope === 'active') {
    if (isPasteActive && pasteText.trim() !== '') return { docs: [pasteDoc('Dán từ clipboard', pasteText)], skippedFiles: 0 }
    const active = req.activeFilePath
    if (isMarkdownPath(active)) {
      const path = active as string
      const rel = rootDir && isInsideDir(rootDir, path) ? relative(rootDir, path).replace(/\\/g, '/') : basename(path)
      const d = await load(path, rel)
      return { docs: d ? [d] : [], skippedFiles: 0 }
    }
    if (typeof req.activeMarkdown === 'string' && req.activeMarkdown.trim() !== '') {
      return { docs: [pasteDoc('Tài liệu đang xem', req.activeMarkdown)], skippedFiles: 0 }
    }
    return { docs: [], skippedFiles: 0 }
  }

  const allRel = rootDir ? strings(req.relFiles) : []
  const allLoose = strings(req.looseFiles).filter(isMarkdownPath)
  const rel = allRel.slice(0, RAG_MAX_FILES)
  const loose = allLoose.slice(0, RAG_MAX_LOOSE)
  const loaded = await Promise.all([
    ...rel.map((r) => {
      const abs = join(rootDir as string, ...r.split('/'))
      return isInsideDir(rootDir as string, abs) ? load(abs, r) : Promise.resolve(null)
    }),
    ...loose.map((abs) => load(abs, basename(abs))),
  ])
  const docs = loaded.filter((d): d is RagDocument => d !== null)
  if (pasteText.trim() !== '') docs.push(pasteDoc('Dán từ clipboard', pasteText))
  return { docs, skippedFiles: allRel.length - rel.length + allLoose.length - loose.length }
}
