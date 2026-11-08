import { describe, expect, it } from 'vitest'
import { findGlossaryRel, glossaryMarkdown, parseGlossary, suggestGlossary, termsIn, type GlossaryEntry } from './glossary'
import { buildSpecIndex } from './specIndex'

const e = (ja: string, vi: string, en: string, note = ''): GlossaryEntry => ({ ja, vi, en, note })

describe('parseGlossary', () => {
  it('bảng ja | vi | en (+ 備考), alias tiêu đề Nhật / Việt / Anh, bỏ escape của converter', () => {
    const md = '# 用語集\n\n| 日本語 | Tiếng Việt | English | 備考 |\n|---|---|---|---|\n| 顧客 | khách hàng | customer | 得意先 と同義 |\n| 受注\\_番号 | **số đơn** | `order no` |  |\n'
    expect(parseGlossary(md)).toEqual([e('顧客', 'khách hàng', 'customer', '得意先 と同義'), e('受注_番号', 'số đơn', 'order no')])
    expect(parseGlossary('| Japanese | ベトナム語 |\n|:--|:--|\n| 画面 | màn hình |\n')).toEqual([e('画面', 'màn hình', '')])
    expect(parseGlossary('| JA | EN | Note |\n|---|---|---|\n| 画面 | screen | x |\n')).toEqual([e('画面', '', 'screen', 'x')])
  })

  it('bỏ bảng không có cột ja hoặc thiếu cả vi lẫn en; bỏ hàng thiếu thuật ngữ; nhiều bảng', () => {
    const md = [
      '| No | 論理名 | 物理名 |',
      '|---|---|---|',
      '| 1 | 顧客 | CUST |',
      '',
      '| 日本語 | English |',
      '|---|---|',
      '| 顧客 |  |',
      '|  | customer |',
      '| 受注 | order |',
      '',
      '| 日本語 | VI |',
      '|---|---|',
      '| 画面 | màn hình |',
    ].join('\n')
    expect(parseGlossary(md).map((x) => x.ja)).toEqual(['受注', '画面'])
    for (const bad of ['', '|', '| 日本語 |\n|---|', '| 日本語 | EN |\n|---|---|\n| a\n']) expect(() => parseGlossary(bad)).not.toThrow()
  })

  it('thuật ngữ quá dài bị cắt, xuống dòng thành khoảng trắng', () => {
    const [x] = parseGlossary(`| 日本語 | EN |\n|---|---|\n| ${'あ'.repeat(200)} | a<br>b |\n`)
    expect(x.ja).toHaveLength(80)
    expect(x.en).toBe('a b')
  })
})

describe('termsIn', () => {
  const g = [e('顧客', 'khách hàng', 'customer'), e('受注', 'đơn hàng', 'order'), e('テーブル', 'bảng', 'table'), e('X', 'x', 'x')]

  it('khớp ja / vi / en không phân biệt hoa thường, toàn角 / bán角, hiragana / katakana', () => {
    expect(termsIn('顧客コードを入力', g).map((x) => x.ja)).toEqual(['顧客'])
    expect(termsIn('Nhập KHÁCH HÀNG', g).map((x) => x.ja)).toEqual(['顧客'])
    expect(termsIn('ＣＵＳＴＯＭＥＲ list', g).map((x) => x.ja)).toEqual(['顧客'])
    expect(termsIn('てーぶる 一覧', g).map((x) => x.ja)).toEqual(['テーブル'])
  })

  it('từ ASCII phải nguyên từ; thuật ngữ 1 ký tự bỏ qua; giới hạn số mục', () => {
    expect(termsIn('reordering the customers', g).map((x) => x.ja)).toEqual([])
    expect(termsIn('order, table', g).map((x) => x.ja)).toEqual(['受注', 'テーブル'])
    expect(termsIn('X x', g)).toEqual([])
    expect(termsIn('顧客 受注 テーブル', g, 2)).toHaveLength(2)
  })
})

describe('findGlossaryRel', () => {
  it('ưu tiên gốc, rồi thư mục nông nhất; tối đa 2 cấp; không phân biệt hoa thường', () => {
    expect(findGlossaryRel(['a/用語集.md', 'glossary.md'])).toBe('glossary.md')
    expect(findGlossaryRel(['a/b/GLOSSARY.md', 'x.md'])).toBe('a/b/GLOSSARY.md')
    expect(findGlossaryRel(['a/b/c/用語集.md', 'my-glossary.md'])).toBeUndefined()
  })
})

describe('suggestGlossary / glossaryMarkdown', () => {
  const md = '- **画面ID**: S001\n- **画面名**: 顧客検索画面\n\n## TBL_CUSTOMER\n\n- **テーブル名**: 顧客マスタ\n\n| 論理名 | 物理名 | 型 |\n|---|---|---|\n| 顧客コード | CUST_CD | VARCHAR |\n| 顧客名 | CUST_NAME | VARCHAR |\n'
  const gl = '| 日本語 | VI |\n|---|---|\n| 顧客名 | tên khách hàng |\n'

  it('gợi ý 論理名 bảng / cột (en = 物理名) + tên màn hình, bỏ thuật ngữ đã có trong 用語集', () => {
    const idx = buildSpecIndex([{ rel: 's.md', text: md }, { rel: '用語集.md', text: gl }])
    expect(suggestGlossary(idx)).toEqual([
      e('顧客マスタ', '', 'TBL_CUSTOMER', 'テーブル TBL_CUSTOMER'),
      e('顧客コード', '', 'CUST_CD', 'カラム TBL_CUSTOMER.CUST_CD'),
      e('顧客検索画面', '', '', '画面 S001'),
    ])
  })

  it('Markdown đọc lại được bằng parseGlossary, escape `|`', () => {
    const rows = [e('顧客', 'khách hàng', 'customer'), e('A|B', 'a\\b', 'x', 'n')]
    const out = glossaryMarkdown(rows)
    expect(out.startsWith('# 用語集\n\n| 日本語 | Tiếng Việt | English | 備考 |\n|---|---|---|---|\n')).toBe(true)
    expect(parseGlossary(out)).toEqual(rows)
  })
})
