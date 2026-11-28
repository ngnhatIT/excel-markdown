/* Client Claude (Anthropic API) qua SDK chính thức, stream câu trả lời.
 * Khối <context> nằm ở system kèm cache_control: hỏi tiếp trên cùng tài liệu thì phần này đọc từ cache (rẻ ~10 lần). */
import { mt } from '../../../i18nMain'
import Anthropic from '@anthropic-ai/sdk'
import type { AiChatTurn, AiModelId, AiUsage } from '../../../../shared/types'
import { contextBlock, redactApiKey, SYSTEM_INSTRUCTION, trimHistory, USER_ABORT_MSG } from './shared'

/** Model nhận `fallbacks: "default"`: khi bộ lọc an toàn từ chối nhầm, API tự chạy lại trên model phù hợp. */
const FALLBACK_MODELS = /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/

export function buildClaudeParams(
  model: AiModelId,
  question: string,
  contextText: string,
  history: AiChatTurn[] = [],
  instruction = SYSTEM_INSTRUCTION
): Anthropic.Beta.Messages.MessageCreateParamsNonStreaming {
  const ctx = contextBlock(contextText)
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: instruction }]
  if (ctx) system.push({ type: 'text', text: ctx, cache_control: { type: 'ephemeral' } })
  const messages: Anthropic.Beta.BetaMessageParam[] = trimHistory(history).map((h) => ({
    role: h.role === 'model' ? 'assistant' : 'user',
    content: h.text,
  }))
  messages.push({ role: 'user', content: question.trim() })
  return {
    model,
    max_tokens: 32_000,
    system,
    messages,
    ...(FALLBACK_MODELS.test(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  }
}

function friendlyClaudeError(err: unknown, key: string): Error {
  if (err instanceof Anthropic.APIUserAbortError) return new Error(USER_ABORT_MSG)
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new Error(mt('ai.timeout', { api: 'Claude', secs: '' }))
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new Error(mt('ai.badKey', { api: 'Claude', status: err.status, msg: redactApiKey(err.message, key) }))
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new Error(mt('ai.badModel', { model: 'Claude' }))
  }
  if (err instanceof Anthropic.RateLimitError) return new Error(mt('ai.rateLimit', { api: 'Claude', msg: '' }))
  if (err instanceof Anthropic.APIConnectionError) return new Error(mt('ai.connect', { api: 'Claude', msg: redactApiKey(err.message, key) }))
  if (err instanceof Anthropic.APIError) return new Error(mt('ai.apiError', { api: 'Claude', status: err.status ?? '?', msg: redactApiKey(err.message, key) }))
  return new Error(redactApiKey(err instanceof Error ? err.message : String(err), key))
}

export async function callClaudeApi(opts: {
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
  if (!key) throw new Error(mt('ai.noKey', { api: 'Claude' }))
  const client = new Anthropic({ apiKey: key, timeout: 120_000, maxRetries: 2 })
  let msg: Anthropic.Beta.BetaMessage
  try {
    const stream = client.beta.messages.stream(buildClaudeParams(opts.model, opts.question, opts.contextText, opts.history, opts.system), {
      signal: opts.signal,
    })
    if (opts.onDelta) stream.on('text', opts.onDelta)
    msg = await stream.finalMessage()
  } catch (err) {
    if (opts.signal?.aborted) throw new Error(USER_ABORT_MSG)
    throw friendlyClaudeError(err, key)
  }

  if (msg.stop_reason === 'refusal') {
    throw new Error(mt('ai.blocked', { api: 'Claude', reason: 'refusal' }))
  }
  let text = msg.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
  if (!text) throw new Error(mt('ai.empty', { api: 'Claude' }))
  if (msg.stop_reason === 'max_tokens') text += '\n\n' + mt('ai.maxTokens')
  // Khối `fallback` mới là dấu hiệu chắc chắn; so msg.model sai khi chọn alias (API trả về id bản cụ thể)
  if (msg.content.some((b) => b.type === 'fallback')) {
    text += '\n\n' + mt('ai.fallbackModel', { model: opts.model, used: msg.model })
  }

  const u = msg.usage
  const cached = u.cache_read_input_tokens ?? 0
  const prompt = u.input_tokens + cached + (u.cache_creation_input_tokens ?? 0)
  return {
    text,
    usage: { promptTokens: prompt, completionTokens: u.output_tokens, totalTokens: prompt + u.output_tokens, cachedTokens: cached },
  }
}

/** Model Claude mà key dùng được, mới nhất trước (thứ tự của Models API). */
export async function listClaudeModels(apiKey: string): Promise<string[]> {
  const key = apiKey.trim()
  if (!key) throw new Error(mt('ai.noKey', { api: 'Claude' }))
  const client = new Anthropic({ apiKey: key, timeout: 30_000 })
  const ids: string[] = []
  try {
    for await (const m of client.models.list()) if (m.id.startsWith('claude-')) ids.push(m.id)
  } catch (err) {
    throw friendlyClaudeError(err, key)
  }
  return ids
}
