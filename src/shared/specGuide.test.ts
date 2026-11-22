import { describe, expect, it } from 'vitest'
import { SPEC_SAMPLE, specCoverage } from './specGuide'
import { buildSpecIndex, crudMatrix, impactOf } from './specIndex'

describe('SPEC_SAMPLE: tài liệu mẫu của hướng dẫn được bản đồ nhận ra đủ', () => {
  const index = buildSpecIndex([{ rel: 'sample.md', text: SPEC_SAMPLE }])

  it('2 màn hình, 遷移, 1 bảng có cột', () => {
    expect(index.screens.map((s) => `${s.id} ${s.name}`)).toEqual(['SCR010 顧客検索画面', 'SCR011 顧客詳細画面'])
    expect(index.transitions.map((t) => `${t.from}->${t.to}`)).toEqual(['?メニュー->SCR010', 'SCR010->SCR011', 'SCR011->SCR010'])
    expect(index.tables.map((t) => `${t.tableName}:${t.columns.map((c) => c.name).join(',')}`)).toEqual(['TBL_CUSTOMER:CUST_CD,CUST_NAME'])
  })

  it('CRUD từ động từ, 影響調査 ra cả hai màn hình', () => {
    const m = crudMatrix(index)
    expect(m.cells.SCR010.TBL_CUSTOMER.ops).toBe('R')
    expect(m.cells.SCR011.TBL_CUSTOMER.ops).toBe('UD')
    expect(impactOf(index, 'TBL_CUSTOMER').screens.map((s) => s.id)).toEqual(['SCR010', 'SCR011'])
  })

  it('整合性: đúng 2 chỗ cố ý sai (桁数 màn hình > DB, màn hình chưa định nghĩa)', () => {
    expect(index.issues.map((i) => `${i.code} ${i.subject}`).sort()).toEqual(['dangling-transition メニュー', 'item-length SCR010 顧客名'])
  })
})

describe('specCoverage', () => {
  it('đếm theo file, file không nhận ra gì đứng cuối', () => {
    const index = buildSpecIndex([
      { rel: 'memo.md', text: '# メモ\n\nただのメモ\n' },
      { rel: 'sample.md', text: SPEC_SAMPLE },
    ])
    expect(specCoverage(index).map((c) => `${c.rel} ${c.screens}/${c.transitions}/${c.tables}/${c.refs > 0}`)).toEqual(['sample.md 2/3/1/true', 'memo.md 0/0/0/false'])
  })
})
