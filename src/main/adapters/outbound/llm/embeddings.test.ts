import { afterEach, describe, expect, it, vi } from 'vitest'
import { canEmbed, cosine, embedTexts } from './embeddings'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('embeddings', () => {
  it('Claude không có embedding', () => {
    expect(canEmbed('claude')).toBe(false)
    expect(canEmbed('gemini')).toBe(true)
    expect(canEmbed('openai')).toBe(true)
  })

  it('OpenAI: gửi key trong header, xếp theo index, chuẩn hóa, lần sau lấy từ bộ nhớ', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(JSON.stringify({ data: [{ index: 1, embedding: [0, 2] }, { index: 0, embedding: [3, 4] }] }), { status: 200 })
    }) as unknown as typeof fetch
    const [a, b] = await embedTexts('openai', 'sk-test', ['embed-test-a', 'embed-test-b'])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).not.toContain('sk-test')
    expect(JSON.parse(String(calls[0].init.body)).input).toEqual(['embed-test-a', 'embed-test-b'])
    expect(Array.from(a).map((x) => Math.round(x * 10) / 10)).toEqual([0.6, 0.8])
    expect(cosine(b, b)).toBeCloseTo(1)
    await embedTexts('openai', 'sk-test', ['embed-test-a'])
    expect(calls).toHaveLength(1)
  })

  it('Gemini: đọc embeddings[].values; lỗi HTTP không lộ key', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ embeddings: [{ values: [1, 0] }] }), { status: 200 })) as unknown as typeof fetch
    const [v] = await embedTexts('gemini', 'g-key', ['embed-test-g'])
    expect(Array.from(v)).toEqual([1, 0])
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad key g-key-secret-123456' } }), { status: 400 })) as unknown as typeof fetch
    const p = embedTexts('gemini', 'g-key-secret-123456', ['embed-test-err'])
    await expect(p).rejects.toThrow('400')
    await expect(p).rejects.not.toThrow('g-key-secret-123456')
  })
})
