/* Đọc + parse file .md cho RAG, cache LRU theo mtime (dùng chung cho trợ lý AI trong app và MCP server). */
import { stat } from 'node:fs/promises'
import { isMarkdownPath } from '../../domain/guards'
import { parseMarkdownForRag, type RagDocument } from '../../domain/rag/chunker'
import { RAG_MAX_FILES, RAG_MAX_LOOSE } from '../../domain/rag/collect'
import { readMarkdownFile } from './mdFolder'

/** Đủ chứa mọi file của một câu hỏi, để hỏi lại không phải đọc/parse lại từ đầu. */
const RAG_CACHE_MAX = RAG_MAX_FILES + RAG_MAX_LOOSE
const ragDocCache = new Map<string, RagDocument>()

/** File không đọc được (quá lớn, không có quyền...) trả về null để một file hỏng không làm hỏng cả câu hỏi. */
export async function loadRagDocumentCached(absPath: string, relPath: string): Promise<RagDocument | null> {
  if (!isMarkdownPath(absPath)) return null
  try {
    const st = await stat(absPath)
    const mtime = st.mtimeMs
    const cached = ragDocCache.get(absPath)
    if (cached && cached.mtime === mtime && cached.relPath === relPath) {
      // LRU: đưa lên cuối để file đang dùng không bị đẩy ra trước file cũ
      ragDocCache.delete(absPath)
      ragDocCache.set(absPath, cached)
      return cached
    }
    const text = await readMarkdownFile(absPath)
    const doc = parseMarkdownForRag(absPath, relPath, text, mtime)
    if (ragDocCache.size >= RAG_CACHE_MAX) {
      const oldestKey = ragDocCache.keys().next().value
      if (oldestKey) ragDocCache.delete(oldestKey)
    }
    ragDocCache.set(absPath, doc)
    return doc
  } catch {
    return null
  }
}
