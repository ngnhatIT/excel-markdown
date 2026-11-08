import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSpecIndex, erMermaid, impactOf, impactSuggestions, SPEC_MAX_DOCS, SPEC_MAX_NODES, SPEC_MAX_REFS, transitionMermaid, type SpecDoc } from './specIndex'

const root = join(__dirname, '../..')
const fx = join(root, 'test/fixtures/specmap')
// Thứ tự như listMarkdownFiles (theo chiều rộng): file ở gốc trước, rồi thư mục con
const REL = ['flow.md', 'db/customer.md', 'screens/SCR001_login.md', 'screens/SCR002_menu.md', 'screens/SCR010_search.md', 'screens/SCR011_detail.md', 'screens/old/SCR010_v1.md']
const docs: SpecDoc[] = REL.map((rel) => ({ rel, text: readFileSync(join(fx, rel), 'utf8') }))
const index = buildSpecIndex(docs)

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
      'warning dangling-transition 権限あり？ flow.md:7',
      'warning dangling-transition エラー画面 SCR099 flow.md:9',
      'warning dangling-transition 受注一覧 screens/SCR002_menu.md:9',
      'error unknown-column TBL_CUSTOMER.CUST_KANA screens/SCR010_search.md:22',
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
    expect(f.source).toMatch(/class n\d+(,n\d+){2} dangling/)
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
    const def = docs[1]
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
    const s = buildSpecIndex([docs[1], { rel: 'u.md', text: 'see TBL_CUSTOMER.md' }])
    expect(s.issues).toEqual([])
  })

  it('bảng trùng tên giữa hai tài liệu -> lỗi duplicate-table', () => {
    const r = buildSpecIndex([docs[1], { rel: 'copy.md', text: docs[1].text }])
    expect(r.issues.filter((i) => i.code === 'duplicate-table').map((i) => `${i.subject} ${i.rel}`)).toEqual(['TBL_CUSTOMER copy.md', 'TBL_ORDER copy.md'])
  })
})
