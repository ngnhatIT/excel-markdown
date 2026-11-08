import { describe, expect, it, vi } from 'vitest'
import { buildGeminiRequestBody, callGeminiApi, filterGeminiModels } from './geminiClient'
import { extractCitationsFromAnswer, maskApiKey, redactApiKey } from './shared'

describe('redactApiKey & maskApiKey', () => {
  it('xóa sạch ?key=... và chuỗi apiKey khỏi thông báo lỗi URL/log', () => {
    const key = 'AIzaSySecretKey123456789'
    const rawErr = `Fetch failed: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key} (token=${key})`
    const safe = redactApiKey(rawErr, key)
    expect(safe).not.toContain(key)
    expect(safe).toContain('key=***')
  })

  it('maskApiKey chỉ hiện 4 ký tự đầu và 4 ký tự cuối', () => {
    expect(maskApiKey('AIzaSySecretKey1234')).toBe('AIza••••1234')
    expect(maskApiKey('')).toBe('')
  })
})

describe('buildGeminiRequestBody & extractCitationsFromAnswer', () => {
  it('giữ tối đa 6 lượt hỏi-đáp gần nhất (12 messages) và không lặp lại context cũ', () => {
    const history = Array.from({ length: 16 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'model') as 'user' | 'model',
      text: `msg-${i}`,
    }))
    const body = buildGeminiRequestBody('Câu hỏi mới', '=== TÀI LIỆU: A.md ===\nNội dung', history) as {
      contents: { role: string; parts: { text: string }[] }[]
    }
    // 12 history messages + 1 current user message = 13
    expect(body.contents).toHaveLength(13)
    expect(body.contents[0].parts[0].text).toBe('msg-4')
    expect(body.contents[12].parts[0].text).toContain('Câu hỏi mới')
  })

  it('trích xuất đúng trích dẫn từ thẻ [[relPath | sectionTitle]] trong câu trả lời của Gemini', () => {
    const pool = [
      { filePath: '/a/SC001.md', relPath: 'SC001.md', sheetName: 'SC001', sectionTitle: '【項目定義】' },
      { filePath: '/a/SC002.md', relPath: 'SC002.md', sheetName: 'SC002', sectionTitle: '【画面遷移】' },
    ]
    const ans = 'Trường này bắt buộc nhập [[SC001.md | 【項目定義】]].'
    const res = extractCitationsFromAnswer(ans, pool)
    expect(res.citations).toEqual([pool[0]])
  })
})

describe('filterGeminiModels', () => {
  it('chỉ giữ model gemini hỗ trợ generateContent, bỏ image/tts/embedding, mới nhất lên đầu', () => {
    const gc = ['generateContent']
    const ids = filterGeminiModels([
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: gc },
      { name: 'models/gemini-3.1-pro-preview', supportedGenerationMethods: gc },
      { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: gc },
      { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: gc },
      { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/text-bison', supportedGenerationMethods: gc },
    ])
    expect(ids).toEqual(['gemini-3.1-pro-preview', 'gemini-2.5-flash'])
  })
})

describe('callGeminiApi stability & resilience', () => {
  it('báo lỗi nếu chưa nhập API Key', async () => {
    await expect(
      callGeminiApi({
        apiKey: '',
        model: 'gemini-2.5-flash',
        question: 'hi',
        contextText: '',
        history: [],
      })
    ).rejects.toThrow('Chưa cấu hình Gemini API Key')
  })

  it('gửi API key qua header x-goog-api-key, không đặt trên URL', async () => {
    const originalFetch = globalThis.fetch
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
    try {
      const key = 'AIzaSyFakeKey123456789'
      await callGeminiApi({ apiKey: key, model: 'gemini-2.5-flash', question: 'q', contextText: '', history: [] })
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).not.toContain(key)
      expect(url).not.toContain('key=')
      expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(key)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('thử lại và thành công nếu lần đầu gặp lỗi 429 quota burst', async () => {
    let callCount = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: { message: 'Resource exhausted' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Xin chào bạn' }] } }],
          usageMetadata: { totalTokenCount: 42 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    try {
      const res = await callGeminiApi({
        apiKey: 'AIzaSyFakeKey123456789',
        model: 'gemini-2.5-flash',
        question: 'Chào bạn',
        contextText: '',
        history: [],
      })
      expect(callCount).toBe(2)
      expect(res.text).toBe('Xin chào bạn')
      expect(res.usage?.totalTokens).toBe(42)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('tự động fallback sang gemini-2.5-flash nếu model cũ trả về 404', async () => {
    const urlsCalled: string[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      urlsCalled.push(url)
      if (url.includes('gemini-deprecated-model')) {
        return new Response(JSON.stringify({ error: { message: 'Model not found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Trả lời từ fallback' }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    try {
      const res = await callGeminiApi({
        apiKey: 'AIzaSyFakeKey123456789',
        model: 'gemini-deprecated-model',
        question: 'Hỏi câu hỏi',
        contextText: '',
        history: [],
      })
      expect(urlsCalled.some((u) => u.includes('gemini-deprecated-model'))).toBe(true)
      expect(urlsCalled.some((u) => u.includes('gemini-2.5-flash'))).toBe(true)
      expect(res.text).toContain('Trả lời từ fallback')
      // người dùng phải biết câu trả lời đến từ model khác model đã chọn
      expect(res.text).toContain('model "gemini-deprecated-model" không còn dùng được')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('quá giờ thì báo lỗi ngay, không thử lại', async () => {
    vi.useFakeTimers()
    const originalFetch = globalThis.fetch
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    try {
      const check = expect(
        callGeminiApi({
          apiKey: 'AIzaSyFakeKey123456789',
          model: 'gemini-2.5-flash',
          question: 'Câu hỏi dài',
          contextText: '',
          history: [],
        })
      ).rejects.toThrow('Quá thời gian')
      await vi.advanceTimersByTimeAsync(120_000)
      await check
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.fetch = originalFetch
      vi.useRealTimers()
    }
  })

  it('báo lỗi rõ ràng khi phản hồi bị chặn bởi Safety Filter', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          candidates: [{ finishReason: 'SAFETY' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    try {
      await expect(
        callGeminiApi({
          apiKey: 'AIzaSyFakeKey123456789',
          model: 'gemini-2.5-flash',
          question: 'Nội dung nhạy cảm',
          contextText: '',
          history: [],
        })
      ).rejects.toThrow('SAFETY')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
