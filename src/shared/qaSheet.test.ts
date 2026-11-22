import { describe, expect, it } from 'vitest'
import { buildQaRows, qaLang, qaTable } from './qaSheet'
import { SPEC_SAMPLE } from './specGuide'
import { buildSpecIndex } from './specIndex'

const index = buildSpecIndex([{ rel: 'sample.md', text: SPEC_SAMPLE }])

describe('質問票', () => {
  it('mỗi chỗ chưa rõ một câu hỏi: 遷移 treo, 桁数 > DB, màn hình không có 項目定義; kèm màn hình và vị trí', () => {
    const rows = buildQaRows(index, 'ja')
    expect(rows.map((r) => `${r.no} ${r.category} ${r.kind} ${r.screenId} ${r.rel}:${r.line}`)).toEqual([
      '1 spec dangling-transition SCR010 sample.md:7',
      '2 spec item-length SCR010 sample.md:14',
      '3 spec no-items SCR011 sample.md:24',
    ])
    expect(rows[0].question).toBe('「メニュー」への画面遷移が記載されていますが、遷移先の画面定義が見当たりません。遷移先の画面ID・画面設計書をご教示いただけますでしょうか。')
    expect(rows[1].question).toContain('画面項目「顧客名」の桁数が DB カラムより長くなっています（50 > TBL_CUSTOMER.CUST_NAME VARCHAR(40)）')
    expect(rows[2].question).toContain('画面「SCR011 顧客詳細画面」の項目定義')
  })

  it('chữ mơ hồ trích cả câu gốc; ô CRUD ? hỏi thao tác; lỗi ghi chép xếp sau câu hỏi đặc tả', () => {
    const md = [
      '## 画面',
      '- **画面ID**: A001',
      '- **画面名**: 受付画面',
      '| 項目名 | 区分 | 桁数 |',
      '|---|---|---|',
      '| 受付番号 | 入力 | 10 |',
      '',
      '- 受付日は原則当日とする。',
      '- 対象: TBL_X',
      '- 備考: TBL_X.NOPE',
      '',
      '## TBL_X',
      '| 論理名 | 物理名 | 型 |',
      '|---|---|---|',
      '| ID | ID | INT |',
    ].join('\n')
    const rows = buildQaRows(buildSpecIndex([{ rel: 'a.md', text: md }]), 'ja')
    expect(rows.map((r) => `${r.category} ${r.kind}`)).toEqual(['spec ambiguous-term', 'spec crud-unknown', 'doc unknown-column'])
    expect(rows[0].question).toBe('「- 受付日は原則当日とする。」の「原則」について、具体的な内容（条件・値・範囲）をご教示いただけますでしょうか。')
    expect(rows[1].question).toContain('画面「A001 受付画面」でテーブル「TBL_X」を使用していますが')
  })

  it('tiếng Việt / Anh; bảng xuất có header và cột trả lời trống', () => {
    const vi = buildQaRows(index, 'vi')
    expect(vi[0].question).toContain('Tài liệu có chuyển màn hình tới 「メニュー」')
    const table = qaTable(vi, 'vi')
    expect(table[0]).toEqual(['STT', 'Phân loại', 'Mã màn hình', 'Tên màn hình', 'Vị trí', 'Câu hỏi', 'Trả lời', 'Người trả lời', 'Ngày trả lời'])
    expect(table[1].slice(0, 5)).toEqual(['1', 'Xác nhận đặc tả', 'SCR010', '顧客検索画面', 'sample.md:7'])
    expect(table[1].slice(6)).toEqual(['', '', ''])
    expect(buildQaRows(index, 'en')[2].question).toContain('Screen "SCR011 顧客詳細画面" has no item definition')
  })

  it('ngôn ngữ mặc định theo tên màn hình', () => {
    expect(qaLang(index)).toBe('ja')
    const vi = buildSpecIndex([{ rel: 'v.md', text: '## A\n- **Mã màn hình**: A1\n- **Tên màn hình**: Thanh toán đơn hàng\n' }])
    expect(qaLang(vi)).toBe('vi')
  })
})
