import { describe, expect, it } from 'vitest'
import { parseMarkdownForRag } from './chunker'
import { buildRagContext, tokenizeMultiLang } from './retriever'

describe('tokenizeMultiLang & glossary expansion', () => {
  it('tách từ tiếng Việt, mã kỹ thuật và 2-gram tiếng Nhật', () => {
    const tokens = tokenizeMultiLang('Màn hình SC001 顧客一覧')
    expect(tokens).toContain('màn')
    expect(tokens).toContain('sc001')
    expect(tokens).toContain('顧客')
    expect(tokens).toContain('一覧')
  })
})

describe('buildRagContext (Quality-First)', () => {
  const doc1 = parseMarkdownForRag(
    '/dir/SC001.md',
    'SC001.md',
    '## SC001\n- **画面ID**: SC001\n### 【項目定義】\n| No | 項目名 | 必須 | 入力チェック |\n|---|---|---|---|\n| 1 | 顧客コード | ○ | 半角英数10桁 |\n| 2 | 顧客名 | - | 50文字以内 |'
  )
  const doc2 = parseMarkdownForRag(
    '/dir/TBL001.md',
    'TBL001.md',
    '## TBL001\n- **テーブルID**: TBL_ORDER\n### 【カラム定義】\n| No | カラム名 | 型 |\n|---|---|---|\n| 1 | ORDER_ID | BIGINT |'
  )

  it('scope = active: trả về 100% toàn văn file đang xem (full-active)', () => {
    const res = buildRagContext([doc1, doc2], 'Tóm tắt file này', {
      scope: 'active',
      activeFilePath: '/dir/SC001.md',
    })
    expect(res.mode).toBe('full-active')
    expect(res.contextText).toContain('顧客コード')
    expect(res.contextText).not.toContain('ORDER_ID')
    expect(res.citations[0].relPath).toBe('SC001.md')
  })

  it('scope = folder khi tổng token <= maxContextTokens: nạp 100% toàn bộ các file (full-folder)', () => {
    const res = buildRagContext([doc1, doc2], 'Có những bảng và màn hình nào?', {
      scope: 'folder',
      maxContextTokens: 32_000,
    })
    expect(res.mode).toBe('full-folder')
    expect(res.contextText).toContain('SC001.md')
    expect(res.contextText).toContain('TBL001.md')
    expect(res.docCount).toBe(2)
  })

  it('scope = folder khi vượt ngưỡng token: dùng BM25 + từ điển Việt-Nhật chọn đúng file khách hàng (parent-rag)', () => {
    // Đặt maxContextTokens nhỏ để kích hoạt nhánh parent-rag
    const res = buildRagContext([doc1, doc2], 'Điều kiện kiểm tra bắt buộc của khách hàng ở màn hình nào?', {
      scope: 'folder',
      maxContextTokens: doc1.tokensEst + 40,
    })
    expect(res.mode).toBe('parent-rag')
    expect(res.contextText).toContain('顧客コード')
    expect(res.citations[0].relPath).toBe('SC001.md')
  })
})
