/* Bộ tìm kiếm lai BM25 + CJK 2-gram + Từ điển chuyên ngành Việt-Nhật & Chọn ngữ cảnh Ưu tiên Chất lượng.
 * - Khi scope = 'active': nạp 100% toàn văn file đang xem (trừ khi > 60.000 tokens thì lọc theo RagSection + outline).
 * - Khi scope = 'folder' và tổng token <= maxContextTokens (32.000): nạp 100% toàn bộ các file.
 * - Khi scope = 'folder' và vượt ngưỡng: đính kèm Sơ đồ thư mục + nạp nguyên file (Parent-Document) khớp nhất.
 */
import { estimateTokens, type RagDocument, type RagSection } from './chunker'
import { expandViJaQueryTerms } from './glossary'
import type { RagCitation } from '../../../types'

export interface RagContextResult {
  mode: 'full-active' | 'full-folder' | 'parent-rag'
  contextText: string
  citations: RagCitation[]
  tokensEst: number
  docCount: number
}

export const DEFAULT_MAX_CONTEXT_TOKENS = 32_000
export const MAX_ACTIVE_FILE_TOKENS = 60_000

const CJK_RUN_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g
const WORD_RE = /[\p{L}\p{N}_-]+/gu

/** Tách từ đa ngôn ngữ: từ Latin/Việt chữ thường + unigram & bigram (2-gram) cho chuỗi chữ Nhật/CJK. */
export function tokenizeMultiLang(text: string): string[] {
  const lower = text.toLowerCase()
  const tokens: string[] = []

  const words = lower.match(WORD_RE) ?? []
  for (const w of words) {
    if (!CJK_RUN_RE.test(w)) {
      if (w.length > 0) tokens.push(w)
    }
    CJK_RUN_RE.lastIndex = 0
  }

  const cjkRuns = lower.match(CJK_RUN_RE) ?? []
  for (const run of cjkRuns) {
    const chars = Array.from(run)
    for (let i = 0; i < chars.length; i++) {
      tokens.push(chars[i])
      if (i + 1 < chars.length) {
        tokens.push(chars[i] + chars[i + 1])
      }
    }
  }

  return tokens
}

interface WeightedTerm {
  term: string
  weight: number
}

function buildWeightedQueryTerms(query: string): WeightedTerm[] {
  const baseTokens = tokenizeMultiLang(query)
  const map = new Map<string, number>()
  for (const t of baseTokens) {
    map.set(t, Math.max(map.get(t) ?? 0, 1.0))
  }
  for (const jaPhrase of expandViJaQueryTerms(query)) {
    for (const t of tokenizeMultiLang(jaPhrase)) {
      if (!map.has(t)) map.set(t, 0.8)
    }
  }
  return Array.from(map.entries()).map(([term, weight]) => ({ term, weight }))
}

/** Văn bản cần chấm điểm. `key` là RagDocument/RagSection gốc: kết quả tách từ được nhớ theo nó. */
interface ScoreItem {
  key: object
  body: string
  header: string
}

interface TermStats {
  tf: Map<string, number>
  len: number
  headerLower: string
  bodyLower: string
}

/** Tách từ một văn bản tốn thời gian (CJK 2-gram) và chạy trên main process. RagDocument được cache theo mtime
 * ở main nên các câu hỏi sau dùng lại cùng object: chỉ tách từ một lần cho mỗi phiên bản file. */
const statsCache = new WeakMap<object, TermStats>()

function termStats(item: ScoreItem): TermStats {
  const hit = statsCache.get(item.key)
  if (hit) return hit
  const tokens = tokenizeMultiLang(item.body + ' ' + item.header)
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  const st = {
    tf,
    len: Math.max(1, tokens.length),
    headerLower: item.header.toLowerCase(),
    bodyLower: item.body.toLowerCase(),
  }
  statsCache.set(item.key, st)
  return st
}

/** Chấm điểm BM25 cho một danh sách các văn bản, có cộng điểm thưởng khi khớp mã định danh chính xác. */
function scoreItemsBm25(texts: ScoreItem[], queryTerms: WeightedTerm[], rawQuery: string): number[] {
  if (texts.length === 0 || queryTerms.length === 0) return texts.map(() => 0)
  const k1 = 1.5
  const b = 0.75

  const stats = texts.map(termStats)
  const docLengths = stats.map((s) => s.len)
  const df = new Map<string, number>()
  for (const { tf } of stats) for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1)

  const avgDl = docLengths.reduce((a, c) => a + c, 0) / texts.length
  const idCodes = (rawQuery.match(/[A-Za-z]{2,6}[-_]?\d{1,5}|[A-Za-z]+_[A-Za-z0-9_]+/g) ?? []).map((x) =>
    x.toLowerCase()
  )

  return stats.map(({ tf: tfMap, len: dl, headerLower, bodyLower }) => {
    let score = 0

    for (const { term, weight } of queryTerms) {
      const f = tfMap.get(term) ?? 0
      if (f === 0) continue
      const n = df.get(term) ?? 0
      const idf = Math.log(1 + (texts.length - n + 0.5) / (n + 0.5))
      const num = f * (k1 + 1)
      const den = f + k1 * (1 - b + b * (dl / avgDl))
      let termScore = idf * (num / den) * weight
      if (headerLower.includes(term)) termScore *= 1.8
      score += termScore
    }

    for (const code of idCodes) {
      if (headerLower.includes(code)) score += 6.0
      else if (bodyLower.includes(code)) score += 3.5
    }

    return score
  })
}

const sectionItem = (s: RagSection): ScoreItem => ({ key: s, body: s.content, header: s.metaHeader + ' ' + s.sectionTitle })

/** Phần ngân sách token tối đa cho sơ đồ thư mục (phần còn lại để nạp nội dung thật). */
const CATALOG_SHARE = 0.2

function formatFullDocBlock(doc: RagDocument): string {
  const firstSection = doc.sections[0]?.sectionTitle ?? 'Tổng quan'
  return `=== TÀI LIỆU: ${doc.relPath} | MỤC: ${firstSection} ===\n${doc.metaHeader}\n${doc.fullContent}`
}

function formatSectionBlock(sec: RagSection): string {
  return `=== TÀI LIỆU: ${sec.relPath} | MỤC: ${sec.sectionTitle} ===\n${sec.metaHeader}\n${sec.content}`
}

/** Xây dựng ngữ cảnh gửi cho model AI theo chiến lược Ưu tiên Chất lượng (Quality-First). */
export function buildRagContext(
  docs: RagDocument[],
  query: string,
  opts: { scope: 'folder' | 'active'; activeFilePath?: string; maxContextTokens?: number }
): RagContextResult {
  const maxTokens = opts.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS
  // Mức ngữ cảnh người dùng chọn lớn hơn thì file đang xem cũng được nạp nguyên văn tới mức đó
  const activeMax = Math.max(MAX_ACTIVE_FILE_TOKENS, maxTokens)
  const nonEmptyDocs = docs.filter((d) => d.tokensEst > 0)

  if (nonEmptyDocs.length === 0) {
    return { mode: 'full-folder', contextText: '', citations: [], tokensEst: 0, docCount: 0 }
  }

  // 1. Chế độ "Chỉ file đang xem": ưu tiên 100% toàn văn file đó (trừ khi vượt 60_000 tokens thì lọc theo RagSection + outline)
  if (opts.scope === 'active') {
    const target =
      nonEmptyDocs.find((d) => d.filePath === opts.activeFilePath) ?? nonEmptyDocs[0]

    if (target.tokensEst > activeMax && target.sections.length > 1) {
      const outlineBlock = `=== MỤC LỤC FILE ĐANG XEM: ${target.relPath} ===\n${target.metaHeader}\nMục: ${target.outline.join(', ')}`
      let usedTokens = estimateTokens(outlineBlock)
      const queryTerms = buildWeightedQueryTerms(query)
      const secScores = scoreItemsBm25(
        target.sections.map(sectionItem),
        queryTerms,
        query
      )
      const rankedSecs = target.sections
        .map((sec, idx) => ({ sec, score: secScores[idx] }))
        .sort((a, b) => b.score - a.score)

      const blocks: string[] = [outlineBlock]
      const citations: RagCitation[] = []
      for (const { sec } of rankedSecs) {
        if (usedTokens + sec.tokensEst > activeMax && citations.length > 0) continue
        blocks.push(formatSectionBlock(sec))
        usedTokens += sec.tokensEst + 8
        citations.push({
          filePath: sec.filePath,
          relPath: sec.relPath,
          sheetName: sec.sheetName,
          sectionTitle: sec.sectionTitle,
        })
        if (citations.length >= 8) break
      }
      const contextText = blocks.join('\n\n')
      return {
        mode: 'full-active',
        contextText,
        citations,
        tokensEst: estimateTokens(contextText),
        docCount: 1,
      }
    }

    const citations: RagCitation[] = (target.sections.length > 0
      ? target.sections
      : [
          {
            filePath: target.filePath,
            relPath: target.relPath,
            sheetName: target.relPath,
            sectionTitle: 'Tổng quan',
          },
        ]
    ).map((s) => ({
      filePath: s.filePath,
      relPath: s.relPath,
      sheetName: s.sheetName,
      sectionTitle: s.sectionTitle,
    }))
    const contextText = formatFullDocBlock(target)
    return {
      mode: 'full-active',
      contextText,
      citations: citations.slice(0, 8),
      tokensEst: estimateTokens(contextText),
      docCount: 1,
    }
  }

  // 2. Chế độ "Cả thư mục": nếu tổng token <= maxTokens thì nạp 100% toàn văn mọi file
  const totalTokens = nonEmptyDocs.reduce((sum, d) => sum + d.tokensEst + 12, 0)
  if (totalTokens <= maxTokens) {
    const blocks = nonEmptyDocs.map(formatFullDocBlock)
    const citations: RagCitation[] = nonEmptyDocs.map((d) => ({
      filePath: d.filePath,
      relPath: d.relPath,
      sheetName: d.sections[0]?.sheetName ?? d.relPath,
      sectionTitle: d.sections[0]?.sectionTitle ?? 'Tổng quan',
    }))
    const contextText = blocks.join('\n\n')
    return {
      mode: 'full-folder',
      contextText,
      citations,
      tokensEst: estimateTokens(contextText),
      docCount: nonEmptyDocs.length,
    }
  }

  // 3. Thư mục lớn (> maxTokens): Parent-Document RAG kết hợp Sơ đồ thư mục
  const budget = Math.max(500, maxTokens)
  const queryTerms = buildWeightedQueryTerms(query)
  const docScores = scoreItemsBm25(
    nonEmptyDocs.map((d) => ({ key: d, body: d.fullContent, header: d.metaHeader + ' ' + d.outline.join(' ') })),
    queryTerms,
    query
  )

  const rankedDocs = nonEmptyDocs
    .map((doc, idx) => ({ doc, score: docScores[idx] }))
    .sort((a, b) => b.score - a.score)

  // Sơ đồ thư mục theo thứ tự khớp, tối đa CATALOG_SHARE ngân sách: thư mục lớn không để sơ đồ chiếm hết chỗ của nội dung
  const catalogLines = ['=== SƠ ĐỒ TỔNG QUAN THƯ MỤC ===']
  let catalogTokens = estimateTokens(catalogLines[0])
  let listed = 0
  for (const { doc: d } of rankedDocs) {
    const line = `- ${d.metaHeader}${d.outline.length > 0 ? ' · Mục: ' + d.outline.join(', ') : ''}`
    if (catalogTokens + estimateTokens(line) > budget * CATALOG_SHARE) break
    catalogLines.push(line)
    catalogTokens += estimateTokens(line)
    listed++
  }
  if (listed < rankedDocs.length) catalogLines.push(`- … và ${rankedDocs.length - listed} file khác (ít liên quan hơn)`)
  const catalogBlock = catalogLines.join('\n')
  let usedTokens = estimateTokens(catalogBlock)

  const blocks: string[] = [catalogBlock]
  const citations: RagCitation[] = []
  const includedDocPaths = new Set<string>()
  let docCount = 0

  // Ưu tiên nạp NGUYÊN FILE (Parent-Document) cho các file khớp cao nhất
  for (const { doc } of rankedDocs) {
    if (usedTokens + doc.tokensEst <= budget || blocks.length === 1) {
      if (doc.tokensEst <= budget) {
        blocks.push(formatFullDocBlock(doc))
        usedTokens += doc.tokensEst + 10
        includedDocPaths.add(doc.filePath)
        docCount++
        citations.push({
          filePath: doc.filePath,
          relPath: doc.relPath,
          sheetName: doc.sections[0]?.sheetName ?? doc.relPath,
          sectionTitle: doc.sections[0]?.sectionTitle ?? 'Tổng quan',
        })
      }
    }
  }

  // Phần ngân sách còn lại nạp các RagSection điểm cao từ các file chưa được nạp nguyên văn
  const remainingSections = nonEmptyDocs
    .filter((d) => !includedDocPaths.has(d.filePath))
    .flatMap((d) => d.sections)

  if (remainingSections.length > 0 && usedTokens < budget) {
    const secScores = scoreItemsBm25(
      remainingSections.map(sectionItem),
      queryTerms,
      query
    )
    const rankedSecs = remainingSections
      .map((sec, idx) => ({ sec, score: secScores[idx] }))
      .sort((a, b) => b.score - a.score)

    for (const { sec, score } of rankedSecs) {
      if (score <= 0 && citations.length > 0) break
      if (usedTokens + sec.tokensEst > budget && citations.length > 0) continue
      blocks.push(formatSectionBlock(sec))
      usedTokens += sec.tokensEst + 8
      if (!includedDocPaths.has(sec.filePath)) {
        includedDocPaths.add(sec.filePath)
        docCount++
      }
      citations.push({
        filePath: sec.filePath,
        relPath: sec.relPath,
        sheetName: sec.sheetName,
        sectionTitle: sec.sectionTitle,
      })
      if (citations.length >= 12) break
    }
  }

  const contextText = blocks.join('\n\n')
  return {
    mode: 'parent-rag',
    contextText,
    citations,
    tokensEst: estimateTokens(contextText),
    docCount: Math.max(1, docCount),
  }
}
