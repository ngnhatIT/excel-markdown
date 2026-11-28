/* Embedding cho tìm kiếm theo nghĩa của Trợ lý AI (tùy chọn, mặc định tắt): Gemini và OpenAI; Claude không có API
 * embedding. Bật thì MỌI mục của thư mục được gửi tới nhà cung cấp để lấy vector (khi tắt chỉ gửi đoạn liên quan).
 * shortcut: vector chỉ nhớ trong bộ nhớ (mở lại app thì tính lại); ghi ra đĩa khi thư mục lớn làm câu hỏi đầu quá chậm.
 */
import { createHash } from 'node:crypto'
import type { AiProvider } from '../../../../shared/types'
import { mt } from '../../../i18nMain'
import { errorMessageOf, postJsonWithRetry, redactApiKey } from './shared'

/** Số chiều yêu cầu (cả hai nhà cung cấp cho rút gọn): 256 số / mục, 20 000 mục ≈ 20 MB. */
const DIMS = 256
/** Ký tự đầu của mỗi mục được nhúng. shortcut: mục dài hơn chỉ nhúng phần đầu (giới hạn 2 048 token của Gemini). */
export const EMBED_MAX_CHARS = 2000
/** Quá số mục này thì không nhúng (chi phí / thời gian câu hỏi đầu); nơi gọi quay về tìm theo từ khóa. */
export const EMBED_MAX_TEXTS = 3000
const CACHE_MAX = 20_000

const SPEC = {
  gemini: { label: 'Gemini', model: 'gemini-embedding-001', batch: 100 },
  openai: { label: 'OpenAI', model: 'text-embedding-3-small', batch: 32 },
} as const
type EmbedProvider = keyof typeof SPEC

export const canEmbed = (p: AiProvider): p is EmbedProvider => p in SPEC

const cache = new Map<string, Float32Array>()
const cacheKey = (p: EmbedProvider, text: string): string => p + ':' + createHash('sha1').update(text).digest('base64')

async function embedBatch(p: EmbedProvider, apiKey: string, texts: string[], signal?: AbortSignal): Promise<number[][]> {
  const { label, model } = SPEC[p]
  const res = await postJsonWithRetry(
    p === 'openai'
      ? {
          url: 'https://api.openai.com/v1/embeddings',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: { model, input: texts, dimensions: DIMS },
          label,
          apiKey,
          signal,
        }
      : {
          url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
          headers: { 'x-goog-api-key': apiKey },
          body: { requests: texts.map((text) => ({ model: `models/${model}`, content: { parts: [{ text }] }, outputDimensionality: DIMS })) },
          label,
          apiKey,
          signal,
        }
  )
  if (!res.ok) throw new Error(mt('ai.apiError', { api: label, status: res.status, msg: redactApiKey(await errorMessageOf(res), apiKey) }))
  const data = (await res.json()) as { data?: { index: number; embedding: number[] }[]; embeddings?: { values: number[] }[] }
  const vecs = data.data ? [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding) : (data.embeddings ?? []).map((e) => e.values)
  if (vecs.length !== texts.length || vecs.some((v) => !Array.isArray(v) || v.length === 0)) throw new Error(mt('ai.empty', { api: label }))
  return vecs
}

/** Vector (đã chuẩn hóa độ dài 1) của từng chuỗi, theo đúng thứ tự; chuỗi đã nhúng lấy từ bộ nhớ. */
export async function embedTexts(p: EmbedProvider, apiKey: string, input: string[], signal?: AbortSignal): Promise<Float32Array[]> {
  const texts = input.map((t) => t.slice(0, EMBED_MAX_CHARS) || ' ')
  const keys = texts.map((t) => cacheKey(p, t))
  const missing = [...new Set(keys.filter((k) => !cache.has(k)))]
  const textOf = new Map(keys.map((k, i) => [k, texts[i]]))
  for (let i = 0; i < missing.length; i += SPEC[p].batch) {
    const part = missing.slice(i, i + SPEC[p].batch)
    const vecs = await embedBatch(p, apiKey, part.map((k) => textOf.get(k) as string), signal)
    part.forEach((k, n) => {
      const v = Float32Array.from(vecs[n])
      const norm = Math.hypot(...v) || 1
      cache.set(k, v.map((x) => x / norm))
    })
  }
  const out = keys.map((k) => cache.get(k) as Float32Array)
  // Dọn sau khi đã lấy kết quả: lô vừa nhúng không bị xóa trước khi dùng
  for (const k of cache.keys()) {
    if (cache.size <= CACHE_MAX) break
    cache.delete(k)
  }
  return out
}

/** Cosine của hai vector đã chuẩn hóa (khác số chiều -> 0). */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
