import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Block, ParsedFile } from './model'
import { parseMarkdownFile } from './parse'

const golden = readFileSync(
  fileURLToPath(new URL('../../../../test/golden/kihon-sekkei.xlsx.md', import.meta.url)),
  'utf8'
)
const g = (md: string) => parseMarkdownFile(md, 's.md').sheets[0].blocks

describe('parseMarkdownFile: golden kihon-sekkei', () => {
  const p = parseMarkdownFile(golden, 'kihon-sekkei.xlsx.md')

  it('title và tên sheet', () => {
    expect(p.title).toBe('kihon-sekkei')
    expect(p.sheets.map((s) => s.name)).toEqual(['画面項目定義', 'テーブル定義'])
  })

  it('thứ tự block của sheet 1', () => {
    expect(p.sheets[0].blocks.map((b) => b.kind)).toEqual([
      'banner',
      'table',
      'meta',
      'heading',
      'table',
      'note',
      'heading',
      'note',
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph'
    ])
    expect(p.sheets[0].blocks[0]).toEqual({ kind: 'banner', label: '基本設計', title: '画面項目定義書' })
  })

  it('meta gộp một block, sub-bullet nối bằng xuống dòng', () => {
    const meta = p.sheets[0].blocks[2] as Extract<Block, { kind: 'meta' }>
    expect(meta.items.map((i) => i.label)).toEqual(['機能ID', '機能名', '画面ID', '画面名', '画面遷移'])
    expect(meta.items[4].value.text).toBe('メニュー → 顧客検索\n→ 顧客詳細')
  })

  it('bảng: header/ô qua inlineCell (escape, <br>, link)', () => {
    const t = p.sheets[0].blocks[4] as Extract<Block, { kind: 'table' }>
    expect(t.header.map((c) => c.text)).toEqual(['No', '項目名', '区分', '型', '桁数', '必須', '初期値', '備考'])
    expect(t.rows).toHaveLength(6)
    expect(t.rows[0][6]).toEqual({ text: '<null>' })
    expect(t.rows[2][7]).toEqual({ text: '形式: 03-xxxx-xxxx\n　※ハイフンあり' })
    expect(t.rows[4][7]).toEqual({ text: '[仕様](http://example.com/a)' })
    expect(t.rows[5][7]).toEqual({ text: '詳細仕様', link: 'https://example.com/spec?id=1&lang=ja' })
  })

  it('ghi chú và đoạn văn đã bỏ escape', () => {
    expect(p.sheets[0].blocks[5]).toEqual({ kind: 'note', text: '※ 必須項目は○で表示する' })
    expect(p.sheets[0].blocks[7]).toEqual({ kind: 'note', text: '# 見出しではない' })
    expect(p.sheets[0].blocks[8]).toEqual({ kind: 'paragraph', text: '1. リストではない 補足' })
    expect(p.sheets[0].blocks[9]).toEqual({ kind: 'paragraph', text: '- これも リストではない' })
  })

  it('sheet 2: meta rồi bảng', () => {
    expect(p.sheets[1].blocks.map((b) => b.kind)).toEqual(['meta', 'table'])
  })

  it('CRLF cho kết quả y hệt', () => {
    expect(parseMarkdownFile(golden.replace(/\n/g, '\r\n'), 'kihon-sekkei.xlsx.md')).toEqual(p)
  })
})

describe('parseMarkdownFile: tách sheet (§7)', () => {
  it('--- tách sheet, ## đầu phần là tên sheet', () => {
    expect(
      parseMarkdownFile('# kihon\n\n## 画面A\n\nx\n\n---\n\n## 画面B\n\ny\n', 'k.md').sheets.map((s) => s.name)
    ).toEqual(['画面A', '画面B'])
  })

  it('## không đứng đầu phần không tách sheet, thành heading', () => {
    const one = parseMarkdownFile('# 画面設計\n\n## 概要\n\na\n\n## 項目\n\nb\n', 'd.md')
    expect(one.sheets).toEqual([
      {
        name: '概要',
        blocks: [
          { kind: 'paragraph', text: 'a' },
          { kind: 'heading', text: '項目' },
          { kind: 'paragraph', text: 'b' }
        ]
      }
    ])
  })

  it('tên sheet không có ## lấy phần sau __ cuối của tên file', () => {
    expect(parseMarkdownFile('x', 'kihon__テーブル定義.md').sheets[0].name).toBe('テーブル定義')
    expect(parseMarkdownFile('x', 'a__b__c.md').sheets[0].name).toBe('c')
  })

  it('không có __ thì lấy tên file không đuôi; nhiều phần giữ tên thô (chưa khử trùng)', () => {
    expect(parseMarkdownFile('a\n\n---\n\nb', 'memo.md').sheets.map((s) => s.name)).toEqual(['memo', 'memo'])
  })

  it('__ nằm cuối tên (phần sau rỗng) thì quay về tên file', () => {
    expect(parseMarkdownFile('x', 'kihon__.md').sheets[0].name).toBe('kihon__')
  })

  it('phần rỗng bị bỏ qua', () => {
    expect(parseMarkdownFile('a\n\n---\n', 'memo.md').sheets).toHaveLength(1)
    expect(parseMarkdownFile('---\n\na\n\n---\n\n---\n\nb', 'memo.md').sheets).toHaveLength(2)
    expect(parseMarkdownFile('', 'memo.md')).toEqual({ title: null, sheets: [] })
  })

  it('# đầu file là title, không thành block', () => {
    expect(parseMarkdownFile('# T\n\nx', 'memo.md')).toEqual({
      title: 'T',
      sheets: [{ name: 'memo', blocks: [{ kind: 'paragraph', text: 'x' }] }]
    })
  })

  it('file chỉ có `# tiêu đề` vẫn là một sheet (tiêu đề thành heading), không lặng lẽ mất khi gộp', () => {
    expect(parseMarkdownFile('# 新規\n', 'kihon__画面.md')).toEqual({
      title: '新規',
      sheets: [{ name: '画面', blocks: [{ kind: 'heading', text: '新規' }] }]
    })
    expect(parseMarkdownFile('  \n\n', 'memo.md').sheets).toEqual([])
  })

  it('# không đứng đầu file là heading thường, title = null', () => {
    const p = parseMarkdownFile('x\n\n# T\n', 'memo.md')
    expect(p.title).toBeNull()
    expect(p.sheets[0].blocks).toEqual([
      { kind: 'paragraph', text: 'x' },
      { kind: 'heading', text: 'T' }
    ])
  })

  it('## không có block nào sau vẫn là một sheet rỗng', () => {
    expect(parseMarkdownFile('## A\n\n---\n\n## B\n\nx', 's.md').sheets).toEqual([
      { name: 'A', blocks: [] },
      { name: 'B', blocks: [{ kind: 'paragraph', text: 'x' }] }
    ])
  })

  it('BOM đầu file bị bỏ', () => {
    expect(parseMarkdownFile('﻿# T\n\n## S\n\nx', 'f.md')).toMatchObject({ title: 'T', sheets: [{ name: 'S' }] })
  })

  it('tên sheet lấy chữ hiển thị của heading', () => {
    expect(parseMarkdownFile('## **A** \\* `b`\n\nx', 's.md').sheets[0].name).toBe('A * b')
  })
})

describe('parseMarkdownFile: banner và ghi chú (§5)', () => {
  it('banner chỉ khi là block đầu của sheet', () => {
    expect(parseMarkdownFile('x\n\n> 基本設計：A', 's.md').sheets[0].blocks[1]).toEqual({
      kind: 'note',
      text: '基本設計：A'
    })
  })

  it('blockquote đầu sheet nhưng không bắt đầu bằng 基本設計 là note', () => {
    expect(g('> メモ：A')).toEqual([{ kind: 'note', text: 'メモ：A' }])
  })

  it('banner không có ：thì title rỗng; tách tại ：đầu tiên', () => {
    expect(g('> 基本設計')).toEqual([{ kind: 'banner', label: '基本設計', title: '' }])
    expect(g('> 基本設計：A：B')).toEqual([{ kind: 'banner', label: '基本設計', title: 'A：B' }])
  })

  it('banner đầu sheet sau tên sheet ##', () => {
    expect(g('## S\n\n> 基本設計：A')).toEqual([{ kind: 'banner', label: '基本設計', title: 'A' }])
  })

  it('note nhiều đoạn nối bằng xuống dòng', () => {
    expect(g('x\n\n> a\n>\n> b\n> c')).toEqual([
      { kind: 'paragraph', text: 'x' },
      { kind: 'note', text: 'a\nb\nc' }
    ])
  })

  it('blockquote rỗng không làm hỏng', () => {
    expect(g('x\n\n>')).toEqual([
      { kind: 'paragraph', text: 'x' },
      { kind: 'note', text: '' }
    ])
  })
})

describe('parseMarkdownFile: Markdown viết tay (§8)', () => {
  it('list không đánh số: mỗi item một dòng, tiền tố ・', () => {
    expect(g('- 項目1\n- 項目2')).toEqual([
      { kind: 'paragraph', text: '・項目1' },
      { kind: 'paragraph', text: '・項目2' }
    ])
  })

  it('list đánh số: tiền tố là số hiển thị `N. ` (theo số bắt đầu của list)', () => {
    expect(g('1. x\n2. y')).toEqual([
      { kind: 'paragraph', text: '1. x' },
      { kind: 'paragraph', text: '2. y' }
    ])
    expect(g('3. a\n4. b')).toEqual([
      { kind: 'paragraph', text: '3. a' },
      { kind: 'paragraph', text: '4. b' }
    ])
    expect(g('0. z\n1. w')).toEqual([
      { kind: 'paragraph', text: '0. z' },
      { kind: 'paragraph', text: '1. w' }
    ])
  })

  it('list đánh số không bao giờ thành meta: giữ `N. ` + chữ (bỏ ký hiệu **); item con có số riêng', () => {
    expect(g('1. **A**: v\n2. x\n   1. y')).toEqual([
      { kind: 'paragraph', text: '1. A: v' },
      { kind: 'paragraph', text: '2. x' },
      { kind: 'paragraph', text: '1. y' }
    ])
    expect(g('1. **初期表示**: 画面を表示する\n2. **検索**：条件で検索する')).toEqual([
      { kind: 'paragraph', text: '1. 初期表示: 画面を表示する' },
      { kind: 'paragraph', text: '2. 検索：条件で検索する' }
    ])
  })

  it('list đánh số con trong value meta và trong ghi chú giữ tiền tố `N. `; bullet con không số giữ nguyên chữ', () => {
    expect(g('- **処理**:\n  1. 検索\n  2. 表示')).toEqual([
      { kind: 'meta', items: [{ label: '処理', value: { text: '1. 検索\n2. 表示' } }] }
    ])
    expect(g('- **処理**: 概要\n  3. a\n  4. b\n  - c')).toEqual([
      { kind: 'meta', items: [{ label: '処理', value: { text: '概要\n3. a\n4. b\nc' } }] }
    ])
    expect(g('x\n\n> 1. x\n> 2. y')).toEqual([
      { kind: 'paragraph', text: 'x' },
      { kind: 'note', text: '1. x\n2. y' }
    ])
    // lồng nhau: mỗi list đánh số theo số bắt đầu của chính nó
    expect(g('x\n\n> 1. a\n>    1. b\n> 2. c')).toEqual([
      { kind: 'paragraph', text: 'x' },
      { kind: 'note', text: '1. a\n1. b\n2. c' }
    ])
  })

  it('HTML: <br> riêng một dòng và comment bị bỏ, HTML khác giữ chữ', () => {
    expect(g('a\n\n<br>\n\nb')).toEqual([
      { kind: 'paragraph', text: 'a' },
      { kind: 'paragraph', text: 'b' }
    ])
    expect(g('a\n\n<BR />\n\n<br/>\n\nb')).toEqual([
      { kind: 'paragraph', text: 'a' },
      { kind: 'paragraph', text: 'b' }
    ])
    expect(g('a\n\n<!-- c -->\n\nb')).toEqual([
      { kind: 'paragraph', text: 'a' },
      { kind: 'paragraph', text: 'b' }
    ])
    expect(g('a\n\n<!-- nhiều\ndòng -->\n\nb')).toEqual([
      { kind: 'paragraph', text: 'a' },
      { kind: 'paragraph', text: 'b' }
    ])
    expect(g('<div>x</div>')).toEqual([{ kind: 'paragraph', text: '<div>x</div>' }])
  })

  it('HTML: <br> trong khối HTML thành xuống dòng (mọi kiểu viết hoa/thường); khối chỉ còn khoảng trắng bị bỏ', () => {
    // khối HTML type 7 kéo dài tới dòng trống nên chữ ngay sau <br> nằm chung khối
    expect(g('<br>\n次の段落')).toEqual([{ kind: 'paragraph', text: '次の段落' }])
    expect(g('a\n\n<br>\n<br>\n\nb')).toEqual([
      { kind: 'paragraph', text: 'a' },
      { kind: 'paragraph', text: 'b' }
    ])
    expect(g('<BR/>\n<Br />\n<br>')).toEqual([])
    expect(g('<br><br>')).toEqual([])
    // đoạn chỉ có khoảng trắng toàn角 không phải đoạn "chỉ có <br>": giữ
    expect(g('　')).toEqual([{ kind: 'paragraph', text: '　' }])
    expect(g('<br>\n行1<br>行2<BR />行3')).toEqual([{ kind: 'paragraph', text: '行1\n行2\n行3' }])
    // HTML khác giữ nguyên chữ, chỉ <br> đổi
    expect(g('<div>a<br>b</div>')).toEqual([{ kind: 'paragraph', text: '<div>a\nb</div>' }])
    expect(g('<br>\n<!-- c -->')).toEqual([])
    // trong ghi chú cũng vậy
    expect(g('x\n\n> <br>\n> 注記')).toEqual([
      { kind: 'paragraph', text: 'x' },
      { kind: 'note', text: '注記' }
    ])
  })

  it('HTML trong blockquote: cùng quy tắc bỏ <br>/comment', () => {
    expect(g('x\n\n> a\n>\n> <br>\n>\n> <!-- c -->\n>\n> b')).toEqual([
      { kind: 'paragraph', text: 'x' },
      { kind: 'note', text: 'a\nb' }
    ])
    expect(g('x\n\n> <div>y</div>')).toEqual([
      { kind: 'paragraph', text: 'x' },
      { kind: 'note', text: '<div>y</div>' }
    ])
  })

  it('meta: ：toàn角 ngay sau **label** cũng là dấu phân cách', () => {
    expect(g('- **作成者**：山田\n- **確認者**： 鈴木')).toEqual([
      {
        kind: 'meta',
        items: [
          { label: '作成者', value: { text: '山田' } },
          { label: '確認者', value: { text: '鈴木' } }
        ]
      }
    ])
  })

  it('item meta gộp một block, item thường tách ra', () => {
    expect(g('- **作成者**: 山田\n- メモ')).toEqual([
      { kind: 'meta', items: [{ label: '作成者', value: { text: '山田' } }] },
      { kind: 'paragraph', text: '・メモ' }
    ])
    expect(g('- メモ\n- **A**: 1\n- **B**: 2\n- x\n- **C**: 3')).toEqual([
      { kind: 'paragraph', text: '・メモ' },
      {
        kind: 'meta',
        items: [
          { label: 'A', value: { text: '1' } },
          { label: 'B', value: { text: '2' } }
        ]
      },
      { kind: 'paragraph', text: '・x' },
      { kind: 'meta', items: [{ label: 'C', value: { text: '3' } }] }
    ])
  })

  it('meta: không có giá trị, bỏ : và khoảng trắng đầu', () => {
    expect(g('- **A**\n- **B**:\n- **C**:   v')).toEqual([
      {
        kind: 'meta',
        items: [
          { label: 'A', value: { text: '' } },
          { label: 'B', value: { text: '' } },
          { label: 'C', value: { text: 'v' } }
        ]
      }
    ])
  })

  it('meta: ** đầu item nhưng phần sau không bắt đầu bằng : hoặc ： thì là item thường', () => {
    expect(g('- **A** v\n- **B:** w')).toEqual([
      { kind: 'paragraph', text: '・A v' },
      { kind: 'paragraph', text: '・B: w' }
    ])
    expect(g('- x **A**: v')).toEqual([{ kind: 'paragraph', text: '・x A: v' }])
  })

  it('meta: giá trị là đúng một link thì giữ link; URL trần chỉ giữ chữ', () => {
    expect(g('- **A**: [x](http://a.b)')).toEqual([
      { kind: 'meta', items: [{ label: 'A', value: { text: 'x', link: 'http://a.b' } }] }
    ])
    expect(g('- **A**: http://a.b')).toEqual([
      { kind: 'meta', items: [{ label: 'A', value: { text: 'http://a.b' } }] }
    ])
  })

  it('meta: sub-bullet nối từng dòng; giá trị rỗng thì chỉ còn các dòng sub-bullet', () => {
    expect(g('- **A**: v\n  - s1\n  - s2\n- **B**\n  - t')).toEqual([
      {
        kind: 'meta',
        items: [
          { label: 'A', value: { text: 'v\ns1\ns2' } },
          { label: 'B', value: { text: 't' } }
        ]
      }
    ])
  })

  it('meta: giá trị có sub-bullet: một link -> cả ô là hyperlink; nhiều link -> thêm (url), không mất URL', () => {
    expect(g('- **A**: [x](http://a.b)\n  - s')).toEqual([
      { kind: 'meta', items: [{ label: 'A', value: { text: 'x\ns', link: 'http://a.b' } }] }
    ])
    expect(g('- **A**: [x](http://a.b)\n  - [y](https://c.d)')).toEqual([
      { kind: 'meta', items: [{ label: 'A', value: { text: 'x (http://a.b)\ny (https://c.d)' } }] }
    ])
  })

  it('item thường có list con: item con thành dòng ・ kế tiếp', () => {
    expect(g('- a\n  - b\n- c')).toEqual([
      { kind: 'paragraph', text: '・a' },
      { kind: 'paragraph', text: '・b' },
      { kind: 'paragraph', text: '・c' }
    ])
  })

  it('item rỗng và item có nhiều khối không làm hỏng', () => {
    expect(g('-\n- x')).toEqual([
      { kind: 'paragraph', text: '・' },
      { kind: 'paragraph', text: '・x' }
    ])
    expect(g('- a\n\n  second\n\n  ```\n  c\n  ```')).toEqual([
      { kind: 'paragraph', text: '・a' },
      { kind: 'paragraph', text: 'second' },
      { kind: 'code', lines: ['c'] }
    ])
  })

  it('code block: từng dòng', () => {
    expect(g('```\nline1\nline2\n```')).toEqual([{ kind: 'code', lines: ['line1', 'line2'] }])
    expect(g('    indented\n    code')).toEqual([{ kind: 'code', lines: ['indented', 'code'] }])
  })

  it('heading mọi cấp thành heading', () => {
    expect(g('###### h6')).toEqual([{ kind: 'heading', text: 'h6' }])
    expect(g('x\n\n## h2\n\n### h3')).toEqual([
      { kind: 'paragraph', text: 'x' },
      { kind: 'heading', text: 'h2' },
      { kind: 'heading', text: 'h3' }
    ])
  })

  it('đoạn văn giữ xuống dòng mềm và cứng', () => {
    expect(g('a\nb')).toEqual([{ kind: 'paragraph', text: 'a\nb' }])
    expect(g('a  \nb')).toEqual([{ kind: 'paragraph', text: 'a\nb' }])
  })

  it('đoạn văn bỏ ký hiệu inline, ảnh thành chữ alt', () => {
    expect(g('**b** *i* ![alt](http://x/y.png)')).toEqual([{ kind: 'paragraph', text: 'b i alt' }])
  })

  it('HTML thành đoạn văn (raw đã trim)', () => {
    expect(g('<div>\n\ntext')).toEqual([
      { kind: 'paragraph', text: '<div>' },
      { kind: 'paragraph', text: 'text' }
    ])
  })

  it('bảng GFM: dòng thiếu/thừa ô được căn theo header', () => {
    const t = g('| a | b | c |\n|---|---|---|\n| 1 |\n| 1 | 2 | 3 | 4 |')[0] as Extract<Block, { kind: 'table' }>
    expect(t.header.map((c) => c.text)).toEqual(['a', 'b', 'c'])
    expect(t.rows.map((r) => r.length)).toEqual([3, 3])
    expect(t.rows[0].map((c) => c.text)).toEqual(['1', '', ''])
  })
})

describe('parseMarkdownFile: không crash với Markdown bất kỳ', () => {
  it('300 chuỗi ghép ngẫu nhiên (seed cố định)', () => {
    const pieces = [
      '# h',
      '## s',
      '---',
      '> q',
      '- **L**: v',
      '  - sub',
      '| a | b |\n|---|---|\n| 1 | 2 |',
      '```',
      '<div>',
      '',
      'text'
    ]
    const seps = ['\n', '\n\n', '\n  ', '\r\n']
    // mulberry32: PRNG xác định để test lặp lại được
    let a = 0x2f6e2b1
    const rnd = (): number => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]
    for (let i = 0; i < 300; i++) {
      const n = 1 + Math.floor(rnd() * 12)
      let md = ''
      for (let j = 0; j < n; j++) md += pick(pieces) + pick(seps)
      let parsed: ParsedFile | undefined
      expect(() => (parsed = parseMarkdownFile(md, 'fuzz.md')), JSON.stringify(md)).not.toThrow()
      for (const s of parsed!.sheets) expect(Array.isArray(s.blocks)).toBe(true)
    }
  })
})


describe('parseMarkdownFile: Markdown không tin cậy (không crash, không treo)', () => {
  it('quote lồng 5 000 cấp (marked tràn stack) -> mỗi dòng một đoạn, giữ chữ', () => {
    const p = parseMarkdownFile('> '.repeat(5000) + 'x\nend', 'deep.md')
    expect(p.sheets).toHaveLength(1)
    expect(p.sheets[0].blocks.at(-1)).toEqual({ kind: 'paragraph', text: 'end' })
  })

  it('list lồng 2 000 cấp (marked tràn heap) -> thụt lề bị chặn, xong nhanh', () => {
    const md = Array.from({ length: 2000 }, (_, i) => ' '.repeat(i * 2) + '- x' + i).join('\n')
    const t = Date.now()
    const blocks = g(md)
    expect(Date.now() - t).toBeLessThan(5000)
    expect(blocks.some((b) => b.kind === 'paragraph' && b.text.includes('x1999'))).toBe(true)
  })

  it('đoạn rất dài nhiều `<br>` / link / `**` mở không đóng: tuyến tính, giữ chữ', () => {
    const t = Date.now()
    const br = g('a<br>'.repeat(100_000))
    const em = g('**a '.repeat(20_000))
    expect(Date.now() - t).toBeLessThan(10_000)
    expect((br[0] as { text: string }).text).toBe('a\n'.repeat(100_000))
    expect((em[0] as { text: string }).text.startsWith('**a **a')).toBe(true)
  })

  it('đoạn > 20 000 ký tự vẫn ra đúng chữ như đoạn ngắn (tách nguồn inline tại khoảng trắng)', () => {
    const unit = '\\*x\\* `c` [l](https://e.example) a&amp;b '
    const long = unit.repeat(2000)
    expect((g(long)[0] as { text: string }).text).toBe('*x* c l (https://e.example) a&b '.repeat(2000))
  })
})

describe('parseMarkdownFile: round-trip với Excel -> Markdown', () => {
  it('căn cột bảng theo :---: / ---: / :---', () => {
    const [t] = g('| a | b | c | d |\n|:---|:---:|---:|---|\n| 1 | 2 | 3 | 4 |')
    expect(t).toMatchObject({ kind: 'table', align: ['left', 'center', 'right', null] })
  })

  it('ảnh đứng riêng một đoạn -> block image (alt như chữ cũ); ảnh giữa câu vẫn là chữ alt', () => {
    expect(g('![画面 (A1:B2)](book_images/image1.png)')).toEqual([
      { kind: 'image', alt: '画面 (A1:B2)', src: 'book_images/image1.png' }
    ])
    expect(g('図: ![x](a.png) です')).toEqual([{ kind: 'paragraph', text: '図: x です' }])
  })

  it('đoạn / ghi chú có link: một link -> hyperlink cả ô; nhiều link -> thêm (url)', () => {
    expect(g('詳細は[仕様](https://example.com)を参照')).toEqual([
      { kind: 'paragraph', text: '詳細は仕様を参照', link: 'https://example.com' }
    ])
    expect(g('[A](https://a.example) と [B](https://b.example)')).toEqual([
      { kind: 'paragraph', text: 'A (https://a.example) と B (https://b.example)' }
    ])
    expect(g('> ※ [A](https://a.example)\n>\n> - [B](https://b.example)')).toEqual([
      { kind: 'note', text: '※ A (https://a.example)\nB (https://b.example)' }
    ])
    expect(g('> ※ 詳細は[A](https://a.example)')).toEqual([{ kind: 'note', text: '※ 詳細はA', link: 'https://a.example' }])
    expect(g('- 項目 [A](https://a.example)')).toEqual([{ kind: 'paragraph', text: '・項目 A', link: 'https://a.example' }])
  })

  const table = '| No | 項目名 | 区分 |\n|---|---|---|\n| 1 | 顧客コード | 入力 |\n| 2 | 顧客名 | 選択 |\n| 3 | 備考 |  |\n'

  it('〔コメント〕: chữ của ô khớp duy nhất -> ghi chú của ô, bỏ dòng; không khớp / trùng -> giữ dòng', () => {
    const blocks = g(table + '\n- 〔コメント B5: 顧客コード〕桁数チェック。<br>赤枠表示。\n- 〔コメント C9: 無い〕x\n')
    expect(blocks).toHaveLength(2)
    expect((blocks[0] as Extract<Block, { kind: 'table' }>).rows[0][1]).toEqual({ text: '顧客コード', note: '桁数チェック。\n赤枠表示。' })
    expect(blocks[1]).toEqual({ kind: 'paragraph', text: '・〔コメント C9: 無い〕x' })
    // chữ xuất hiện ở hai ô -> không đoán
    const dup = g(table + table + '\n- 〔コメント B5: 顧客コード〕x\n')
    expect(dup.at(-1)).toEqual({ kind: 'paragraph', text: '・〔コメント B5: 顧客コード〕x' })
    // ô value meta cũng nhận ghi chú
    const meta = g('- **機能ID**: SP01\n\n- 〔コメント B3: SP01〕メモ\n')
    expect(meta).toEqual([{ kind: 'meta', items: [{ label: '機能ID', value: { text: 'SP01', note: 'メモ' } }] }])
  })

  it('〔入力規則〕: gắn vào cột duy nhất của bảng ngay trước mà mọi giá trị nằm trong danh sách, bỏ dòng', () => {
    const blocks = g(table + '\n- 〔図形 A1〕x\n- 〔入力規則 C2:C50〕入力 / 選択 / 表示\n')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ kind: 'table', validations: [{ col: 2, values: ['入力', '選択', '表示'] }] })
    expect(blocks[1]).toEqual({ kind: 'paragraph', text: '・〔図形 A1〕x' })
  })

  it('〔入力規則〕 không chắc chắn -> giữ nguyên dòng (không tạo danh sách sai)', () => {
    const keep = (line: string, md = table) => {
      const blocks = g(md + '\n' + line + '\n')
      expect(blocks.at(-1)).toEqual({ kind: 'paragraph', text: line.replace(/^- /, '・') })
      expect(blocks[0]).not.toHaveProperty('validations')
    }
    keep('- 〔入力規則 C2:C50〕入力') // 選択 không thuộc danh sách
    keep('- 〔入力規則 C2:C50〕=Sheet2!$A$1:$A$3') // công thức
    keep('- 〔入力規則 C2:C50〕入力 / 選択 / a,b') // dấu phẩy
    keep('- 〔入力規則 C2:C50〕入力 / 選択', '段落\n') // không có bảng phía trước
    keep('- 〔入力規則 C2:C50〕1 / 2 / 3', '| a | b |\n|---|---|\n| 1 | 2 |\n') // hai cột cùng khớp
  })
})

describe('front-matter YAML', () => {
  it('bỏ front-matter đầu file (do app tạo), không thành sheet rác', () => {
    const r = parseMarkdownFile('---\nsource: a.xlsx\nsheet: 表紙\n---\n## 表紙\n\n本文\n', 'a.md')
    expect(r.sheets.map((s) => s.name)).toEqual(['表紙'])
    expect(JSON.stringify(r)).not.toContain('source')
  })

  it('`---` giữa file vẫn tách sheet như cũ', () => {
    expect(parseMarkdownFile('## A\n\nx\n\n---\n\n## B\n\ny\n', 'a.md').sheets.map((s) => s.name)).toEqual(['A', 'B'])
  })
})
