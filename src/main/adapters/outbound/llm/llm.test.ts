import { afterEach, describe, expect, it, vi } from 'vitest'
import { callGeminiApi } from './geminiClient'
import { buildClaudeParams } from './claudeClient'
import { buildOpenAiRequestBody, callOpenAiApi, filterOpenAiModels } from './openaiClient'
import { readSse, redactApiKey, trimHistory } from './shared'

const sse = (events: unknown[]): Response =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join(''), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('shared', () => {
  it('che key Claude và OpenAI trong thông báo lỗi', () => {
    const out = redactApiKey('a sk-ant-api03-AAAAAAAAAAAAAAAA b sk-proj-BBBBBBBBBBBBBBBBBBBB')
    expect(out).toBe('a sk-ant-*** b sk-***')
  })

  it('che key Gemini dạng mới AQ.… dù không truyền key', () => {
    expect(redactApiKey('lỗi với key AQ.Ab8RN6LrEMxxxxxxxxxxxxxxxxxxxx tại x')).toBe('lỗi với key AQ.*** tại x')
  })

  it('trimHistory bỏ message trả lời đứng đầu (Claude bắt buộc mở đầu bằng user)', () => {
    const h = trimHistory([
      { role: 'model', text: 'a' },
      { role: 'user', text: 'b' },
      { role: 'model', text: '' },
    ])
    expect(h).toEqual([{ role: 'user', text: 'b' }])
  })

  it('readSse ghép sự kiện bị cắt giữa các chunk', async () => {
    const enc = new TextEncoder()
    const body = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('data: {"a":'))
        c.enqueue(enc.encode('1}\n\ndata: [DONE]\n\n'))
        c.close()
      },
    })
    const got: string[] = []
    await readSse(new Response(body), (d) => got.push(d))
    expect(got).toEqual(['{"a":1}'])
  })

  it('readSse nhận đúng ranh giới CRLF bị cắt giữa "\\r" và "\\n"', async () => {
    const enc = new TextEncoder()
    const body = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('data: {"a":1}\r\n\r'))
        c.enqueue(enc.encode('\ndata: {"b":2}\r\n\r\n'))
        c.close()
      },
    })
    const got: string[] = []
    await readSse(new Response(body), (d) => got.push(d))
    expect(got).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('readSse báo lỗi khi luồng đứng im quá idleMs', async () => {
    const body = new ReadableStream({ start() {} }) // không bao giờ gửi dữ liệu
    await expect(readSse(new Response(body), () => {}, undefined, 20)).rejects.toThrow('bị ngắt')
  })
})

describe('Claude', () => {
  it('context nằm ở system có cache_control, câu hỏi là message cuối; bật fallbacks cho model hỗ trợ', () => {
    const p = buildClaudeParams('claude-opus-5-5', ' Hỏi? ', 'NỘI DUNG', [{ role: 'model', text: 'x' }, { role: 'user', text: 'u' }, { role: 'model', text: 'm' }]) as unknown as {
      system: { text: string; cache_control?: unknown }[]
      messages: { role: string; content: string }[]
      fallbacks?: string
      betas?: string[]
    }
    expect(p.system[1]).toEqual({ type: 'text', text: '<context>\nNỘI DUNG\n</context>', cache_control: { type: 'ephemeral' } })
    expect(p.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(p.messages[2].content).toBe('Hỏi?')
    expect(p.fallbacks).toBe('default')
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01'])
  })

  it('model không hỗ trợ fallbacks thì không gửi; không có context thì không có khối cache', () => {
    const p = buildClaudeParams('claude-haiku-4-5', 'q', '', []) as unknown as Record<string, unknown> & { system: unknown[] }
    expect(p.fallbacks).toBeUndefined()
    expect(p.system).toHaveLength(1)
  })
})

describe('OpenAI', () => {
  it('body Responses API: context trong instructions, không lưu hội thoại', () => {
    const b = buildOpenAiRequestBody('gpt-5', 'q', 'CTX', [{ role: 'user', text: 'a' }, { role: 'model', text: 'b' }]) as {
      instructions: string
      input: { role: string }[]
      store: boolean
      stream: boolean
    }
    expect(b.instructions).toContain('<context>\nCTX\n</context>')
    expect(b.input.map((i) => i.role)).toEqual(['user', 'assistant', 'user'])
    expect(b.store).toBe(false)
    expect(b.stream).toBe(true)
  })

  it('stream: gọi onDelta từng đoạn, đọc usage + cached tokens, key đi trong header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sse([
        { type: 'response.output_text.delta', delta: 'Xin ' },
        { type: 'response.output_text.delta', delta: 'chào' },
        {
          type: 'response.completed',
          response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12, input_tokens_details: { cached_tokens: 8 } } },
        },
      ])
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const deltas: string[] = []
    const res = await callOpenAiApi({ apiKey: 'sk-test1234567890', model: 'gpt-5', question: 'hi', contextText: '', history: [], onDelta: (t) => deltas.push(t) })
    expect(deltas).toEqual(['Xin ', 'chào'])
    expect(res.text).toBe('Xin chào')
    expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 2, totalTokens: 12, cachedTokens: 8 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test1234567890')
  })

  it('401 -> lỗi key không hợp lệ, không lộ key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Incorrect API key provided: sk-test1234567890' } }), { status: 401 })
    ) as unknown as typeof fetch
    const p = callOpenAiApi({ apiKey: 'sk-test1234567890', model: 'gpt-5', question: 'hi', contextText: '', history: [] })
    await expect(p).rejects.toThrow('không hợp lệ')
    await expect(p).rejects.not.toThrow('sk-test1234567890')
  })

  it('lọc danh sách model: giữ gpt/o/codex, bỏ audio/embedding và bản có ngày, mới phát hành lên đầu', () => {
    expect(
      filterOpenAiModels([
        { id: 'o3', created: 100 },
        { id: 'gpt-5', created: 300 },
        { id: 'gpt-5-2025-08-07', created: 300 },
        { id: 'gpt-5-codex', created: 400 },
        { id: 'o4-mini', created: 200 },
        { id: 'text-embedding-3-large', created: 500 },
        { id: 'gpt-4o-audio-preview', created: 500 },
        { id: 'whisper-1', created: 500 },
      ])
    ).toEqual(['gpt-5-codex', 'gpt-5', 'o4-mini', 'o3'])
  })
})

describe('Gemini stream', () => {
  it('gộp các chunk SSE, gọi onDelta và đọc cachedContentTokenCount', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      sse([
        { candidates: [{ content: { parts: [{ text: 'Một ' }] } }] },
        {
          candidates: [{ content: { parts: [{ text: 'hai' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7, cachedContentTokenCount: 4 },
        },
      ])
    ) as unknown as typeof fetch
    const deltas: string[] = []
    const res = await callGeminiApi({
      apiKey: 'AIzaSyFakeKey123456789',
      model: 'gemini-2.5-flash',
      question: 'q',
      contextText: '',
      history: [],
      onDelta: (t) => deltas.push(t),
    })
    expect(deltas).toEqual(['Một ', 'hai'])
    expect(res.text).toBe('Một hai')
    expect(res.usage?.cachedTokens).toBe(4)
  })
})
