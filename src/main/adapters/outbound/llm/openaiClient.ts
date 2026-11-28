/* Client OpenAI (gồm cả model Codex) qua Responses API, stream SSE.
 * Khối <context> nằm trong `instructions` nên OpenAI tự cache tiền tố khi hỏi tiếp trên cùng tài liệu. */
import { mt } from '../../../i18nMain'
import type { AiChatTurn, AiModelId, AiUsage } from '../../../../shared/types'
import { errorMessageOf, postJsonWithRetry, readSse, redactApiKey, systemWithContext, trimHistory } from './shared'

const BASE = 'https://api.openai.com/v1'

export function buildOpenAiRequestBody(
  model: AiModelId,
  question: string,
  contextText: string,
  history: AiChatTurn[] = [],
  system?: string
): Record<string, unknown> {
  return {
    model,
    instructions: systemWithContext(contextText, system),
    input: [
      ...trimHistory(history).map((h) => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text })),
      { role: 'user', content: question.trim() },
    ],
    stream: true,
    store: false, // không lưu hội thoại trên máy chủ OpenAI
  }
}

interface OpenAiResponse {
  status?: string
  model?: string
  incomplete_details?: { reason?: string } | null
  error?: { message?: string } | null
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number; input_tokens_details?: { cached_tokens?: number } }
}

interface OpenAiEvent {
  type?: string
  delta?: string
  message?: string
  response?: OpenAiResponse
}

export async function callOpenAiApi(opts: {
  apiKey: string
  model: AiModelId
  question: string
  contextText: string
  history: AiChatTurn[]
  signal?: AbortSignal
  onDelta?: (text: string) => void
  system?: string
}): Promise<{ text: string; usage?: AiUsage }> {
  const key = opts.apiKey.trim()
  if (!key) throw new Error(mt('ai.noKey', { api: 'OpenAI' }))
  const res = await postJsonWithRetry({
    url: `${BASE}/responses`,
    headers: { Authorization: `Bearer ${key}` },
    body: buildOpenAiRequestBody(opts.model, opts.question, opts.contextText, opts.history, opts.system),
    label: 'OpenAI',
    apiKey: key,
    signal: opts.signal,
  })
  if (!res.ok) {
    const msg = redactApiKey(await errorMessageOf(res), key)
    if (res.status === 401 || res.status === 403) throw new Error(mt('ai.badKey', { api: 'OpenAI', status: res.status, msg }))
    if (res.status === 404) throw new Error(mt('ai.badModel', { model: `"${opts.model}"` }))
    if (res.status === 429) throw new Error(mt('ai.rateLimit', { api: 'OpenAI', msg: ' ' + msg }))
    throw new Error(mt('ai.apiError', { api: 'OpenAI', status: res.status, msg }))
  }

  let text = ''
  let final: OpenAiResponse | undefined
  await readSse(
    res,
    (data) => {
      const ev = JSON.parse(data) as OpenAiEvent
      if (ev.type === 'response.output_text.delta' && ev.delta) {
        text += ev.delta
        opts.onDelta?.(ev.delta)
      } else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') {
        final = ev.response
      } else if (ev.type === 'response.failed') {
        throw new Error(mt('ai.apiFail', { api: 'OpenAI', msg: redactApiKey(ev.response?.error?.message ?? 'response.failed', key) }))
      } else if (ev.type === 'error') {
        throw new Error(mt('ai.apiFail', { api: 'OpenAI', msg: redactApiKey(ev.message ?? '?', key) }))
      }
    },
    opts.signal
  )

  text = text.trim()
  if (!text) throw new Error(mt('ai.empty', { api: 'OpenAI' }))
  if (final?.status === 'incomplete') {
    text += '\n\n' + mt('ai.incomplete', { reason: final.incomplete_details?.reason ?? 'incomplete' })
  }
  const u = final?.usage
  const usage =
    u && typeof u.total_tokens === 'number'
      ? {
          promptTokens: u.input_tokens ?? 0,
          completionTokens: u.output_tokens ?? 0,
          totalTokens: u.total_tokens,
          cachedTokens: u.input_tokens_details?.cached_tokens,
        }
      : undefined
  return { text, usage }
}

/** Chỉ giữ model sinh văn bản (gpt-*, o*, codex), bỏ audio/ảnh/embedding... và bản có ngày (`gpt-5-2025-08-07`
 * trùng với tên gọn `gpt-5`); mới phát hành lên đầu theo trường `created` của API. */
export function filterOpenAiModels(models: { id?: string; created?: number }[]): string[] {
  const keep = /^(gpt-|o\d|codex|chatgpt-)/i
  const skip = /(audio|realtime|tts|transcribe|image|search|embedding|moderation|dall-e|whisper|instruct)/i
  const snapshot = /-\d{4}-\d{2}-\d{2}$/
  const created = new Map<string, number>()
  for (const m of models) {
    const id = m.id ?? ''
    if (keep.test(id) && !skip.test(id) && !snapshot.test(id)) created.set(id, m.created ?? 0)
  }
  return Array.from(created.keys()).sort((a, b) => (created.get(b) ?? 0) - (created.get(a) ?? 0) || a.localeCompare(b))
}

export async function listOpenAiModels(apiKey: string): Promise<string[]> {
  const key = apiKey.trim()
  if (!key) throw new Error(mt('ai.noKey', { api: 'OpenAI' }))
  let res: Response
  try {
    res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${key}` } })
  } catch (err) {
    throw new Error(mt('ai.connect', { api: 'OpenAI', msg: redactApiKey(String(err), key) }))
  }
  if (!res.ok) {
    throw new Error(mt('ai.modelsFailed', { status: res.status, msg: redactApiKey(await errorMessageOf(res), key) }))
  }
  const data = (await res.json()) as { data?: { id?: string; created?: number }[] }
  return filterOpenAiModels(data.data ?? [])
}
