/* So sánh 新旧 hai tài liệu thiết kế dạng Markdown (đầu ra Excel → Markdown hoặc .md viết tay).
 * Thuần (không Node/DOM): renderer và main dùng chung.
 *
 * - Chia mục theo heading `#`..`####`, ghép mục cũ/mới theo đường dẫn heading.
 * - Trong mục: bảng Markdown so theo hàng (khóa ID/物理名/項目名 nếu duy nhất, không thì LCS theo nội dung
 *   bỏ cột số thứ tự No/項番 — chèn hàng giữa bảng làm đánh số lại không bị báo là đổi cả bảng);
 *   dòng khác (meta bullet, đoạn văn, shape…) so theo dòng, xóa + thêm liền nhau thành "đổi" kèm diff trong dòng.
 * - Dòng trống bỏ qua (không so, không có trong hunks). */

/* --------------------------------- Myers --------------------------------- */

export interface SeqOp {
  op: 'equal' | 'insert' | 'delete'
  /** Chỉ số trong `a` (-1 với insert) */
  a: number
  /** Chỉ số trong `b` (-1 với delete) */
  b: number
}

/** Diff Myers O(ND) sau khi cắt phần đầu/cuối giống nhau. Quá `maxCost` bước sửa thì phần giữa
 * thành một khối xóa + thêm (không treo với đầu vào lớn; bộ nhớ tối đa ~maxCost²/2 số nguyên). */
export function diffSeq<T>(
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean = Object.is,
  maxCost = 5000
): SeqOp[] {
  const n = a.length
  const m = b.length
  let s = 0
  while (s < n && s < m && eq(a[s], b[s])) s++
  let e = 0
  while (e < n - s && e < m - s && eq(a[n - 1 - e], b[m - 1 - e])) e++
  const N = n - s - e
  const M = m - s - e
  const out: SeqOp[] = []
  for (let i = 0; i < s; i++) out.push({ op: 'equal', a: i, b: i })
  const mid = N === 0 || M === 0 ? null : myers(a, b, s, N, M, eq, maxCost)
  if (mid) for (const op of mid) out.push(op)
  else {
    for (let i = 0; i < N; i++) out.push({ op: 'delete', a: s + i, b: -1 })
    for (let j = 0; j < M; j++) out.push({ op: 'insert', a: -1, b: s + j })
  }
  for (let i = 0; i < e; i++) out.push({ op: 'equal', a: n - e + i, b: m - e + i })
  return out
}

function myers<T>(a: readonly T[], b: readonly T[], s: number, N: number, M: number, eq: (x: T, y: T) => boolean, maxCost: number): SeqOp[] | null {
  // trace[d][(k + d) / 2] = x xa nhất trên đường chéo k sau d bước (k cùng chẵn lẻ với d)
  const trace: Int32Array[] = []
  const max = Math.min(N + M, maxCost)
  for (let d = 0; d <= max; d++) {
    const cur = new Int32Array(d + 1)
    const prev = trace[d - 1]
    for (let k = -d; k <= d; k += 2) {
      let x: number
      if (d === 0) x = 0
      else if (k === -d || (k !== d && prev[(k + d - 2) >> 1] < prev[(k + d) >> 1])) x = prev[(k + d) >> 1]
      else x = prev[(k + d - 2) >> 1] + 1
      let y = x - k
      while (x < N && y < M && eq(a[s + x], b[s + y])) {
        x++
        y++
      }
      cur[(k + d) >> 1] = x
      if (x >= N && y >= M) {
        trace.push(cur)
        return backtrack(trace, s, N, M)
      }
    }
    trace.push(cur)
  }
  return null
}

function backtrack(trace: Int32Array[], s: number, N: number, M: number): SeqOp[] {
  const ops: SeqOp[] = []
  let x = N
  let y = M
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d - 1]
    const k = x - y
    const down = k === -d || (k !== d && prev[(k + d - 2) >> 1] < prev[(k + d) >> 1])
    const prevK = down ? k + 1 : k - 1
    const prevX = prev[(prevK + d - 1) >> 1]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x--
      y--
      ops.push({ op: 'equal', a: s + x, b: s + y })
    }
    if (down) {
      y--
      ops.push({ op: 'insert', a: -1, b: s + y })
    } else {
      x--
      ops.push({ op: 'delete', a: s + x, b: -1 })
    }
  }
  while (x > 0 && y > 0) {
    x--
    y--
    ops.push({ op: 'equal', a: s + x, b: s + y })
  }
  return ops.reverse()
}

/** Duyệt kết quả diff: cặp giống nhau, và từng khoảng khác nhau (xóa/thêm liên tiếp) gom lại. */
function forChunks(ops: SeqOp[], onEqual: (a: number, b: number) => void, onGap: (dels: number[], ins: number[]) => void): void {
  let dels: number[] = []
  let ins: number[] = []
  const flush = (): void => {
    if (dels.length || ins.length) onGap(dels, ins)
    dels = []
    ins = []
  }
  for (const op of ops) {
    if (op.op === 'equal') {
      flush()
      onEqual(op.a, op.b)
    } else if (op.op === 'delete') dels.push(op.a)
    else ins.push(op.b)
  }
  flush()
}

/** Ghép phần tử bị xóa với phần tử được thêm trong một khoảng khác nhau: 1-1 thì `similar(x, y, true)`,
 * còn lại LCS theo `similar(x, y, false)` (giữ thứ tự). Kết quả: equal = cặp "đổi". */
function pairGap<T>(dels: T[], ins: T[], similar: (x: T, y: T, single: boolean) => boolean): SeqOp[] {
  if (dels.length === 1 && ins.length === 1 && similar(dels[0], ins[0], true)) return [{ op: 'equal', a: 0, b: 0 }]
  return diffSeq(dels, ins, (x, y) => similar(x, y, false), 1000)
}

/* ------------------------------ Diff trong dòng ------------------------------ */

export interface InlineSegment {
  type: 'same' | 'add' | 'del'
  text: string
}

// Từ ASCII, khoảng trắng liên tiếp, hoặc từng ký tự (CJK, dấu câu…)
const TOKEN_RE = /[A-Za-z0-9_]+|\s+|[\s\S]/gu

/** Diff hai chuỗi theo token; trong mỗi khoảng khác nhau phần `del` đứng trước `add`. */
export function inlineDiff(oldText: string, newText: string): InlineSegment[] {
  const a = oldText.match(TOKEN_RE) ?? []
  const b = newText.match(TOKEN_RE) ?? []
  const segs: InlineSegment[] = []
  const push = (type: InlineSegment['type'], text: string): void => {
    if (!text) return
    const last = segs[segs.length - 1]
    if (last?.type === type) last.text += text
    else segs.push({ type, text })
  }
  forChunks(
    diffSeq(a, b),
    (i) => push('same', a[i]),
    (dels, ins) => {
      push('del', dels.map((i) => a[i]).join(''))
      push('add', ins.map((j) => b[j]).join(''))
    }
  )
  return segs
}

/** Hệ số Dice trên ký tự (bỏ khoảng trắng): 1 = giống hệt, 0 = không chung ký tự nào. */
function dice(x: string[], y: string[]): number {
  if (x.length === 0 && y.length === 0) return 1
  const count = new Map<string, number>()
  for (const c of x) count.set(c, (count.get(c) ?? 0) + 1)
  let common = 0
  for (const c of y) {
    const k = count.get(c)
    if (k) {
      common++
      count.set(c, k - 1)
    }
  }
  return (2 * common) / (x.length + y.length)
}

const chars = (s: string): string[] => Array.from(s.replace(/\s+/g, ''))

/* ------------------------------ Parse Markdown ------------------------------ */

interface Line {
  /** Số dòng (1-based) */
  n: number
  text: string
  fence: boolean
}

interface Section {
  level: number
  path: string
  lines: Line[] // dòng heading (nếu có) ở đầu
}

export const PATH_SEP = ' › '

function splitSections(md: string): Section[] {
  const raw = md.replace(/^﻿/, '').split(/\r\n|\r|\n/)
  const sections: Section[] = [{ level: 0, path: '', lines: [] }]
  const stack: string[] = []
  let fence = ''
  raw.forEach((text, i) => {
    const n = i + 1
    const fm = /^ {0,3}(`{3,}|~{3,})/.exec(text)
    if (fm) {
      if (!fence) fence = fm[1][0]
      else if (fm[1][0] === fence) fence = ''
      sections[sections.length - 1].lines.push({ n, text, fence: true })
      return
    }
    const h = fence ? null : /^(#{1,4})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(text)
    if (h && h[2].trim() !== '') {
      const level = h[1].length
      stack.length = level - 1
      stack[level - 1] = h[2].trim()
      sections.push({ level, path: stack.filter(Boolean).join(PATH_SEP), lines: [{ n, text, fence: false }] })
      return
    }
    sections[sections.length - 1].lines.push({ n, text, fence: fence !== '' })
  })
  if (!sections[0].lines.some((l) => l.text.trim() !== '')) sections.shift()
  return sections
}

interface Row {
  line: Line
  cells: string[]
}

interface Table {
  header: string[]
  headerLine: Line
  delimLine: Line
  rows: Row[]
}

type Block = { kind: 'text'; line: Line } | { kind: 'table'; table: Table }

const DELIM_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

/** Tách một dòng bảng thành ô: `\|` là ký tự `|`, `<br>` thành xuống dòng, bỏ khoảng trắng hai đầu. */
export function splitTableRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|'
      i++
    } else if (s[i] === '|') {
      cells.push(cur)
      cur = ''
    } else cur += s[i]
  }
  if (cur.trim() !== '') cells.push(cur)
  return cells.map((c) => c.trim().replace(/<br\s*\/?>/gi, '\n'))
}

function buildBlocks(lines: Line[]): Block[] {
  const blocks: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.text.trim() === '') continue
    const next = lines[i + 1]
    if (!l.fence && l.text.trimStart().startsWith('|') && next && !next.fence && next.n === l.n + 1 && DELIM_RE.test(next.text) && next.text.includes('-')) {
      const table: Table = { header: splitTableRow(l.text), headerLine: l, delimLine: next, rows: [] }
      i += 2
      while (i < lines.length && !lines[i].fence && lines[i].n === lines[i - 1].n + 1 && lines[i].text.trimStart().startsWith('|')) {
        table.rows.push({ line: lines[i], cells: splitTableRow(lines[i].text) })
        i++
      }
      i--
      blocks.push({ kind: 'table', table })
    } else blocks.push({ kind: 'text', line: l })
  }
  return blocks
}

/* --------------------------------- Kết quả --------------------------------- */

export interface CellChange {
  /** Tên cột (header) */
  column: string
  old: string
  new: string
  segments: InlineSegment[]
}

export interface RowChange {
  /** move: cùng khóa nhưng đổi vị trí (có thể kèm `cells`) */
  kind: 'add' | 'del' | 'change' | 'move'
  /** `物理名=cust_cd`, `No=3` hoặc `行3` */
  key: string
  oldLine?: number
  newLine?: number
  /** Toàn bộ ô theo header (add/del) */
  oldCells?: string[]
  newCells?: string[]
  /** Ô thay đổi (change/move) — cột số thứ tự (No/項番) không tính */
  cells: CellChange[]
}

export interface LineChange {
  kind: 'add' | 'del' | 'change'
  oldLine?: number
  newLine?: number
  oldText?: string
  newText?: string
  segments?: InlineSegment[]
}

export interface SectionDiff {
  kind: 'add' | 'del' | 'change'
  /** Đường dẫn heading (bản mới; bản cũ với 'del'), nối bằng ' › ', '' = phần trước heading đầu */
  path: string
  /** Có khi mục bị xóa hoặc đổi tên */
  oldPath?: string
  /** Dòng đầu mục */
  oldLine?: number
  newLine?: number
  /** Chỉ có với 'change' */
  rows: RowChange[]
  lines: LineChange[]
}

/** Một dòng của hiển thị hai cột (theo thứ tự tài liệu; dòng trống bị bỏ). */
export interface DiffHunk {
  kind: 'same' | 'add' | 'del' | 'change'
  oldLine?: number
  newLine?: number
  oldText?: string
  newText?: string
  /** Chỉ với 'change' */
  segments?: InlineSegment[]
  sectionPath: string
  /** Hàng bảng chỉ đổi vị trí (một hunk 'del' ở chỗ cũ + một 'add' ở chỗ mới) */
  moved?: boolean
}

export interface DiffSummary {
  sectionsAdded: number
  sectionsRemoved: number
  sectionsChanged: number
  rowsAdded: number
  rowsRemoved: number
  rowsChanged: number
  rowsMoved: number
  linesAdded: number
  linesRemoved: number
  linesChanged: number
}

export interface SpecDiff {
  /** Chỉ mục có thay đổi, theo thứ tự tài liệu */
  sections: SectionDiff[]
  hunks: DiffHunk[]
  summary: DiffSummary
}

/* ------------------------------- So sánh bảng ------------------------------- */

const ORD_RE = /^(No\.?|№|項番|#)$/i
const ID_PRIORITY = [/^ID$/i, /^項目ID$/i, /^物理名$/, /^項目名$/]

interface Ctx {
  path: string
  sec: SectionDiff
  hunks: DiffHunk[]
  sum: DiffSummary
}

function hunk(ctx: Ctx, kind: DiffHunk['kind'], o?: Line, n?: Line, moved?: boolean): void {
  const h: DiffHunk = { kind, sectionPath: ctx.path }
  if (o) (h.oldLine = o.n), (h.oldText = o.text)
  if (n) (h.newLine = n.n), (h.newText = n.text)
  if (kind === 'change' && o && n) h.segments = inlineDiff(o.text, n.text)
  if (moved) h.moved = true
  ctx.hunks.push(h)
}

/** Tên cột duy nhất (trùng thêm `#2`), ô thiếu tên thành `列N`. */
function columnNames(t: Table | null): string[] {
  if (!t) return []
  const width = t.rows.reduce((w, r) => Math.max(w, r.cells.length), t.header.length)
  const seen = new Map<string, number>()
  return Array.from({ length: width }, (_, i) => {
    const base = t.header[i] || `列${i + 1}`
    const k = (seen.get(base) ?? 0) + 1
    seen.set(base, k)
    return k > 1 ? `${base}#${k}` : base
  })
}

function diffTable(ctx: Ctx, a: Table | null, b: Table | null): void {
  if (a && b) {
    if (a.headerLine.text.trim() !== b.headerLine.text.trim()) {
      hunk(ctx, 'change', a.headerLine, b.headerLine)
      ctx.sec.lines.push({ kind: 'change', oldLine: a.headerLine.n, newLine: b.headerLine.n, oldText: a.headerLine.text, newText: b.headerLine.text, segments: inlineDiff(a.headerLine.text, b.headerLine.text) })
      ctx.sum.linesChanged++
    } else hunk(ctx, 'same', a.headerLine, b.headerLine)
    hunk(ctx, a.delimLine.text.trim() === b.delimLine.text.trim() ? 'same' : 'change', a.delimLine, b.delimLine)
  } else if (a) {
    hunk(ctx, 'del', a.headerLine)
    hunk(ctx, 'del', a.delimLine)
  } else if (b) {
    hunk(ctx, 'add', undefined, b.headerLine)
    hunk(ctx, 'add', undefined, b.delimLine)
  }
  const oldRows = a?.rows ?? []
  const newRows = b?.rows ?? []
  const oldNames = columnNames(a)
  const newNames = columnNames(b)
  const ordName = [...newNames, ...oldNames].find((c) => ORD_RE.test(c))
  const cols = [...newNames, ...oldNames.filter((c) => !newNames.includes(c))].filter((c) => c !== ordName)
  const record = (names: string[], r: Row): Record<string, string> => Object.fromEntries(names.map((c, i) => [c, r.cells[i] ?? '']))
  const oldRec = oldRows.map((r) => record(oldNames, r))
  const newRec = newRows.map((r) => record(newNames, r))
  const uniqueIn = (recs: Record<string, string>[], c: string): boolean => {
    const vals = recs.map((r) => r[c] ?? '')
    return vals.every((v) => v !== '') && new Set(vals).size === vals.length
  }
  const idName =
    a && b && oldRows.length > 0 && newRows.length > 0
      ? ID_PRIORITY.map((re) => cols.find((c) => re.test(c) && oldNames.includes(c) && newNames.includes(c))).find(
          (c): c is string => c !== undefined && uniqueIn(oldRec, c) && uniqueIn(newRec, c)
        )
      : undefined
  const keyName = ordName ?? idName
  const keyOf = (r: Record<string, string>, idx: number): string => (keyName && r[keyName] ? `${keyName}=${r[keyName]}` : `行${idx + 1}`)
  const sig = (r: Record<string, string>): string => (idName ? r[idName] : cols.map((c) => r[c] ?? '').join('\u0001'))
  const cellChanges = (o: Record<string, string>, n: Record<string, string>): CellChange[] =>
    cols.filter((c) => (o[c] ?? '') !== (n[c] ?? '')).map((c) => ({ column: c, old: o[c] ?? '', new: n[c] ?? '', segments: inlineDiff(o[c] ?? '', n[c] ?? '') }))
  const asList = (names: string[], r: Record<string, string>): string[] => names.map((c) => r[c] ?? '')

  const changed = (i: number, j: number): void => {
    const cells = cellChanges(oldRec[i], newRec[j])
    if (cells.length === 0) return hunk(ctx, 'same', oldRows[i].line, newRows[j].line)
    hunk(ctx, 'change', oldRows[i].line, newRows[j].line)
    ctx.sec.rows.push({ kind: 'change', key: keyOf(newRec[j], j), oldLine: oldRows[i].line.n, newLine: newRows[j].line.n, cells })
    ctx.sum.rowsChanged++
  }
  const added = (j: number): void => {
    hunk(ctx, 'add', undefined, newRows[j].line)
    ctx.sec.rows.push({ kind: 'add', key: keyOf(newRec[j], j), newLine: newRows[j].line.n, newCells: asList(newNames, newRec[j]), cells: [] })
    ctx.sum.rowsAdded++
  }
  const removed = (i: number): void => {
    hunk(ctx, 'del', oldRows[i].line)
    ctx.sec.rows.push({ kind: 'del', key: keyOf(oldRec[i], i), oldLine: oldRows[i].line.n, oldCells: asList(oldNames, oldRec[i]), cells: [] })
    ctx.sum.rowsRemoved++
  }

  const ops = diffSeq(oldRec.map(sig), newRec.map(sig))
  // Hàng theo khóa ID nằm trong khoảng khác nhau ở cả hai phía = di chuyển
  const movedNew = new Map<string, number>()
  const movedOld = new Set<number>()
  if (idName) {
    const insKeys = new Map<string, number>()
    for (const op of ops) if (op.op === 'insert') insKeys.set(newRec[op.b][idName], op.b)
    for (const op of ops) {
      const j = op.op === 'delete' ? insKeys.get(oldRec[op.a][idName]) : undefined
      if (j !== undefined) {
        movedOld.add(op.a)
        movedNew.set(newRec[j][idName], j)
      }
    }
  }
  const movedNewIdx = new Set(movedNew.values())
  const sameCount = (dels: number[], ins: number[]): boolean => dels.length === ins.length
  forChunks(ops, changed, (dels, ins) => {
    const d2 = dels.filter((i) => !movedOld.has(i))
    const i2 = ins.filter((j) => !movedNewIdx.has(j))
    const mDel = dels.filter((i) => movedOld.has(i))
    const mIns = ins.filter((j) => movedNewIdx.has(j))
    const flushOld = (upto: number): void => {
      while (mDel.length && mDel[0] < upto) {
        const i = mDel.shift() as number
        const j = movedNew.get(oldRec[i][idName as string]) as number
        hunk(ctx, 'del', oldRows[i].line, undefined, true)
        ctx.sec.rows.push({ kind: 'move', key: keyOf(newRec[j], j), oldLine: oldRows[i].line.n, newLine: newRows[j].line.n, cells: cellChanges(oldRec[i], newRec[j]) })
        ctx.sum.rowsMoved++
      }
    }
    const flushNew = (upto: number): void => {
      while (mIns.length && mIns[0] < upto) hunk(ctx, 'add', undefined, newRows[mIns.shift() as number].line, true)
    }
    const even = sameCount(d2, i2)
    const similar = (i: number, j: number, single: boolean): boolean => {
      if (single || cols.length === 0) return true
      if (even && ordName && oldRec[i][ordName] && oldRec[i][ordName] === newRec[j][ordName]) return true
      return cols.filter((c) => (oldRec[i][c] ?? '') === (newRec[j][c] ?? '')).length / cols.length >= 0.5
    }
    for (const op of pairGap(d2, i2, similar)) {
      if (op.a >= 0) flushOld(d2[op.a])
      if (op.b >= 0) flushNew(i2[op.b])
      if (op.op === 'equal') changed(d2[op.a], i2[op.b])
      else if (op.op === 'delete') removed(d2[op.a])
      else added(i2[op.b])
    }
    flushOld(Infinity)
    flushNew(Infinity)
  })
}

/* ------------------------------- So sánh mục ------------------------------- */

const META_RE = /^\s*[-*]\s+\*\*(.+?)\*\*/

function lineSimilar(x: string, y: string, single: boolean): boolean {
  if (single) return true
  const mx = META_RE.exec(x)
  const my = META_RE.exec(y)
  if (mx && my) return mx[1] === my[1]
  return dice(chars(x), chars(y)) >= 0.4
}

function blockKey(b: Block): string {
  return b.kind === 'text' ? 'L' + b.line.text.trim() : 'T' + b.table.header.join('\u0001')
}

function diffSectionBody(ctx: Ctx, a: Section, b: Section): void {
  const A = buildBlocks(a.lines)
  const B = buildBlocks(b.lines)
  const pair = (x: Block, y: Block): void => {
    if (x.kind === 'table' && y.kind === 'table') return diffTable(ctx, x.table, y.table)
    if (x.kind !== 'text' || y.kind !== 'text') return
    if (x.line.text.trim() === y.line.text.trim()) return hunk(ctx, 'same', x.line, y.line)
    hunk(ctx, 'change', x.line, y.line)
    ctx.sec.lines.push({ kind: 'change', oldLine: x.line.n, newLine: y.line.n, oldText: x.line.text, newText: y.line.text, segments: inlineDiff(x.line.text, y.line.text) })
    ctx.sum.linesChanged++
  }
  const only = (x: Block, side: 'del' | 'add'): void => {
    if (x.kind === 'table') return side === 'del' ? diffTable(ctx, x.table, null) : diffTable(ctx, null, x.table)
    if (side === 'del') {
      hunk(ctx, 'del', x.line)
      ctx.sec.lines.push({ kind: 'del', oldLine: x.line.n, oldText: x.line.text })
      ctx.sum.linesRemoved++
    } else {
      hunk(ctx, 'add', undefined, x.line)
      ctx.sec.lines.push({ kind: 'add', newLine: x.line.n, newText: x.line.text })
      ctx.sum.linesAdded++
    }
  }
  forChunks(
    diffSeq(A.map(blockKey), B.map(blockKey)),
    (i, j) => pair(A[i], B[j]),
    (dels, ins) => {
      const xs = dels.map((i) => A[i])
      const ys = ins.map((j) => B[j])
      const similar = (x: Block, y: Block, single: boolean): boolean =>
        x.kind === 'table' ? y.kind === 'table' : y.kind === 'text' && lineSimilar(x.line.text, y.line.text, single)
      for (const op of pairGap(xs, ys, similar)) {
        if (op.op === 'equal') pair(xs[op.a], ys[op.b])
        else if (op.op === 'delete') only(xs[op.a], 'del')
        else only(ys[op.b], 'add')
      }
    }
  )
}

function bodySimilarity(a: Section, b: Section): number {
  const body = (s: Section): string[] => s.lines.slice(s.level > 0 ? 1 : 0).map((l) => l.text.trim()).filter(Boolean)
  return dice(body(a), body(b))
}

const firstLine = (s: Section): number | undefined => s.lines[0]?.n

/** So sánh hai tài liệu Markdown thiết kế (CRLF/LF, BOM như nhau). */
export function diffSpecMarkdown(oldMd: string, newMd: string): SpecDiff {
  const A = splitSections(oldMd)
  const B = splitSections(newMd)
  const sum: DiffSummary = {
    sectionsAdded: 0,
    sectionsRemoved: 0,
    sectionsChanged: 0,
    rowsAdded: 0,
    rowsRemoved: 0,
    rowsChanged: 0,
    rowsMoved: 0,
    linesAdded: 0,
    linesRemoved: 0,
    linesChanged: 0,
  }
  const hunks: DiffHunk[] = []
  const sections: SectionDiff[] = []
  const nonBlank = (s: Section): Line[] => s.lines.filter((l) => l.text.trim() !== '')

  const paired = (a: Section, b: Section): void => {
    const sec: SectionDiff = { kind: 'change', path: b.path, oldLine: firstLine(a), newLine: firstLine(b), rows: [], lines: [] }
    if (a.path !== b.path) sec.oldPath = a.path
    diffSectionBody({ path: b.path, sec, hunks, sum }, a, b)
    if (sec.rows.length || sec.lines.length) {
      sections.push(sec)
      sum.sectionsChanged++
    }
  }
  const removed = (a: Section): void => {
    for (const l of nonBlank(a)) hunks.push({ kind: 'del', oldLine: l.n, oldText: l.text, sectionPath: a.path })
    sections.push({ kind: 'del', path: a.path, oldPath: a.path, oldLine: firstLine(a), rows: [], lines: [] })
    sum.sectionsRemoved++
  }
  const added = (b: Section): void => {
    for (const l of nonBlank(b)) hunks.push({ kind: 'add', newLine: l.n, newText: l.text, sectionPath: b.path })
    sections.push({ kind: 'add', path: b.path, newLine: firstLine(b), rows: [], lines: [] })
    sum.sectionsAdded++
  }

  forChunks(
    diffSeq(A, B, (x, y) => x.path === y.path && x.level === y.level),
    (i, j) => paired(A[i], B[j]),
    (dels, ins) => {
      // Đổi tên (kể cả do heading cha đổi tên): chỉ ghép khi cùng cấp và nội dung phần lớn giống nhau
      const xs = dels.map((i) => A[i])
      const ys = ins.map((j) => B[j])
      for (const op of pairGap(xs, ys, (x, y) => x.level === y.level && bodySimilarity(x, y) >= 0.5)) {
        if (op.op === 'equal') paired(xs[op.a], ys[op.b])
        else if (op.op === 'delete') removed(xs[op.a])
        else added(ys[op.b])
      }
    }
  )
  return { sections, hunks, summary: sum }
}

/* --------------------------------- Báo cáo --------------------------------- */

/** Ô bảng Markdown: `|` → `\|`, xuống dòng → `<br>`. */
function esc(s: string): string {
  return s.replace(/\\?\|/g, '\\|').replace(/\r\n|\r|\n/g, '<br>')
}

/** Báo cáo thay đổi dạng Markdown (bảng `| 場所 | 項目 | 旧 | 新 |` cho mỗi mục thay đổi). */
export function specDiffReport(diff: SpecDiff, names: { oldName: string; newName: string }): string {
  const s = diff.summary
  const out: string[] = [
    '# 新旧比較レポート',
    '',
    `- **旧**: ${names.oldName}`,
    `- **新**: ${names.newName}`,
    `- **セクション**: 追加 ${s.sectionsAdded} / 削除 ${s.sectionsRemoved} / 変更 ${s.sectionsChanged}`,
    `- **表の行**: 追加 ${s.rowsAdded} / 削除 ${s.rowsRemoved} / 変更 ${s.rowsChanged} / 移動 ${s.rowsMoved}`,
    `- **テキスト行**: 追加 ${s.linesAdded} / 削除 ${s.linesRemoved} / 変更 ${s.linesChanged}`,
    '',
  ]
  if (diff.sections.length === 0) return out.concat('変更はありません。', '').join('\n')
  const label = (p: string): string => p || '(冒頭)'
  const list = (kind: 'add' | 'del', title: string): void => {
    const secs = diff.sections.filter((x) => x.kind === kind)
    if (secs.length === 0) return
    out.push(`## ${title}`, '')
    for (const x of secs) out.push(`- ${label(x.path)} (${kind === 'add' ? '新' : '旧'} L${kind === 'add' ? x.newLine : x.oldLine})`)
    out.push('')
  }
  list('add', '追加されたセクション')
  list('del', '削除されたセクション')
  const changed = diff.sections.filter((x) => x.kind === 'change')
  if (changed.length) out.push('## 変更されたセクション', '')
  for (const x of changed) {
    out.push(`### ${x.oldPath !== undefined ? `${label(x.oldPath)} → ${label(x.path)}` : label(x.path)}`, '', '| 場所 | 項目 | 旧 | 新 |', '|---|---|---|---|')
    const entries: { at: number; cells: string[] }[] = []
    const where = (k: string): string => (x.path ? x.path + PATH_SEP + k : k)
    for (const r of x.rows) {
      const at = r.newLine ?? r.oldLine ?? 0
      if (r.kind === 'add') entries.push({ at, cells: [where(r.key), '(行追加)', '', (r.newCells ?? []).join(' | ')] })
      else if (r.kind === 'del') entries.push({ at, cells: [where(r.key), '(行削除)', (r.oldCells ?? []).join(' | '), ''] })
      else if (r.kind === 'move') entries.push({ at, cells: [where(r.key), '(行移動)', `L${r.oldLine}`, `L${r.newLine}`] })
      for (const c of r.cells) entries.push({ at, cells: [where(r.key), c.column, c.old, c.new] })
    }
    for (const l of x.lines) {
      entries.push({
        at: l.newLine ?? l.oldLine ?? 0,
        cells: [where(l.newLine !== undefined ? `L${l.newLine}` : `旧L${l.oldLine}`), 'テキスト', l.oldText ?? '', l.newText ?? ''],
      })
    }
    entries.sort((p, q) => p.at - q.at) // sort ổn định: hàng và các ô của nó giữ thứ tự
    for (const e of entries) out.push('| ' + e.cells.map(esc).join(' | ') + ' |')
    out.push('')
  }
  return out.join('\n')
}
