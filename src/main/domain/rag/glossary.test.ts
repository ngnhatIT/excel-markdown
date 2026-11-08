import { afterEach, describe, expect, it } from 'vitest'
import { expandViJaQueryTerms, projectGlossary, setProjectGlossary } from './glossary'

describe('expandViJaQueryTerms + 用語集 dự án', () => {
  afterEach(() => setProjectGlossary([]))

  it('giữ từ điển có sẵn, thêm thuật ngữ dự án khi câu hỏi chứa vi / en', () => {
    const extra = [{ ja: '受注明細', vi: 'chi tiết đơn', en: 'order line', note: '' }]
    expect(expandViJaQueryTerms('Màn hình chi tiết đơn có gì?', extra)).toEqual(expect.arrayContaining(['画面', '受注明細']))
    expect(expandViJaQueryTerms('ORDER LINE table', extra)).toContain('受注明細')
    expect(expandViJaQueryTerms('màn hình', extra)).not.toContain('受注明細')
  })

  it('mặc định dùng 用語集 đã đặt; thuật ngữ < 3 ký tự bỏ qua', () => {
    setProjectGlossary([
      { ja: '請求', vi: 'hóa đơn', en: 'invoice', note: '' },
      { ja: '番号', vi: 'số', en: 'no', note: '' },
    ])
    expect(projectGlossary()).toHaveLength(2)
    expect(expandViJaQueryTerms('tạo hóa đơn số mới')).toEqual(['請求'])
  })
})
