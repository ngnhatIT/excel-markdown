import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTestDesign, TEST_MAX_ROWS, testDesignMarkdown, testDesignTsv, type TestRow } from './testDesign'

const root = join(__dirname, '../..')
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8')
const of = (rows: TestRow[], item: string): TestRow[] => rows.filter((r) => r.item === item)

describe('buildTestDesign: golden kihon-sekkei', () => {
  const d = buildTestDesign(read('test/golden/kihon-sekkei.xlsx.md'), { source: 'kihon.md' })

  it('một bảng 項目定義; bảng テーブル定義 (không có 画面ID) không sinh dòng', () => {
    expect(d.tables).toBe(1)
    expect(d.truncated).toBe(false)
    expect(d.rows.some((r) => /割引率|cust_cd|登録日/.test(r.item))).toBe(false)
    expect(d.rows.map((r) => r.no)).toEqual(d.rows.map((_, i) => i + 1))
  })

  it('必須 (○ và *必須*): một dòng 未入力 lỗi + một dòng nhập bình thường', () => {
    for (const item of ['顧客コード', '顧客名']) {
      const req = of(d.rows, item).filter((r) => r.aspect === '必須チェック')
      expect(req.map((r) => r.steps)).toEqual([`「${item}」を未入力のまま登録（確定）する`, `「${item}」に値を入力して登録（確定）する`])
      expect(req[0].expected).toBe('必須エラーが表示される')
      expect(req[0].screen).toBe('SPXX0001-01 顧客検索画面')
    }
    expect(of(d.rows, '電話番号').some((r) => r.aspect === '必須チェック')).toBe(false)
  })

  it('桁数: n OK, n+1 NG; thêm 0 文字 khi không bắt buộc', () => {
    const len = (item: string): string[] => of(d.rows, item).filter((r) => r.aspect.startsWith('桁数')).map((r) => `${r.steps} => ${r.expected}`)
    expect(len('顧客コード')).toEqual([
      '「顧客コード」に10文字入力する => 正常に受け付けられる',
      '「顧客コード」に11文字入力する => 桁数エラーとなる（または10文字を超えて入力できない）',
    ])
    expect(len('電話番号')).toHaveLength(3)
    expect(len('電話番号')[2]).toBe('「電話番号」に0文字入力する => エラーにならない（任意項目）')
  })

  it('形式 từ 備考 (半角英数), 初期値, 区分 表示 không có kiểm tra nhập', () => {
    expect(of(d.rows, '顧客コード').find((r) => r.aspect.startsWith('形式'))).toMatchObject({ aspect: '形式チェック（半角英数）', expected: '形式エラーとなる' })
    expect(of(d.rows, '顧客名').find((r) => r.aspect === '初期表示')?.expected).toBe('「顧客名」に初期値「__x__」が表示される')
    // \<null> coi như không có 初期値
    expect(of(d.rows, '顧客コード').some((r) => r.aspect === '初期表示')).toBe(false)
    const memo = of(d.rows, '備考欄')
    expect(memo.map((r) => r.aspect)).toEqual(['表示内容確認', '初期表示'])
    expect(memo[0].expected).toBe('「備考欄」が仕様どおり表示される（備考: <input type="text"> を使用 | 区切り）')
    // Escape Markdown của converter được bỏ đúng (link giả, backtick giả)
    expect(of(d.rows, '参照')[0].expected).toContain('[仕様](http://example.com/a)')
    expect(of(d.rows, '参照')[1].expected).toBe('「参照」に初期値「`code`」が表示される')
  })

  it('画面遷移 meta + dòng tiếp `→ 顧客詳細`; 参照元 file:dòng', () => {
    const tr = d.rows.filter((r) => r.aspect === '画面遷移')
    expect(tr.map((r) => r.item)).toEqual(['メニュー → SPXX0001-01 顧客検索画面', 'SPXX0001-01 顧客検索画面 → 顧客詳細'])
    expect(tr[1]).toMatchObject({ steps: '遷移操作を行う', expected: '顧客詳細 へ遷移する', ref: 'kihon.md:19' })
    expect(of(d.rows, '顧客コード')[0].ref).toBe('kihon.md:25')
  })
})

describe('buildTestDesign: fixtures specmap + ui-drawings-advanced', () => {
  it('SCR010: 必須 lấy từ 備考 khi không có cột 必須', () => {
    const d = buildTestDesign(read('test/fixtures/specmap/screens/SCR010_search.md'), { source: 'SCR010_search.md' })
    expect(of(d.rows, '顧客コード').filter((r) => r.aspect === '必須チェック')).toHaveLength(2)
    expect(of(d.rows, '顧客名').some((r) => r.aspect === '必須チェック')).toBe(false)
    expect(of(d.rows, '顧客名').map((r) => r.steps)).toContain('「顧客名」に101文字入力する')
  })

  it('〔矢印〕 rẽ nhánh / hai chiều; ボタン lấy 備考 làm kết quả', () => {
    const d = buildTestDesign(read('test/golden/ui-drawings-advanced.xlsx.md'))
    expect(d.tables).toBe(2)
    const tr = d.rows.filter((r) => r.aspect === '画面遷移').map((r) => `${r.item} | ${r.steps}`)
    expect(tr).toContain('権限あり？ → SCR010 顧客検索画面 | 「はい」の操作を行う')
    expect(tr).toContain('SCR010 顧客検索画面 → SCR011 顧客詳細画面 | 「行ダブルクリック」の操作を行う')
    expect(tr).toContain('SCR011 顧客詳細画面 → SCR010 顧客検索画面 | 「戻る」の操作を行う')
    expect(of(d.rows, '編集')).toEqual([expect.objectContaining({ screen: 'SCR011 顧客詳細画面', aspect: 'ボタン押下', steps: '「編集」を押下する', expected: '編集画面へ' })])
    expect(of(d.rows, '区分').map((r) => r.expected)).toEqual(['「区分」に初期値「法人」が表示される'])
  })

  it('flow.md: chỉ có 遷移, không có bảng 項目定義', () => {
    const d = buildTestDesign(read('test/fixtures/specmap/flow.md'))
    expect(d.tables).toBe(0)
    expect(d.rows.every((r) => r.aspect === '画面遷移')).toBe(true)
    expect(d.rows).toHaveLength(6)
  })
})

const SCREEN = `# 入力

## 画面

- **画面ID**: SCR100
- **画面名**: 入力画面

- **画面遷移**: 入力 → 完了（登録）

### 【項目定義】

| No | Tên hạng mục | Loại | Kiểu | Độ dài | Bắt buộc | Ghi chú |
|---|---|---|---|---|---|---|
| 1 | 金額 | 入力 | 数値 | 9 | ○ |  |
| 2 | 生年月日 | 入力 | 日付 | 10 | × |  |
| 3 | 登録ボタン | ボタン |  |  |  |  |
| 4 | 区分 | 選択 |  |  |  |  |

- 〔入力規則 E2:E50〕法人 / 個人 / その他
`

describe('buildTestDesign: quy tắc', () => {
  const d = buildTestDesign(SCREEN, { source: 'in.md' })

  it('header tiếng Việt; 数値 / 日付 -> 形式; × không bắt buộc', () => {
    expect(d.tables).toBe(1)
    expect(of(d.rows, '金額').map((r) => r.aspect)).toEqual(['必須チェック', '必須チェック', '桁数チェック（境界値）', '桁数チェック（境界値）', '形式チェック（数値）'])
    expect(of(d.rows, '生年月日').map((r) => r.aspect)).toContain('形式チェック（日付）')
    expect(of(d.rows, '生年月日').some((r) => r.aspect === '必須チェック')).toBe(false)
  })

  it('ボタン nối với 遷移 có nhãn trùng tên nút', () => {
    expect(of(d.rows, '登録ボタン')).toEqual([expect.objectContaining({ aspect: 'ボタン押下', expected: '完了 へ遷移する' })])
  })

  it('入力規則: chọn từng giá trị + giá trị ngoài danh sách', () => {
    const list = of(d.rows, '入力規則 E2:E50')
    expect(list.map((r) => r.steps)).toEqual(['入力規則 E2:E50で各選択肢（法人, 個人, その他）を選択する', '入力規則 E2:E50に一覧外の値を入力（貼り付け）する'])
    expect(list[1].expected).toBe('一覧外の値は入力できない（エラーとなる）')
    expect(list[0].screen).toBe('SCR100 入力画面')
  })

  it('ngôn ngữ vi / en: cùng số dòng, chữ khác', () => {
    const vi = buildTestDesign(SCREEN, { lang: 'vi' })
    const en = buildTestDesign(SCREEN, { lang: 'en' })
    expect(vi.rows).toHaveLength(d.rows.length)
    expect(en.rows).toHaveLength(d.rows.length)
    expect(vi.rows[0]).toMatchObject({ aspect: 'Chuyển màn hình', steps: 'Thao tác "登録"' })
    expect(of(vi.rows, '金額')[0].steps).toBe('Để trống "金額" rồi đăng ký (xác nhận)')
    expect(of(en.rows, '金額')[3].expected).toBe('Length error (or input is limited to 9 characters)')
  })

  it('TSV / Markdown', () => {
    const tsv = testDesignTsv(d).split('\n')
    expect(tsv[0]).toBe('No\t大項目\t中項目\t観点\t手順\t期待結果\t参照元')
    expect(tsv[1].split('\t')).toHaveLength(7)
    expect(tsv).toHaveLength(d.rows.length + 2)
    expect(testDesignTsv(d, 'en').split('\n')[0]).toBe('No\tScreen\tItem\tViewpoint\tSteps\tExpected result\tSource')
    const md = testDesignMarkdown({ ...d, rows: [{ ...d.rows[0], expected: 'a|b\nc' }] }, 'ja', 'in')
    expect(md.split('\n').slice(0, 5)).toEqual(['# in', '', '## テスト仕様書', '', '| No | 大項目 | 中項目 | 観点 | 手順 | 期待結果 | 参照元 |'])
    expect(md).toContain('a\\|b<br>c')
  })
})

describe('buildTestDesign: đầu vào lạ', () => {
  it('bảng không có header đã biết / ngoài 画面 / trong code fence: không dòng, không ném', () => {
    const md = [
      '- **画面ID**: S1',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '```',
      '| 項目名 | 必須 |',
      '|---|---|',
      '| X | ○ |',
      '```',
      '',
      '| 項目名 | 必須 |',
      '|---|---|',
      '',
      '| 項目名 |',
      '|---|',
      '| Y |',
      '',
      '---',
      '',
      '| 項目名 | 必須 |',
      '|---|---|',
      '| Z | ○ |',
    ].join('\n')
    const d = buildTestDesign(md)
    expect(d.rows).toEqual([])
    expect(d.tables).toBe(1) // chỉ bảng header-only trong phần S1
    for (const x of ['', '|', '| a |\n|---|\n|', '- **画面ID**:\n| 項目名 | 必須 |\n|-', '\u0000'.repeat(1000)]) {
      expect(buildTestDesign(x).rows).toEqual([])
    }
  })

  it(`cắt ở ${TEST_MAX_ROWS} dòng`, () => {
    const rows = Array.from({ length: 600 }, (_, i) => `| 項目${i} | 入力 | 10 | ○ |`)
    const md = ['- **画面ID**: BIG', '', '| 項目名 | 区分 | 桁数 | 必須 |', '|---|---|---|---|', ...rows].join('\n')
    const d = buildTestDesign(md)
    expect(d.truncated).toBe(true)
    expect(d.rows).toHaveLength(TEST_MAX_ROWS)
    expect(d.rows[TEST_MAX_ROWS - 1].no).toBe(TEST_MAX_ROWS)
  })
})
