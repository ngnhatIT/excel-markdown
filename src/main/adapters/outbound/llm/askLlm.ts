/* Điểm vào duy nhất cho tiến trình main: chọn nhà cung cấp, gọi model, bóc trích dẫn. */
import type { AiChatTurn, AiModelId, AiProvider, AiUsage, RagCitation } from '../../../../types'
import { callGeminiApi, listGeminiModels } from '../gemini/geminiClient'
import { callClaudeApi, listClaudeModels } from './claudeClient'
import { callOpenAiApi, listOpenAiModels } from './openaiClient'
import { extractCitationsFromAnswer } from './shared'

export interface AskLlmOpts {
  apiKey: string
  model: AiModelId
  question: string
  contextText: string
  history: AiChatTurn[]
  availableCitations: RagCitation[]
  signal?: AbortSignal
  onDelta?: (text: string) => void
}

export async function askLlm(
  provider: AiProvider,
  opts: AskLlmOpts
): Promise<{ answer: string; citations: RagCitation[]; usage?: AiUsage }> {
  if (provider === 'gemini') return callGeminiApi(opts)
  const { text, usage } = provider === 'claude' ? await callClaudeApi(opts) : await callOpenAiApi(opts)
  const { cleanAnswer, citations } = extractCitationsFromAnswer(text, opts.availableCitations)
  return { answer: cleanAnswer, citations, usage }
}

export function listModels(provider: AiProvider, apiKey: string): Promise<string[]> {
  if (provider === 'claude') return listClaudeModels(apiKey)
  if (provider === 'openai') return listOpenAiModels(apiKey)
  return listGeminiModels(apiKey)
}
