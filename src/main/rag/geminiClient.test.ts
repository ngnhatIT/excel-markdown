import { describe, expect, it } from 'vitest'
import {
  buildGeminiRequestBody,
  extractCitationsFromAnswer,
  maskApiKey,
  redactApiKey,
} from './geminiClient'

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
