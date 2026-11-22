import { describe, expect, it } from 'vitest'
import { completenessOf } from './completeness'
import { SPEC_SAMPLE } from './specGuide'
import { buildSpecIndex } from './specIndex'

const c = completenessOf(buildSpecIndex([{ rel: 'sample.md', text: SPEC_SAMPLE }]))
const flags = (o: object, keys: string[]): string => keys.map((k) => `${k}=${(o as Record<string, unknown>)[k]}`).join(' ')

describe('completenessOf', () => {
  it('chấm từng màn hình theo các tiêu chí; yếu nhất (rồi nhiều vấn đề nhất) đứng đầu', () => {
    expect(c.screens.map((s) => s.id)).toEqual(['SCR010', 'SCR011']) // cùng 5/6: SCR010 nhiều vấn đề hơn đứng trước
    const [search, detail] = c.screens
    const keys = ['items', 'transitions', 'tables', 'crud', 'noVague', 'noIssues']
    // SCR011: không có 項目定義; còn lại đạt
    expect(flags(detail, keys)).toBe('items=false transitions=true tables=true crud=true noVague=true noIssues=true')
    expect(detail.score).toBeCloseTo(5 / 6)
    // SCR010: 遷移 tới メニュー chưa định nghĩa + 顧客名 桁数 > DB -> noIssues=false, 2 vấn đề
    expect(flags(search, keys)).toBe('items=true transitions=true tables=true crud=true noVague=true noIssues=false')
    expect(search.issues).toBe(2)
  })

  it('bảng: có PK, đủ 型, có màn hình dùng; tổng % và số đạt đủ', () => {
    expect(c.tables.map((t) => `${t.name} pk=${t.pk} types=${t.types} used=${t.used} ${t.score}`)).toEqual(['TBL_CUSTOMER pk=true types=true used=true 1'])
    expect(c.doneScreens).toBe(0)
    expect(c.doneTables).toBe(1)
    expect(c.overall).toBeCloseTo((5 / 6 + 5 / 6 + 1) / 3)
  })

  it('màn hình không dùng bảng nào: CRUD không áp dụng; bảng không ai dùng; thư mục rỗng -> 0', () => {
    const md = ['## A', '- **画面ID**: A001', '', '## TBL_Z', '| 論理名 | 物理名 | 型 |', '|---|---|---|', '| X | X | |'].join('\n')
    const r = completenessOf(buildSpecIndex([{ rel: 'a.md', text: md }]))
    expect(r.screens[0].crud).toBeNull()
    expect(r.tables[0]).toMatchObject({ pk: false, types: false, used: false, score: 0 })
    expect(completenessOf(buildSpecIndex([])).overall).toBe(0)
  })
})
