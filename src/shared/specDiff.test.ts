import { describe, expect, it } from 'vitest'
import { diffSeq, diffSpecMarkdown, inlineDiff, specDiffReport, splitTableRow, type SeqOp } from './specDiff'

/** Dựng lại a và b từ ops để kiểm tính đúng của diff. */
function replay<T>(a: T[], b: T[], ops: SeqOp[]): { a: T[]; b: T[] } {
  const ra: T[] = []
  const rb: T[] = []
  for (const op of ops) {
    if (op.op !== 'insert') ra.push(a[op.a])
    if (op.op !== 'delete') rb.push(b[op.b])
    if (op.op === 'equal') expect(a[op.a]).toEqual(b[op.b])
  }
  return { a: ra, b: rb }
}

function lcsLen(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp[a.length][b.length]
}

const ITEMS = `## 画面項目定義

- **画面ID**: SP0001
- **画面名**: 顧客検索画面

### 【項目定義】

| No | 項目名 | 型 | 桁数 | 備考 |
|---|---|---|---|---|
| 1 | 顧客コード | 文字列 | 10 | 半角英数 |
| 2 | 顧客名 | 文字列 | 50 |  |
| 3 | 電話番号 | 文字列 | 15 | 形式: 03-xxxx<br>ハイフンあり |
| 4 | 住所 | 文字列 | 200 |  |
| 5 | 備考欄 | 文字列 | 200 | a \\| b |

> ※ 必須項目は○で表示する
`

describe('diffSeq', () => {
  it('ngẫu nhiên: dựng lại đúng hai dãy và tối thiểu (bằng LCS quy hoạch động)', () => {
    let seed = 7
    const rnd = (n: number): number => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n)
    for (let t = 0; t < 300; t++) {
      const a = Array.from({ length: rnd(20) }, () => 'abcd'[rnd(4)])
      const b = Array.from({ length: rnd(20) }, () => 'abcd'[rnd(4)])
      const ops = diffSeq(a, b)
      expect(replay(a, b, ops)).toEqual({ a, b })
      expect(ops.filter((o) => o.op === 'equal').length).toBe(lcsLen(a, b))
    }
  })

  it('vượt giới hạn chi phí thì thành khối xóa + thêm, vẫn đúng', () => {
    const a = Array.from({ length: 50 }, (_, i) => 'a' + i)
    const b = ['x', ...Array.from({ length: 50 }, (_, i) => 'b' + i), 'y']
    const ops = diffSeq(['p', ...a, 'q'], ['p', ...b, 'q'], Object.is, 10)
    expect(replay(['p', ...a, 'q'], ['p', ...b, 'q'], ops).b).toEqual(['p', ...b, 'q'])
    expect(ops[0]).toEqual({ op: 'equal', a: 0, b: 0 })
    expect(ops.at(-1)).toEqual({ op: 'equal', a: 51, b: 53 })
  })
})

describe('inlineDiff', () => {
  it('CJK theo từng ký tự, ASCII theo từ', () => {
    expect(inlineDiff('顧客名', '顧客氏名')).toEqual([
      { type: 'same', text: '顧客' },
      { type: 'add', text: '氏' },
      { type: 'same', text: '名' },
    ])
    expect(inlineDiff('VARCHAR(10) NOT NULL', 'VARCHAR(20) NOT NULL')).toEqual([
      { type: 'same', text: 'VARCHAR(' },
      { type: 'del', text: '10' },
      { type: 'add', text: '20' },
      { type: 'same', text: ') NOT NULL' },
    ])
  })
})

describe('splitTableRow', () => {
  it('giữ `\\|` và `<br>` trong ô', () => {
    expect(splitTableRow('| 1 | a \\| b | x<br>y |  |')).toEqual(['1', 'a | b', 'x\ny', ''])
  })
})

describe('diffSpecMarkdown', () => {
  it('tài liệu giống nhau → không thay đổi, mọi hunk là same', () => {
    const d = diffSpecMarkdown(ITEMS, ITEMS)
    expect(d.sections).toEqual([])
    expect(d.hunks.every((h) => h.kind === 'same')).toBe(true)
    expect(d.hunks.length).toBe(ITEMS.split('\n').filter((l) => l.trim()).length)
    expect(specDiffReport(d, { oldName: 'a.md', newName: 'b.md' })).toContain('変更はありません。')
  })

  it('CRLF / BOM như LF', () => {
    const d = diffSpecMarkdown(ITEMS, '﻿' + ITEMS.replace(/\n/g, '\r\n'))
    expect(d.sections).toEqual([])
  })

  it('chèn hàng giữa bảng (đánh số lại No) → chỉ một hàng thêm', () => {
    const neu = ITEMS.replace('| 2 | 顧客名 | 文字列 | 50 |  |', '| 2 | 顧客カナ | 文字列 | 50 | 全角カナ |\n| 3 | 顧客名 | 文字列 | 50 |  |')
      .replace('| 3 | 電話番号', '| 4 | 電話番号')
      .replace('| 4 | 住所', '| 5 | 住所')
      .replace('| 5 | 備考欄', '| 6 | 備考欄')
    const d = diffSpecMarkdown(ITEMS, neu)
    expect(d.summary).toMatchObject({ rowsAdded: 1, rowsRemoved: 0, rowsChanged: 0, linesChanged: 0, sectionsChanged: 1 })
    expect(d.sections).toHaveLength(1)
    expect(d.sections[0].path).toBe('画面項目定義 › 【項目定義】')
    expect(d.sections[0].rows).toEqual([
      expect.objectContaining({ kind: 'add', key: 'No=2', newLine: 11, newCells: ['2', '顧客カナ', '文字列', '50', '全角カナ'] }),
    ])
    expect(d.hunks.filter((h) => h.kind !== 'same')).toEqual([
      expect.objectContaining({ kind: 'add', newLine: 11, sectionPath: '画面項目定義 › 【項目定義】' }),
    ])
  })

  it('chèn hàng giữ nguyên số No (khóa No) → chỉ một hàng thêm', () => {
    const neu = ITEMS.replace('| 3 | 電話番号', '| 2-1 | FAX | 文字列 | 15 |  |\n| 3 | 電話番号')
    const d = diffSpecMarkdown(ITEMS, neu)
    expect(d.sections[0].rows.map((r) => [r.kind, r.key])).toEqual([['add', 'No=2-1']])
  })

  it('đổi một ô → chỉ ô đó, có diff trong ô theo ký tự CJK', () => {
    const d = diffSpecMarkdown(ITEMS, ITEMS.replace('| 2 | 顧客名 |', '| 2 | 顧客氏名 |'))
    expect(d.summary).toMatchObject({ rowsChanged: 1, rowsAdded: 0, rowsRemoved: 0 })
    const row = d.sections[0].rows[0]
    expect(row).toMatchObject({ kind: 'change', key: 'No=2', oldLine: 11, newLine: 11 })
    expect(row.cells).toEqual([
      {
        column: '項目名',
        old: '顧客名',
        new: '顧客氏名',
        segments: [
          { type: 'same', text: '顧客' },
          { type: 'add', text: '氏' },
          { type: 'same', text: '名' },
        ],
      },
    ])
    const h = d.hunks.find((x) => x.kind === 'change')
    expect(h?.segments?.some((s) => s.type === 'add' && s.text === '氏')).toBe(true)
  })

  it('ô nhiều dòng (<br>) và \\| được so theo giá trị', () => {
    const d = diffSpecMarkdown(ITEMS, ITEMS.replace('a \\| b', 'a \\| c').replace('ハイフンあり', 'ハイフンなし'))
    expect(d.sections[0].rows.flatMap((r) => r.cells.map((c) => [c.old, c.new]))).toEqual([
      ['形式: 03-xxxx\nハイフンあり', '形式: 03-xxxx\nハイフンなし'],
      ['a | b', 'a | c'],
    ])
  })

  it('đổi thứ tự hàng trong bảng có 物理名 → báo di chuyển, không báo đổi số No', () => {
    const old = `## テーブル定義

| 項番 | 論理名 | 物理名 | 型 |
|---|---|---|---|
| 1 | 顧客コード | cust_cd | VARCHAR(10) |
| 2 | 登録日 | reg_date | DATE |
| 3 | 割引率 | disc_rate | NUMERIC(5,2) |
| 4 | 合計 | total | NUMERIC |
`
    const neu = old
      .replace('| 2 | 登録日 | reg_date | DATE |\n| 3 | 割引率 | disc_rate | NUMERIC(5,2) |', '| 2 | 割引率 | disc_rate | NUMERIC(5,2) |\n| 3 | 登録日 | reg_date | TIMESTAMP |')
    const d = diffSpecMarkdown(old, neu)
    expect(d.summary).toMatchObject({ rowsMoved: 1, rowsAdded: 0, rowsRemoved: 0, rowsChanged: 0 })
    const mv = d.sections[0].rows[0]
    expect(mv.kind).toBe('move')
    expect(mv.cells.map((c) => [c.column, c.old, c.new])).toEqual(mv.oldLine === 6 ? [['型', 'DATE', 'TIMESTAMP']] : [])
    const moved = d.hunks.filter((h) => h.moved)
    expect(moved.map((h) => h.kind).sort()).toEqual(['add', 'del'])
    // hunks giữ thứ tự dòng tăng dần ở cả hai phía (để vẽ hai cột)
    const olds = d.hunks.flatMap((h) => (h.oldLine ? [h.oldLine] : []))
    const news = d.hunks.flatMap((h) => (h.newLine ? [h.newLine] : []))
    expect(olds).toEqual([...olds].sort((x, y) => x - y))
    expect(news).toEqual([...news].sort((x, y) => x - y))
  })

  it('thêm / xóa mục', () => {
    const extra = '\n### 【イベント】\n\n- **検索ボタン**: 一覧を表示する\n'
    const added = diffSpecMarkdown(ITEMS, ITEMS + extra)
    expect(added.sections).toEqual([expect.objectContaining({ kind: 'add', path: '画面項目定義 › 【イベント】', newLine: 18 })])
    expect(added.summary).toMatchObject({ sectionsAdded: 1, sectionsChanged: 0, linesAdded: 0 })
    expect(added.hunks.filter((h) => h.kind === 'add').map((h) => h.newText)).toEqual(['### 【イベント】', '- **検索ボタン**: 一覧を表示する'])
    const removed = diffSpecMarkdown(ITEMS + extra, ITEMS)
    expect(removed.sections).toEqual([expect.objectContaining({ kind: 'del', path: '画面項目定義 › 【イベント】', oldLine: 18 })])
  })

  it('đổi tên sheet (heading cha) → ghép theo vị trí, chỉ báo dòng heading', () => {
    const d = diffSpecMarkdown(ITEMS, ITEMS.replace('## 画面項目定義', '## 画面項目定義v2'))
    expect(d.summary).toMatchObject({ sectionsAdded: 0, sectionsRemoved: 0, sectionsChanged: 1, linesChanged: 1 })
    expect(d.sections[0]).toMatchObject({ path: '画面項目定義v2', oldPath: '画面項目定義' })
  })

  it('đổi giá trị meta bullet → một dòng đổi, có segment', () => {
    const d = diffSpecMarkdown(ITEMS, ITEMS.replace('顧客検索画面', '顧客一覧画面'))
    expect(d.summary).toMatchObject({ linesChanged: 1, linesAdded: 0, linesRemoved: 0 })
    expect(d.sections[0].lines[0]).toMatchObject({
      kind: 'change',
      oldLine: 4,
      newLine: 4,
      segments: [
        { type: 'same', text: '- **画面名**: 顧客' },
        { type: 'del', text: '検索' },
        { type: 'add', text: '一覧' },
        { type: 'same', text: '画面' },
      ],
    })
  })

  it('báo cáo: bảng 場所/項目/旧/新, escape | và xuống dòng', () => {
    const neu = ITEMS.replace('a \\| b', 'a \\| c').replace('ハイフンあり', 'ハイフンなし').replace('顧客検索画面', '顧客一覧画面')
    const r = specDiffReport(diffSpecMarkdown(ITEMS, neu), { oldName: 'v1.xlsx', newName: 'v2.xlsx' })
    expect(r).toContain('- **旧**: v1.xlsx')
    expect(r).toContain('- **表の行**: 追加 0 / 削除 0 / 変更 2 / 移動 0')
    expect(r).toContain('| 場所 | 項目 | 旧 | 新 |')
    expect(r).toContain('| 画面項目定義 › 【項目定義】 › No=5 | 備考 | a \\| b | a \\| c |')
    expect(r).toContain('| 画面項目定義 › 【項目定義】 › No=3 | 備考 | 形式: 03-xxxx<br>ハイフンあり | 形式: 03-xxxx<br>ハイフンなし |')
    expect(r).toContain('| 画面項目定義 › L4 | テキスト | - **画面名**: 顧客検索画面 | - **画面名**: 顧客一覧画面 |')
    // mỗi dòng bảng đúng 4 cột: không có `|` chưa escape
    for (const line of r.split('\n').filter((l) => l.startsWith('| 画面'))) {
      expect(line.replace(/\\\|/g, '').split('|').length).toBe(6)
    }
  })

  it('bảng trong code fence và heading trong code fence không bị tách', () => {
    const md = '## A\n\n```\n# không phải heading\n| a | b |\n|---|---|\n```\n'
    const d = diffSpecMarkdown(md, md.replace('| a | b |', '| a | c |'))
    expect(d.summary).toMatchObject({ sectionsChanged: 1, linesChanged: 1, rowsChanged: 0 })
  })

  it('đầu vào lớn (20k dòng) xong dưới 2 giây', () => {
    const doc = (v: number): string => {
      const out: string[] = []
      for (let s = 0; s < 200; s++) {
        out.push(`## Sheet${s}`, '', `- **機能ID**: F${s}`, '', '### 【項目定義】', '', '| No | 項目名 | 型 |', '|---|---|---|')
        for (let r = 0; r < 95; r++) out.push(`| ${r + 1} | 項目${s}_${r}${v && r % 30 === 0 ? '改' : ''} | 文字列 |`)
      }
      return out.join('\n')
    }
    const a = doc(0)
    const b = doc(1)
    expect(a.split('\n').length).toBeGreaterThan(20000)
    let t = performance.now()
    const d = diffSpecMarkdown(a, b)
    expect(performance.now() - t).toBeLessThan(2000)
    expect(d.summary.rowsChanged).toBe(800)
    // hoàn toàn khác nhau (rơi vào nhánh giới hạn chi phí)
    const lines = (p: string): string => Array.from({ length: 20000 }, (_, i) => `${p} ${i}`).join('\n')
    t = performance.now()
    const d2 = diffSpecMarkdown(lines('x'), lines('y'))
    expect(performance.now() - t).toBeLessThan(2000)
    expect(d2.hunks.length).toBeGreaterThanOrEqual(20000)
  })
})
