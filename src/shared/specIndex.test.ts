import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMPTY_RULES, type ProjectRules } from './projectConfig'
import { buildSpecIndex, crudMatrix, crudOpsOf, crudText, erMermaid, impactOf, impactSuggestions, SPEC_MAX_DOCS, SPEC_MAX_NODES, SPEC_MAX_REFS, transitionMermaid, type SpecDoc } from './specIndex'

const root = join(__dirname, '../..')
const fx = join(root, 'test/fixtures/specmap')
// Thứ tự như listMarkdownFiles (theo chiều rộng): file ở gốc trước, rồi thư mục con
const REL = ['flow.md', '用語集.md', 'db/customer.md', 'screens/SCR001_login.md', 'screens/SCR002_menu.md', 'screens/SCR010_search.md', 'screens/SCR011_detail.md', 'screens/old/SCR010_v1.md']
const docs: SpecDoc[] = REL.map((rel) => ({ rel, text: readFileSync(join(fx, rel), 'utf8') }))
const index = buildSpecIndex(docs)
const doc = (rel: string): SpecDoc => docs.find((d) => d.rel === rel) as SpecDoc

const mermaidParses = async (src: string): Promise<void> => {
  const mermaid = (await import('mermaid')).default
  await mermaid.parse(src)
}

describe('buildSpecIndex: fixture specmap', () => {
  it('màn hình từ meta 画面ID + 画面名, kèm dòng và heading', () => {
    expect(index.screens.map((s) => `${s.id} ${s.name} ${s.rel}:${s.line}`)).toEqual([
      'SCR001 ログイン画面 screens/SCR001_login.md:7',
      'SCR002 メニュー画面 screens/SCR002_menu.md:5',
      'SCR010 顧客検索画面 screens/SCR010_search.md:7',
      'SCR011 顧客詳細画面 screens/SCR011_detail.md:5',
      'SCR010 顧客検索画面（旧） screens/old/SCR010_v1.md:5',
    ])
    expect(index.screens[0].heading).toBe('画面設計')
  })

  it('遷移: chuỗi meta (A → B → C), sub-bullet `→ X`, 〔矢印〕 có nhãn và ↔; đầu mút giải theo ID / tên / bí danh', () => {
    const edges = index.transitions.map((t) => `${t.from}${t.bidi ? '<->' : '->'}${t.to}${t.label ? `(${t.label})` : ''}`)
    expect(edges).toEqual([
      'SCR001->SCR002',
      'SCR002->?権限あり?',
      '?権限あり?->SCR010(はい)',
      '?権限あり?->?SCR099(いいえ)',
      'SCR010<->SCR011(行ダブルクリック／戻る)',
      'SCR001->SCR002', // "ログイン → メニュー": tên màn hình bỏ đuôi 画面
      'SCR001->SCR002',
      'SCR002->?受注一覧', // sub-bullet nối tiếp từ メニュー
      'SCR002->SCR010',
      'SCR010->SCR011',
    ])
    expect(index.transitions[7]).toMatchObject({ rel: 'screens/SCR002_menu.md', line: 9 })
    // Nút treo giữ nhãn đầy đủ nhất
    expect(index.nodes.filter((n) => !n.screen).map((n) => n.label)).toEqual(['権限あり？', 'エラー画面 SCR099', '受注一覧'])
  })

  it('bảng + cột từ parseTableDefs', () => {
    expect(index.tables.map((t) => `${t.tableName}:${t.columns.map((c) => c.name).join(',')}`)).toEqual([
      'TBL_CUSTOMER:CUST_CD,CUST_NAME,REG_DATE',
      'TBL_ORDER:ORDER_NO,CUST_CD',
    ])
  })

  it('tham chiếu: TBL.COL, tên bảng, 画面ID ở nơi khác; tên logic chỉ khi là nguyên ô bảng; không tính trong khối định nghĩa', () => {
    const refs = index.refs.map((r) => `${r.kind}:${r.table ? r.table + '.' : ''}${r.name}@${r.rel}:${r.line}`)
    expect(refs).toContain('column:TBL_CUSTOMER.CUST_CD@screens/SCR010_search.md:21')
    expect(refs).toContain('table:TBL_CUSTOMER@screens/SCR011_detail.md:10')
    expect(refs).toContain('screen:SCR010@screens/SCR002_menu.md:13')
    // 顧客コード là 論理名 của CUST_CD ở hai bảng -> không rõ bảng; 顧客名 chỉ một bảng
    expect(refs).toContain('column:CUST_CD@screens/SCR010_search.md:16')
    expect(refs).toContain('column:TBL_CUSTOMER.CUST_NAME@screens/SCR010_search.md:17')
    // 顧客コード trong câu văn (không phải ô bảng) không tính
    expect(refs).not.toContain('column:CUST_CD@screens/SCR011_detail.md:10')
    // Heading / meta テーブルID của chính bảng, hàng của bảng định nghĩa, dòng 画面ID không phải tham chiếu
    expect(index.refs.filter((r) => r.rel === 'db/customer.md')).toEqual([])
    expect(refs.filter((r) => r.startsWith('screen:') && r.endsWith('screens/SCR010_search.md:7'))).toEqual([])
    const r = index.refs.find((x) => x.kind === 'column' && x.line === 21)
    expect(r).toMatchObject({ term: 'TBL_CUSTOMER.CUST_CD', heading: '【処理概要】', snippet: '- 検索キー: TBL_CUSTOMER.CUST_CD（前方一致）' })
  })

  it('整合性: 画面ID trùng, cột không có (TBL.COL), 遷移 treo (cảnh báo)', () => {
    expect(index.issues.map((i) => `${i.severity} ${i.code} ${i.subject} ${i.rel}:${i.line}`)).toEqual([
      'error duplicate-screen SCR010 screens/old/SCR010_v1.md:5',
      'warning dangling-transition エラー画面 SCR099 flow.md:9',
      'warning dangling-transition 受注一覧 screens/SCR002_menu.md:9',
      'error unknown-column TBL_CUSTOMER.CUST_KANA screens/SCR010_search.md:22',
      'warning ambiguous-term 要確認 screens/SCR002_menu.md:17',
    ])
    expect(index.issues[0].other).toEqual({ rel: 'screens/SCR010_search.md', line: 7 })
  })
})

describe('impactOf', () => {
  it('cột TBL.COL: định nghĩa + tham chiếu (cả tên logic), màn hình bị ảnh hưởng + liên quan qua 遷移, gom theo tài liệu', () => {
    const r = impactOf(index, 'tbl_customer.cust_cd')
    expect(r.kind).toBe('column')
    expect(r.targets).toEqual(['TBL_CUSTOMER.CUST_CD'])
    expect(r.screens).toEqual([
      { id: 'SCR010', name: '顧客検索画面', relation: 'direct' },
      { id: 'SCR002', name: 'メニュー画面', relation: 'related' },
      { id: 'SCR011', name: '顧客詳細画面', relation: 'related' },
    ])
    expect(r.groups.map((g) => `${g.rel}:${g.hits.map((h) => `${h.line}${h.reason[0]}`).join(',')}`)).toEqual([
      'db/customer.md:12d',
      'screens/SCR002_menu.md:5r',
      'screens/SCR010_search.md:16r,21r',
      'screens/SCR011_detail.md:5r',
    ])
  })

  it('bảng: mọi tham chiếu tới bảng và tới cột của bảng', () => {
    const r = impactOf(index, 'TBL_CUSTOMER')
    expect(r.kind).toBe('table')
    const lines = r.groups.flatMap((g) => g.hits.map((h) => `${g.rel}:${h.line}:${h.reason}`))
    expect(lines).toEqual(expect.arrayContaining(['db/customer.md:10:definition', 'screens/SCR010_search.md:21:reference', 'screens/SCR010_search.md:22:reference', 'screens/SCR011_detail.md:10:reference']))
    expect(r.screens.filter((s) => s.relation === 'direct').map((s) => s.id).sort()).toEqual(['SCR010', 'SCR011'])
    // Tên logic của bảng cũng được
    expect(impactOf(index, '顧客マスタ').targets).toEqual(['TBL_CUSTOMER'])
  })

  it('cột trần / tên logic: mọi bảng có cột đó', () => {
    expect(impactOf(index, 'CUST_CD').targets).toEqual(['TBL_CUSTOMER.CUST_CD', 'TBL_ORDER.CUST_CD'])
    expect(impactOf(index, '顧客名').targets).toEqual(['TBL_CUSTOMER.CUST_NAME'])
  })

  it('màn hình theo ID hoặc tên: định nghĩa, tham chiếu, dòng 遷移, màn hình liên quan', () => {
    const r = impactOf(index, '顧客詳細')
    expect(r.kind).toBe('screen')
    expect(r.targets).toEqual(['SCR011'])
    const hits = r.groups.flatMap((g) => g.hits.map((h) => `${g.rel}:${h.line}:${h.reason}`))
    expect(hits).toEqual(expect.arrayContaining(['screens/SCR011_detail.md:5:definition', 'flow.md:10:reference', 'screens/SCR010_search.md:10:transition', 'screens/SCR010_search.md:7:related']))
    expect(r.screens.map((s) => `${s.id}:${s.relation}`)).toEqual(['SCR011:direct', 'SCR010:related'])
  })

  it('không khớp / rỗng -> none', () => {
    expect(impactOf(index, 'NOPE').kind).toBe('none')
    expect(impactOf(index, '  ').kind).toBe('none')
  })

  it('gợi ý: bảng, TBL.COL, 画面ID không trùng', () => {
    const s = impactSuggestions(index).map((x) => x.value)
    expect(s).toEqual(expect.arrayContaining(['TBL_CUSTOMER', 'TBL_CUSTOMER.CUST_CD', 'TBL_ORDER.CUST_CD', 'SCR010']))
    expect(s.filter((x) => x === 'SCR010')).toHaveLength(1)
  })
})

describe('Mermaid', () => {
  // Flowchart cần DOMPurify (DOM) nên không parse được trong Node: e2e vẽ thật; ở đây kiểm cấu trúc
  it('flowchart: id an toàn, nhãn cạnh, ↔, class dangling', () => {
    const f = transitionMermaid(index)
    expect(f.source).toMatch(/^flowchart LR\n/)
    expect(f.source).toContain('<-->|"行ダブルクリック／戻る"|')
    expect(f.source).toMatch(/class n\d+(,n\d+){1} dangling/)
    expect(Object.values(f.ids)).toEqual(expect.arrayContaining(['SCR001', 'SCR011', '?受注一覧']))
    expect(f.truncated).toBe(false)
    expect(f.source.split('\n').filter((l) => /^\s+n\d+\[/.test(l)).every((l) => /^\s+n\d+\["[^"]*"\]$/.test(l))).toBe(true)
  })

  it('nhãn độc (`"`, `<script>`, xuống dòng, backtick) không phá cú pháp', () => {
    const md = '- **画面ID**: X001\n- **画面名**: a"b<script>`c`\n- **画面遷移**: → "q" %% ; end\n- 〔矢印〕a"b → c]d（x"|y）\n'
    const f = transitionMermaid(buildSpecIndex([{ rel: 'x.md', text: md }]))
    for (const label of f.source.match(/"[^"]*"/g) ?? []) expect(label).not.toMatch(/[<>`|#]/)
    expect(f.source).not.toContain('script>')
    // Mọi nhãn nằm gọn trong "..." (không có `"` lọt vào giữa)
    for (const l of f.source.split('\n').slice(1)) expect(l, l).toMatch(/^(?:\s+n\d+\["[^"]*"\]|\s+n\d+ (?:-->|<-->)(?:\|"[^"]*"\|)? n\d+|\s+classDef .*|\s+class [n\d,]+ dangling|)$/)
  })

  it(`giới hạn ${SPEC_MAX_NODES} nút, báo truncated`, () => {
    const text = Array.from({ length: SPEC_MAX_NODES + 20 }, (_, i) => `- 〔矢印〕S${i} → S${i + 1}`).join('\n')
    const f = transitionMermaid(buildSpecIndex([{ rel: 'a.md', text }]))
    expect(f.truncated).toBe(true)
    expect(Object.keys(f.ids)).toHaveLength(SPEC_MAX_NODES)
    expect(f.source.length).toBeLessThan(50_000)
  })

  it('ER: mọi bảng, không trùng tên; Mermaid parse được', async () => {
    const er = erMermaid(index)
    expect(er.source).toContain('TBL_CUSTOMER')
    expect(er.source).toContain('TBL_ORDER')
    expect(er.truncated).toBe(false)
    await mermaidParses(er.source)
  })
})

describe('giới hạn đầu vào không tin cậy', () => {
  it(`tối đa ${SPEC_MAX_DOCS} tài liệu, ${SPEC_MAX_REFS} tham chiếu`, () => {
    const many = Array.from({ length: SPEC_MAX_DOCS + 3 }, (_, i) => ({ rel: `d${i}.md`, text: '' }))
    const a = buildSpecIndex(many)
    expect(a.docCount).toBe(SPEC_MAX_DOCS)
    expect(a.truncated.docs).toBe(true)
    const def = doc('db/customer.md')
    const spam = { rel: 'spam.md', text: Array.from({ length: SPEC_MAX_REFS + 10 }, () => 'TBL_CUSTOMER').join('\n') }
    const b = buildSpecIndex([def, spam])
    expect(b.refs).toHaveLength(SPEC_MAX_REFS)
    expect(b.truncated.refs).toBe(true)
  })

  it('Markdown bất kỳ không ném; tên ngắn (< 3 ký tự) và tên file `TBL.md` không tính', () => {
    for (const text of ['', '|', '- **画面ID**:', '〔矢印〕 → ', '- **画面遷移**: → → →', '```\n- **画面ID**: Z\n', 'x'.repeat(30_000)]) {
      expect(() => buildSpecIndex([{ rel: 'x.md', text }])).not.toThrow()
    }
    const md = '## T\n\n- **テーブルID**: AB\n\n| 物理名 | 型 |\n|---|---|\n| ID | INT |\n'
    const r = buildSpecIndex([{ rel: 't.md', text: md }, { rel: 'u.md', text: 'AB ID AB.ID TBL_CUSTOMER.md' }])
    expect(r.refs).toEqual([])
    const s = buildSpecIndex([doc('db/customer.md'), { rel: 'u.md', text: 'see TBL_CUSTOMER.md' }])
    expect(s.issues).toEqual([])
  })

  it('bảng trùng tên giữa hai tài liệu -> lỗi duplicate-table', () => {
    const r = buildSpecIndex([doc('db/customer.md'), { rel: 'copy.md', text: doc('db/customer.md').text }])
    expect(r.issues.filter((i) => i.code === 'duplicate-table').map((i) => `${i.subject} ${i.rel}`)).toEqual(['TBL_CUSTOMER copy.md', 'TBL_ORDER copy.md'])
  })
})

describe('nút điều kiện (rẽ nhánh) trong sơ đồ 画面遷移', () => {
  const docs: SpecDoc[] = [
    {
      rel: 'flow.md',
      text: '## 遷移\n\n- **画面ID**: SCR001\n- **画面名**: ログイン\n\n- 〔矢印〕ログイン SCR001 → 権限あり？\n- 〔矢印〕権限あり？ → 未定義画面（はい）\n',
    },
  ]
  const index = buildSpecIndex(docs)

  it('không báo 権限あり？ là màn hình thiếu định nghĩa; màn hình thật thiếu vẫn báo', () => {
    const subjects = index.issues.filter((i) => i.code === 'dangling-transition').map((i) => i.subject)
    expect(subjects).not.toContain('権限あり？')
    expect(subjects).toContain('未定義画面')
  })

  it('vẽ hình thoi, không có viền đứt', () => {
    const { source } = transitionMermaid(index)
    expect(source).toMatch(/n\d+\{"権限あり？"\}/)
    const decisionId = /(n\d+)\{"権限あり？"\}/.exec(source)?.[1]
    expect(source).not.toMatch(new RegExp(`class [^\\n]*\\b${decisionId}\\b[^\\n]* dangling`))
  })
})

describe('CRUD図', () => {
  const m = crudMatrix(index)

  it('hàng = màn hình (không trùng ID), cột = bảng; thao tác từ động từ trong dòng / heading, không rõ -> ?', () => {
    expect(m.screens.map((s) => s.id)).toEqual(['SCR001', 'SCR002', 'SCR010', 'SCR011'])
    expect(m.tables).toEqual(['TBL_CUSTOMER', 'TBL_ORDER'])
    const ops = Object.fromEntries(Object.entries(m.cells).map(([id, row]) => [id, Object.fromEntries(Object.entries(row).map(([t, c]) => [t, c.ops]))]))
    expect(ops).toEqual({
      SCR002: { TBL_ORDER: '?' }, // 「要確認」: không có động từ -> không đoán
      SCR010: { TBL_CUSTOMER: 'R' }, // 検索キー / 表示順
      SCR011: { TBL_CUSTOMER: 'RUD', TBL_ORDER: 'C' }, // 取得して表示 / 更新 / 削除 / 新規登録
    })
  })

  it('bằng chứng theo dòng: rel:line, thao tác từng dòng; bảng + cột cùng dòng chỉ một', () => {
    expect(m.cells.SCR011.TBL_CUSTOMER.evidence.map((e) => `${e.rel}:${e.line}:${e.ops}`)).toEqual([
      'screens/SCR011_detail.md:10:R',
      'screens/SCR011_detail.md:14:U',
      'screens/SCR011_detail.md:15:D',
    ])
    // dòng 21 có cả TBL_CUSTOMER và TBL_CUSTOMER.CUST_CD
    expect(m.cells.SCR010.TBL_CUSTOMER.evidence.filter((e) => e.line === 21)).toHaveLength(1)
    // ô bảng 項目定義 không có động từ (heading 【項目定義】 cũng không) -> suy từ tên 顧客検索画面: r (chữ thường)
    expect(m.cells.SCR010.TBL_CUSTOMER.evidence.find((e) => e.line === 17)?.ops).toBe('r')
  })

  it('suy từ tên màn hình khi dòng và heading không có động từ: chữ thường, chữ hoa (bằng chứng) thắng', () => {
    const md = (name: string, extra = ''): string =>
      [
        '## 画面',
        '- **画面ID**: A001',
        name ? `- **画面名**: ${name}` : '',
        '### 【項目定義】',
        '| No | 項目名 | 区分 |',
        '|---|---|---|',
        '| 1 | 顧客名 | 入力 |',
        extra,
        '## TBL_X',
        '| 論理名 | 物理名 | 型 |',
        '|---|---|---|',
        '| 顧客名 | CUST_NAME | VARCHAR |',
        '| 顧客区分 | CUST_KBN | CHAR |',
      ].join('\n')
    const cell = (text: string) => crudMatrix(buildSpecIndex([{ rel: 'a.md', text }])).cells.A001?.TBL_X
    expect(cell(md('顧客登録画面'))?.ops).toBe('c')
    expect(cell(md('顧客登録画面'))?.evidence.map((e) => e.ops)).toEqual(['c'])
    expect(cell(md('顧客登録・更新画面'))?.ops).toBe('cu')
    // tên không có động từ: vẫn '?' (không đoán)
    expect(cell(md('顧客メンテナンス'))?.ops).toBe('?')
    expect(cell(md(''))?.ops).toBe('?')
    // dòng có động từ 表示 -> R có bằng chứng; ô khác suy c -> `cR`
    const mixed = cell(md('顧客登録画面', '| 2 | 顧客区分 | 表示 |'))
    expect(mixed?.ops).toBe('cR')
    expect(crudText({ screens: [{ id: 'A001', name: '' }], tables: ['TBL_X'], cells: { A001: { TBL_X: mixed! } } }, 'tsv')).toContain('A001\tcR\n')
  })

  it('heading làm ngữ cảnh khi dòng không có động từ; tên của chính tham chiếu (論理名 登録日) không tính', () => {
    const md = [
      '## 画面',
      '- **画面ID**: A001',
      '### 【削除処理】',
      '- 対象: TBL_X',
      '### 【項目定義】',
      '| No | 項目名 | 区分 |',
      '|---|---|---|',
      '| 1 | 登録日 | 表示 |',
      '| 2 | 更新者 | 入力 |',
      '## TBL_X',
      '| 論理名 | 物理名 | 型 |',
      '|---|---|---|',
      '| 登録日 | REG_DATE | DATE |',
      '| 更新者 | UPD_USER | VARCHAR |',
    ].join('\n')
    const c = crudMatrix(buildSpecIndex([{ rel: 'a.md', text: md }])).cells.A001.TBL_X
    expect(c.evidence.map((e) => `${e.line}:${e.ops}`)).toEqual(['4:D', '8:R', '9:?'])
    expect(c.ops).toBe('RD')
  })

  it('động từ Nhật / Việt / Anh; tiếng Anh phải nguyên từ', () => {
    expect(crudOpsOf('新規登録して一覧に表示、変更、取消')).toEqual(['C', 'R', 'U', 'D'])
    expect(crudOpsOf('Thêm mới, tìm kiếm, cập nhật, xoá khách hàng')).toEqual(['C', 'R', 'U', 'D'])
    expect(crudOpsOf('INSERT then select, updated, deleting')).toEqual(['C', 'R', 'U', 'D'])
    expect(crudOpsOf('address preview already target')).toEqual([])
    expect(crudOpsOf('顧客コード（前方一致）')).toEqual([])
  })

  it('xuất TSV / Markdown: hàng màn hình, ô trống khi không có tham chiếu; escape `|`', () => {
    expect(crudText(m, 'tsv').split('\n')[0]).toBe('画面\tTBL_CUSTOMER\tTBL_ORDER')
    expect(crudText(m, 'tsv')).toContain('SCR011 顧客詳細画面\tRUD\tC\n')
    const md = crudText(m, 'md').split('\n')
    expect(md.slice(0, 2)).toEqual(['| 画面 | TBL_CUSTOMER | TBL_ORDER |', '|---|---|---|'])
    expect(md).toContain('| SCR001 ログイン画面 |  |  |')
    const x = crudText({ screens: [{ id: 'A|1', name: '' }], tables: ['T'], cells: {} }, 'md')
    expect(x).toContain('| A\\|1 |  |')
  })
})

describe('lint: item-length (画面項目 dài hơn cột DB cùng 論理名)', () => {
  const screen = (rows: string[]): string =>
    ['## 顧客登録', '- **画面ID**: A001', '- **画面名**: 顧客登録画面', '### 【項目定義】', '| No | 項目名 | 区分 | 桁数 |', '|---|---|---|---|', ...rows, ''].join('\n')
  const db = [
    '## TBL_X',
    '| 論理名 | 物理名 | 型 | 桁数 |',
    '|---|---|---|---|',
    '| 顧客名 | CUST_NAME | VARCHAR(40) | |',
    '| 住所 | ADDR | NVARCHAR2 | 100 |',
    '| 金額 | AMOUNT | NUMERIC(5) | |',
    '',
  ].join('\n')
  const issues = (rows: string[], extra: SpecDoc[] = []) =>
    buildSpecIndex([{ rel: 'a.md', text: screen(rows) }, { rel: 'db.md', text: db }, ...extra]).issues.filter((i) => i.code === 'item-length')

  it('nhập dài hơn cột chữ: cảnh báo kèm cột DB; bằng hoặc ngắn hơn thì không', () => {
    const r = issues(['| 1 | 顧客名 | 入力 | 50 |', '| 2 | 住所 | 入力 | 100 |', '| 3 | 顧客名 | 入力 | 40桁 |'])
    expect(r.map((i) => `${i.severity} ${i.rel}:${i.line} ${i.subject} ${i.detail} ${i.other?.rel}:${i.other?.line}`)).toEqual([
      'warning a.md:7 A001 顧客名 50 > TBL_X.CUST_NAME VARCHAR(40) db.md:4',
    ])
  })

  it('bỏ qua hạng mục hiển thị / nút, cột không phải kiểu chữ, 桁数 không phải số, bảng ngoài phần 画面ID', () => {
    expect(issues(['| 1 | 顧客名 | 表示 | 50 |', '| 2 | 金額 | 入力 | 9 |', '| 3 | 住所 | 入力 | 全角100 |'])).toEqual([])
    const noScreen = { rel: 'b.md', text: '## メモ\n| 項目名 | 桁数 |\n|---|---|\n| 顧客名 | 99 |\n' }
    expect(issues([], [noScreen])).toEqual([])
  })

  it('論理名 thuộc nhiều bảng: chỉ báo khi dài hơn mọi cột', () => {
    const db2 = { rel: 'db2.md', text: '## TBL_Y\n| 論理名 | 物理名 | 型 |\n|---|---|---|\n| 顧客名 | NAME | VARCHAR(60) |\n' }
    expect(issues(['| 1 | 顧客名 | 入力 | 50 |'], [db2])).toEqual([])
    expect(issues(['| 1 | 顧客名 | 入力 | 70 |'], [db2])).toHaveLength(1)
  })
})

describe('lint: ambiguous-term / column-mismatch', () => {
  it('cách viết mơ hồ chỉ trong tài liệu 画面 / テーブル, một cảnh báo mỗi dòng; 同等 / 等しい không tính', () => {
    const screen = '- **画面ID**: A001\n\n顧客名など、適宜表示する。\n金額が等しい場合は同等とみなす。\n仕様は TBD。\n未定\nTBDX ok\n'
    const r = buildSpecIndex([{ rel: 's.md', text: screen }, { rel: 'memo.md', text: 'など TBD 未定\n' }])
    expect(r.issues.filter((i) => i.code === 'ambiguous-term').map((i) => `${i.rel}:${i.line}:${i.subject}`)).toEqual(['s.md:3:など', 's.md:5:TBD', 's.md:6:未定'])
    expect(buildSpecIndex([{ rel: 's.md', text: '- **画面ID**: A001\n顧客名等を表示\n' }]).issues.map((i) => i.subject)).toEqual(['等'])
  })

  it('giới hạn số cảnh báo mơ hồ', () => {
    const r = buildSpecIndex([{ rel: 's.md', text: '- **画面ID**: A001\n' + 'TBD\n'.repeat(2000) }])
    expect(r.issues.filter((i) => i.code === 'ambiguous-term').length).toBe(500)
  })

  it('cùng 物理名 / 論理名 ở hai bảng mà khác kiểu hoặc 桁数 -> cảnh báo ở bảng sau; giống nhau / kiểu trống -> không', () => {
    const tbl = (name: string, rows: string[]): string => `## ${name}\n\n| 論理名 | 物理名 | 型 | 桁数 |\n|---|---|---|---|\n${rows.join('\n')}\n\n---\n\n`
    const md =
      tbl('TBL_A', ['| 顧客コード | CUST_CD | VARCHAR | 10 |', '| 登録日 | REG_DATE | DATE |  |', '| 備考 | NOTE |  |  |']) +
      tbl('TBL_B', ['| 顧客コード | CUST_CD | VARCHAR(10) |  |', '| 登録日時 | REG_DATE | TIMESTAMP |  |', '| 備考 | MEMO | TEXT |  |']) +
      tbl('TBL_C', ['| 顧客コード | CUSTOMER_CD | CHAR | 8 |'])
    const r = buildSpecIndex([{ rel: 'db.md', text: md }])
    expect(r.issues.map((i) => `${i.code} ${i.subject} ${i.detail} @${i.other?.line}`)).toEqual([
      'column-mismatch TBL_B.REG_DATE TIMESTAMP ≠ TBL_A.REG_DATE DATE @6',
      'column-mismatch TBL_C.CUSTOMER_CD CHAR(8) ≠ TBL_A.CUST_CD VARCHAR(10) @5',
    ])
    expect(r.issues[0]).toMatchObject({ severity: 'warning', rel: 'db.md' })
  })

  it('fixture: CUST_CD giống nhau ở TBL_CUSTOMER và TBL_ORDER -> không cảnh báo', () => {
    expect(index.issues.filter((i) => i.code === 'column-mismatch')).toEqual([])
  })
})

describe('用語集 trong chỉ mục', () => {
  it('đọc 用語集.md ở gốc', () => {
    expect(index.glossary?.rel).toBe('用語集.md')
    expect(index.glossary?.entries.map((e) => `${e.ja}=${e.vi}=${e.en}`)).toEqual(['顧客=khách hàng=customer', '受注=đơn hàng=order', '画面遷移=chuyển màn hình=screen transition'])
  })

  it('không có file -> null; glossary.md ở thư mục con (≤ 2 cấp) cũng được, sâu hơn thì không', () => {
    expect(buildSpecIndex([doc('flow.md')]).glossary).toBeNull()
    const g = '| JA | VI | EN |\n|---|---|---|\n| 顧客 | khách hàng | customer |\n'
    expect(buildSpecIndex([{ rel: 'docs/spec/Glossary.md', text: g }]).glossary?.entries).toHaveLength(1)
    expect(buildSpecIndex([{ rel: 'a/b/c/glossary.md', text: g }]).glossary).toBeNull()
  })
})

describe('x2m.json: luật cộng thêm', () => {
  const rules: ProjectRules = { ...EMPTY_RULES, crudVerbs: { C: [], R: [], U: [], D: [] } }
  const project = (r: Partial<ProjectRules>) => ({ path: '/p/x2m.json', warnings: [], rules: { ...rules, ...r } })
  const md = ['## 画面', '- **画面コード**: S01', '- **遷移先**: → S02', '', '名称(仮)は要調整のこと', '', '## 画面2', '- **画面コード**: S02', ''].join('\n')

  it('không truyền project: giữ hành vi cũ, không có khóa project', () => {
    const idx = buildSpecIndex([{ rel: 'a.md', text: md }])
    expect(idx.screens).toEqual([])
    expect('project' in idx).toBe(false)
  })

  it('nhãn 画面ID / 遷移 của dự án', () => {
    const idx = buildSpecIndex([{ rel: 'a.md', text: md }], project({ screenIdLabels: ['画面コード'], transitionLabels: ['遷移先'] }))
    expect(idx.screens.map((s) => s.id)).toEqual(['S01', 'S02'])
    expect(idx.transitions.map((t) => `${t.from}->${t.to}`)).toEqual(['S01->S02'])
    expect(idx.project?.path).toBe('/p/x2m.json')
  })

  it('chữ mơ hồ của dự án khớp nguyên văn, kể cả ký tự đặc biệt của regex', () => {
    const p = project({ screenIdLabels: ['画面コード'], ambiguousWords: ['(仮)'] })
    const issues = buildSpecIndex([{ rel: 'a.md', text: md }], p).issues.filter((i) => i.code === 'ambiguous-term')
    expect(issues.map((i) => `${i.line} ${i.subject}`)).toEqual(['5 (仮)'])
  })

  it('động từ CRUD của dự án', () => {
    expect(crudOpsOf('伝票を起票する')).toEqual([])
    expect(crudOpsOf('伝票を起票する', { C: ['起票'], R: [], U: [], D: [] })).toEqual(['C'])
    const text = ['## 伝票入力', '- **画面ID**: A001', '', 'TBL_X に起票する', '', '## TBL_X', '', '| No | 物理名 | 型 |', '|---|---|---|', '| 1 | ID | INT |', ''].join('\n')
    expect(crudMatrix(buildSpecIndex([{ rel: 'a.md', text }])).cells.A001?.TBL_X?.ops).toBe('?')
    const idx = buildSpecIndex([{ rel: 'a.md', text }], project({ crudVerbs: { C: ['起票'], R: [], U: [], D: [] } }))
    expect(crudMatrix(idx).cells.A001?.TBL_X?.ops).toBe('C')
  })
})
