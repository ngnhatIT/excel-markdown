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

  it('scope = active khi file đơn lẻ vượt 60_000 tokens: lọc theo RagSection ưu tiên mục khớp câu hỏi + toàn bộ outline', () => {
    const filler = 'あ'.repeat(110_000) // ~36,667 tokens per section
    const hugeMd = [
      '## 巨大仕様書',
      '### 【セクションA】',
      filler,
      '### 【エラーメッセージ一覧】',
      'ERR-999: システムエラーが発生しました',
      filler,
    ].join('\n')
    const hugeDoc = parseMarkdownForRag('/dir/HUGE.md', 'HUGE.md', hugeMd)
    expect(hugeDoc.tokensEst).toBeGreaterThan(60_000)

    const res = buildRagContext([hugeDoc], 'Tìm mã lỗi ERR-999 trong bảng lỗi', {
      scope: 'active',
      activeFilePath: '/dir/HUGE.md',
    })
    expect(res.contextText).toContain('ERR-999')
    expect(res.contextText).toContain('【セクションA】') // có trong outline
    expect(res.citations.some((c) => c.sectionTitle === '【エラーメッセージ一覧】')).toBe(true)
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

  it('thư mục lớn: sơ đồ thư mục không quá 20% ngân sách, file khớp nhất đứng đầu sơ đồ và được nạp', () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      parseMarkdownForRag(
        `/dir/F${i}.md`,
        `F${i}.md`,
        `## F${i}\n${Array.from({ length: 10 }, (_, s) => `### 【見出し${s}】\n本文 ${i}-${s}`).join('\n')}`
      )
    )
    const res = buildRagContext([...many, doc1], 'SC001 顧客コード', { scope: 'folder', maxContextTokens: 4000 })
    expect(res.mode).toBe('parent-rag')
    const catalog = res.contextText.split('\n\n')[0]
    expect(Math.ceil(catalog.length / 3)).toBeLessThanOrEqual(4000 * 0.2 + 30)
    expect(catalog).toMatch(/… và \d+ file khác/)
    expect(catalog.split('\n')[1]).toContain('SC001')
    expect(res.contextText).toContain('顧客コード')
    // Hỏi lại trên cùng object tài liệu cho cùng kết quả (dùng kết quả tách từ đã nhớ)
    expect(buildRagContext([...many, doc1], 'SC001 顧客コード', { scope: 'folder', maxContextTokens: 4000 }).contextText).toBe(res.contextText)
  })
})
