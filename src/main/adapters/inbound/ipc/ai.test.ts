import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: () => undefined }, safeStorage: {}, app: { getPath: () => '' } }))
const { aiAskError, searchTermsLine } = await import('./ai')

describe('aiAskError', () => {
  const ok = { question: 'hỏi', scope: 'folder' }

  it('hợp lệ (có / không có lịch sử)', () => {
    expect(aiAskError(ok)).toBeNull()
    expect(aiAskError({ ...ok, history: [{ role: 'user', text: 'a' }, { role: 'model', text: 'b' }] })).toBeNull()
  })

  it('câu hỏi rỗng / sai kiểu / quá dài', () => {
    expect(aiAskError({ ...ok, question: '  ' })).toBe('E_AI_EMPTY_QUESTION')
    expect(aiAskError({ ...ok, question: 1 })).toBe('E_BAD_REQUEST')
    expect(aiAskError({ ...ok, question: 'x'.repeat(20_001) })).toBe('E_BAD_REQUEST')
    expect(aiAskError(null)).toBe('E_BAD_REQUEST')
  })

  it('lịch sử sai: không phải mảng, quá 50 lượt, role lạ, text quá dài', () => {
    expect(aiAskError({ ...ok, history: 'x' })).toBe('E_BAD_REQUEST')
    expect(aiAskError({ ...ok, history: Array(51).fill({ role: 'user', text: 'a' }) })).toBe('E_BAD_REQUEST')
    expect(aiAskError({ ...ok, history: [{ role: 'system', text: 'a' }] })).toBe('E_BAD_REQUEST')
    expect(aiAskError({ ...ok, history: [{ role: 'user', text: 'x'.repeat(50_001) }] })).toBe('E_BAD_REQUEST')
  })
})

describe('searchTermsLine', () => {
  it('gộp thành một dòng, bỏ ký tự Markdown / dấu phân cách, cắt 400 ký tự', () => {
    expect(searchTermsLine('**顧客検索**, 画面遷移\n- `M_CUSTOMER`\n')).toBe('顧客検索 画面遷移 - M_CUSTOMER')
    expect(searchTermsLine('a '.repeat(500)).length).toBeLessThanOrEqual(400)
    expect(searchTermsLine('\n \n')).toBe('')
  })
})
