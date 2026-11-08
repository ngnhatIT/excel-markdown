/* Bản đồ thiết kế + 影響調査: chỉ mục thuần (không AI, không mạng) của cả thư mục tài liệu Markdown đã convert.
 * Rút ra 画面 (meta 画面ID / 画面名), 画面遷移 (meta chuỗi `A → B` và dòng `〔矢印〕A → B（nhãn）` từ shape),
 * テーブル定義 (parseTableDefs), chỗ nhắc tới bảng / cột / 画面ID ở nơi khác, và lỗi nhất quán.
 * Dùng chung main (IPC, CLI, MCP) + renderer. Dữ liệu không tin cậy: mọi thứ đều có giới hạn. */
import { findGlossaryRel, parseGlossary, type GlossaryEntry } from './glossary'
import { splitTableRow } from './specDiff'
import { parseTableDefs, toErMermaid, type TableColumn, type TableDef } from './tableDef'

/** Giới hạn cho đầu vào không tin cậy */
export const SPEC_MAX_DOCS = 5000
export const SPEC_MAX_REFS = 20_000
export const SPEC_MAX_NODES = 500
/** Mermaid mặc định từ chối sơ đồ dài hơn 50 000 ký tự */
const MERMAID_MAX_TEXT = 45_000
/** Dòng dài hơn (ảnh data: base64...) không quét tham chiếu */
const MAX_LINE = 20_000
/** Tên vật lý ngắn hơn không tính tham chiếu (giảm nhiễu: `id`, `no`...) */
const MIN_NAME = 3
/** Tối đa cảnh báo `ambiguous-term` (tài liệu viết mơ hồ hàng loạt không làm ngập danh sách) */
const MAX_AMBIGUOUS = 500
/** Cách viết mơ hồ trong 設計書 cần chốt. `等` loại các từ ghép thường gặp (同等, 平等, 等しい, 等号...). */
const AMBIGUOUS_RE = /など|適宜|原則|要確認|検討中|未定|(?<![A-Za-z0-9])TB[DC](?![A-Za-z0-9])|(?<![同平均対上高初中劣優何])等(?![しい号級価分式])/

export interface SpecDoc {
  /** Đường dẫn tương đối trong thư mục, phân cách `/` */
  rel: string
  text: string
}

export interface SpecLoc {
  rel: string
  /** Dòng tính từ 1 */
  line: number
  /** Heading gần nhất phía trên (để nhảy tới trong bản xem), '' nếu không có */
  heading: string
}

export interface SpecScreen extends SpecLoc {
  id: string
  name: string
  /** Dòng cuối của phần (`#`/`##`/`---`) chứa 画面ID */
  end: number
}

export interface SpecNode {
  /** Screen: 画面ID; nút treo (chưa định nghĩa): `?` + ID hoặc tên */
  key: string
  label: string
  screen: boolean
}

export interface SpecTransition extends SpecLoc {
  from: string
  to: string
  label: string
  /** `↔`: hai chiều */
  bidi: boolean
}

export type SpecRefKind = 'table' | 'column' | 'screen'

export interface SpecRef extends SpecLoc {
  kind: SpecRefKind
  /** Tên bảng / tên vật lý của cột / 画面ID (dạng như khi định nghĩa) */
  name: string
  /** Cột: bảng nếu viết `TBL.COL` (hoặc tên logic chỉ thuộc một bảng), '' nếu không rõ */
  table: string
  /** Chữ khớp trong dòng (để tô sáng) */
  term: string
  snippet: string
}

export type SpecIssueCode = 'dangling-transition' | 'duplicate-screen' | 'duplicate-table' | 'unknown-column' | 'ambiguous-term' | 'column-mismatch'

export interface SpecIssue extends SpecLoc {
  severity: 'error' | 'warning'
  code: SpecIssueCode
  /** Đối tượng: chữ của nút treo / 画面ID / tên bảng / `TBL.COL` */
  subject: string
  /** Trùng / lệch kiểu: nơi định nghĩa đầu tiên */
  other?: { rel: string; line: number }
  /** column-mismatch: kiểu(桁数) ở đây và ở `other`, vd `VARCHAR(10)` / `CHAR(8)` */
  detail?: string
}

export interface SpecIndex {
  docCount: number
  screens: SpecScreen[]
  nodes: SpecNode[]
  transitions: SpecTransition[]
  tables: TableDef[]
  refs: SpecRef[]
  issues: SpecIssue[]
  /** 用語集 của dự án (`用語集.md` / `glossary.md` ở gốc hoặc sâu tối đa 2 cấp), null nếu không có */
  glossary: { rel: string; entries: GlossaryEntry[] } | null
  truncated: { docs: boolean; refs: boolean }
}

/* -------------------------------- Tiện ích -------------------------------- */

/** Bỏ escape Markdown của converter (`\_`, `\|`...), `<br>`, `**`, `` ` `` để so chữ thuần. */
const plain = (s: string): string =>
  s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!<>~&|])/g, '$1')

/** Nhãn meta để so alias: NFKC, chữ thường, bỏ khoảng trắng / `*` / `_`. */
const normLabel = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[\s*_`]/g, '')
/** Tên màn hình để so: NFKC, bỏ khoảng trắng, bỏ đuôi 画面 (`顧客検索画面` ≡ `顧客検索`). */
const normName = (s: string): string => s.normalize('NFKC').replace(/\s+/g, '').replace(/画面$/, '').toLowerCase()
/** Khóa so tên vật lý: chữ ASCII không phân biệt hoa thường, CJK giữ nguyên. */
const up = (s: string): string => s.normalize('NFKC').toUpperCase()

const META_RE = /^\s*[-*+]\s+(?:\*\*)?([^*:：|]{1,40}?)(?:\*\*)?\s*[:：]\s*(.*?)\s*$/
const SCREEN_ID_LABELS = new Set(['画面id', '画面番号', 'screenid'])
const SCREEN_NAME_LABELS = new Set(['画面名', '画面名称', 'screenname'])
const TRANSITION_LABELS = new Set(['画面遷移', 'screentransition'])
const ARROW_SPLIT = /\s*(→|->|⇒|=>|⟶|➡|↔|<->)\s*/
const ID_LIKE = /^[A-Za-z][A-Za-z0-9]*\d[A-Za-z0-9_-]*$/
/** Định danh ASCII (có thể có `.` / `-`): bảng, cột, `TBL.COL`, 画面ID */
const TOKEN_RE = /(?<![A-Za-z0-9_$#])[A-Za-z0-9_][A-Za-z0-9_$#-]*(?:\.[A-Za-z_][A-Za-z0-9_$#-]*)*/g
// shortcut: `TBL_CUSTOMER.md` (tên file) không phải cột; danh sách đuôi cố định, mở rộng khi gặp nhiễu khác
const FILE_EXT = /^(?:md|markdown|xlsx?|xlsm|csv|sql|txt|json|ya?ml|png|jpe?g|gif|pdf|docx?)$/i
const isAscii = (s: string): boolean => /^[\x20-\x7e]+$/.test(s)

function snippetOf(line: string, at: number): string {
  const s = line.trim().replace(/\s+/g, ' ')
  if (s.length <= 140) return s
  const start = Math.max(0, Math.min(at - 50, s.length - 140))
  return (start > 0 ? '…' : '') + s.slice(start, start + 140) + (start + 140 < s.length ? '…' : '')
}

/** Mỗi dòng của tài liệu: heading gần nhất + số "phần" (đổi ở `#`/`##` và `---`, như parseTableDefs). */
function lineInfo(lines: string[]): { heading: string[]; section: number[] } {
  const heading: string[] = []
  const section: number[] = []
  let h = ''
  let sec = 0
  let fence = ''
  lines.forEach((line, i) => {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (f) {
      if (!fence) fence = f[1]
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = ''
    } else if (!fence) {
      const m = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
      if (m) {
        h = plain(m[2]).trim()
        if (m[1].length <= 2) sec++
      } else if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) sec++
    }
    heading[i] = h
    section[i] = sec
  })
  return { heading, section }
}

/** Tách đầu mút "ログイン SCR001" -> { id: 'SCR001', name: 'ログイン' }; không có ID thì id ''. */
function splitEndpoint(text: string): { id: string; name: string } {
  const toks = text.split(/\s+/).filter(Boolean)
  const id = toks.find((t) => ID_LIKE.test(t)) ?? ''
  return { id, name: toks.filter((t) => t !== id).join(' ') }
}

/** Nhãn cạnh `（…）` / `(…)` ở cuối đầu mút. */
function splitLabel(text: string): { text: string; label: string } {
  const m = /^(.*?)\s*[（(]([^（）()]*)[）)]\s*$/.exec(text)
  return m && m[1] ? { text: m[1].trim(), label: m[2].trim() } : { text: text.trim(), label: '' }
}

/* --------------------------------- Chỉ mục -------------------------------- */

interface RawEdge extends SpecLoc {
  from: string
  to: string
  label: string
  bidi: boolean
}

/** Chỉ mục của cả thư mục. Không ném với Markdown bất kỳ. */
export function buildSpecIndex(input: SpecDoc[]): SpecIndex {
  const docs = input.slice(0, SPEC_MAX_DOCS)
  const screens: SpecScreen[] = []
  const tables: TableDef[] = []
  const raw: RawEdge[] = []
  const infos = new Map<string, { lines: string[]; heading: string[]; section: number[] }>()
  /** Phần (rel + section) chứa định nghĩa của screen / bảng: nhắc tên trong chính phần đó không tính tham chiếu */
  const screenSec = new Map<string, string>()
  const tableSec = new Map<string, string>()
  /** Dòng nằm trong khối bảng định nghĩa cột: không quét tham chiếu */
  const defLines = new Map<string, Set<number>>()

  /* Lượt 1: screen, chuỗi 遷移 (chữ thô), bảng */
  for (const doc of docs) {
    const lines = doc.text.split(/\r?\n/)
    const { heading, section } = lineInfo(lines)
    infos.set(doc.rel, { lines, heading, section })
    const loc = (i: number): SpecLoc => ({ rel: doc.rel, line: i + 1, heading: heading[i] })
    let current: SpecScreen | null = null
    let pendingName = ''
    /** Đầu mút cuối của chuỗi 画面遷移 trước: sub-bullet `→ X` nối tiếp từ đây */
    let chainEnd = ''
    const pushChain = (value: string, i: number, start: string): void => {
      const parts = value.split(ARROW_SPLIT)
      let prev = start
      for (let k = 0; k < parts.length; k += 2) {
        const { text, label } = splitLabel(parts[k])
        if (k === 0 && !text) continue // bắt đầu bằng mũi tên: đi từ `start`
        if (k > 0 && prev && text) raw.push({ ...loc(i), from: prev, to: text, label, bidi: /↔|<->/.test(parts[k - 1]) })
        prev = text
      }
      chainEnd = prev
    }
    lines.forEach((line, i) => {
      if (line.length > MAX_LINE) return
      if (section[i] !== section[i - 1] && i > 0) {
        current = null
        pendingName = ''
      }
      const text = plain(line)
      const arrow = /〔矢印〕\s*(.+)$/.exec(text)
      if (arrow) {
        chainEnd = ''
        const { text: body, label } = splitLabel(arrow[1])
        const parts = body.split(ARROW_SPLIT)
        if (parts.length === 3 && parts[0].trim() && parts[2].trim()) {
          raw.push({ ...loc(i), from: parts[0].trim(), to: parts[2].trim(), label, bidi: /↔|<->/.test(parts[1]) })
        }
        return
      }
      const cont = /^\s{2,}[-*+]\s+(?:→|->|⇒|=>|⟶|➡)\s*(.+)$/.exec(text)
      if (cont && chainEnd) return pushChain('→ ' + cont[1], i, chainEnd)
      if (text.trim()) chainEnd = ''
      const m = META_RE.exec(text)
      if (!m) return
      const label = normLabel(m[1])
      const value = m[2].trim()
      if (!value) return
      if (SCREEN_ID_LABELS.has(label)) {
        current = { ...loc(i), id: value.normalize('NFKC'), name: pendingName, end: section.lastIndexOf(section[i]) + 1 }
        screens.push(current)
        if (!screenSec.has(up(current.id))) screenSec.set(up(current.id), `${doc.rel}#${section[i]}`)
        pendingName = ''
      } else if (SCREEN_NAME_LABELS.has(label)) {
        if (current && !current.name) current.name = value
        else pendingName = value
      } else if (TRANSITION_LABELS.has(label)) {
        const cur = current as SpecScreen | null
        pushChain(value, i, cur ? cur.id : '')
      }
    })
    for (const def of parseTableDefs(doc.text, doc.rel)) {
      tables.push(def)
      if (!tableSec.has(up(def.tableName))) tableSec.set(up(def.tableName), `${doc.rel}#${section[def.line - 1]}`)
      const set = defLines.get(doc.rel) ?? new Set<number>()
      const last = Math.max(...def.columns.map((c) => c.line))
      for (let n = def.line; n <= last; n++) set.add(n)
      defLines.set(doc.rel, set)
    }
  }

  const issues: SpecIssue[] = []

  /* Trùng 画面ID / tên bảng: giữ định nghĩa đầu tiên */
  const screenById = new Map<string, SpecScreen>()
  for (const s of screens) {
    const first = screenById.get(up(s.id))
    if (first) issues.push({ rel: s.rel, line: s.line, heading: s.heading, severity: 'error', code: 'duplicate-screen', subject: s.id, other: { rel: first.rel, line: first.line } })
    else screenById.set(up(s.id), s)
  }
  const tableByName = new Map<string, TableDef>()
  for (const t of tables) {
    const first = tableByName.get(up(t.tableName))
    const heading = infos.get(t.source)?.heading[t.line - 1] ?? ''
    if (first) issues.push({ rel: t.source, line: t.line, heading, severity: 'error', code: 'duplicate-table', subject: t.tableName, other: { rel: first.source, line: first.line } })
    else tableByName.set(up(t.tableName), t)
  }

  /* Cùng 物理名 (hoặc 論理名) ở hai bảng nhưng khác kiểu / 桁数: một cảnh báo mỗi cột, so với nơi định nghĩa đầu tiên */
  const colFirst = new Map<string, { t: TableDef; c: TableColumn }>()
  for (const t of tableByName.values()) {
    for (const c of t.columns) {
      const lg = c.logical.trim().normalize('NFKC')
      for (const k of [`p|${up(c.name)}`, lg.length >= 2 ? `l|${lg}` : '']) {
        if (!k) continue
        const first = colFirst.get(k)
        if (!first) {
          colFirst.set(k, { t, c })
          continue
        }
        const a = typeSig(first.c)
        const b = typeSig(c)
        if (first.t === t || !a || !b || a === b) continue
        const heading = infos.get(t.source)?.heading[c.line - 1] ?? ''
        issues.push({ rel: t.source, line: c.line, heading, severity: 'warning', code: 'column-mismatch', subject: `${t.tableName}.${c.name}`, other: { rel: first.t.source, line: first.c.line }, detail: `${b} ≠ ${first.t.tableName}.${first.c.name} ${a}` })
        break
      }
    }
  }

  /* Giải đầu mút: 画面ID -> tên màn hình -> bí danh "tên ID" học từ đầu mút khác -> nút treo */
  const screenByName = new Map<string, SpecScreen>()
  for (const s of screenById.values()) if (s.name && !screenByName.has(normName(s.name))) screenByName.set(normName(s.name), s)
  const alias = new Map<string, string>()
  for (const e of raw) {
    for (const end of [e.from, e.to]) {
      const { id, name } = splitEndpoint(end)
      if (id && name && !alias.has(normName(name))) alias.set(normName(name), id)
    }
  }
  const nodes = new Map<string, SpecNode>()
  for (const s of screenById.values()) nodes.set(s.id, { key: s.id, label: s.name ? `${s.id} ${s.name}` : s.id, screen: true })
  const resolve = (end: string): string => {
    const { id, name } = splitEndpoint(end)
    const byId = (x: string): SpecScreen | undefined => screenById.get(up(x))
    const hit = (id && byId(id)) || screenByName.get(normName(end)) || (name && screenByName.get(normName(name))) || (alias.has(normName(end)) ? byId(alias.get(normName(end)) as string) : undefined)
    if (hit) return hit.id
    const key = '?' + (id || alias.get(normName(end)) || end).normalize('NFKC')
    const node = nodes.get(key)
    // Nhãn đầy đủ nhất ("メニュー SCR002" hơn "メニュー")
    if (!node || end.length > node.label.length) nodes.set(key, { key, label: end, screen: false })
    return key
  }
  const transitions: SpecTransition[] = raw.map((e) => ({ ...e, from: resolve(e.from), to: resolve(e.to) }))
  const danglingSeen = new Set<string>()
  for (const tr of transitions) {
    for (const k of [tr.from, tr.to]) {
      // Ô rẽ nhánh của sơ đồ (権限あり？) không phải màn hình: không báo thiếu định nghĩa
      if (k.startsWith('?') && !danglingSeen.has(k) && !isDecision(nodes.get(k)?.label ?? k.slice(1))) {
        danglingSeen.add(k)
        issues.push({ rel: tr.rel, line: tr.line, heading: tr.heading, severity: 'warning', code: 'dangling-transition', subject: nodes.get(k)?.label ?? k.slice(1) })
      }
    }
  }

  /* Lượt 2: tham chiếu */
  const columnsOf = new Map<string, Set<string>>() // bảng -> cột (khóa up)
  const columnName = new Map<string, string>() // khóa up -> tên như định nghĩa
  const logical = new Map<string, { table: string; name: string }[]>()
  const tableLogical = new Map<string, string>()
  for (const t of tableByName.values()) {
    columnsOf.set(up(t.tableName), new Set(t.columns.map((c) => up(c.name))))
    if (t.logicalName.trim().length >= 2) tableLogical.set(t.logicalName.trim(), t.tableName)
    for (const c of t.columns) {
      if (c.name.length >= MIN_NAME && !columnName.has(up(c.name))) columnName.set(up(c.name), c.name)
      const lg = c.logical.trim()
      if (lg.length >= 2) logical.set(lg, [...(logical.get(lg) ?? []), { table: t.tableName, name: c.name }])
    }
  }
  const cjkTables = [...tableByName.values()].map((t) => t.tableName).filter((n) => !isAscii(n) && n.length >= MIN_NAME)

  const screenLines = new Set(screens.map((s) => `${s.rel}:${s.line}`))
  const refs: SpecRef[] = []
  let refsTruncated = false
  const unknownSeen = new Set<string>()
  for (const doc of docs) {
    const info = infos.get(doc.rel)
    if (!info) continue
    const skip = defLines.get(doc.rel)
    for (let i = 0; i < info.lines.length && !refsTruncated; i++) {
      const lineNo = i + 1
      if (skip?.has(lineNo) || info.lines[i].length > MAX_LINE) continue
      const text = plain(info.lines[i])
      const sec = `${doc.rel}#${info.section[i]}`
      const seen = new Set<string>()
      const add = (kind: SpecRefKind, name: string, table: string, term: string, at: number): void => {
        const k = `${kind}|${up(table)}|${up(name)}`
        if (seen.has(k)) return
        if (kind === 'table' && tableSec.get(up(name)) === sec) return
        if (kind === 'screen' && (screenSec.get(up(name)) === sec || screenLines.has(`${doc.rel}:${lineNo}`))) return
        if (refs.length >= SPEC_MAX_REFS) {
          refsTruncated = true
          return
        }
        seen.add(k)
        refs.push({ kind, name, table, term, rel: doc.rel, line: lineNo, heading: info.heading[i], snippet: snippetOf(text, at) })
      }
      for (const m of text.matchAll(TOKEN_RE)) {
        const tok = m[0].replace(/[-.]+$/, '')
        const at = m.index ?? 0
        const parts = tok.split('.')
        const whole = tableByName.get(up(tok))
        if (whole) {
          if (tok.length >= MIN_NAME) add('table', whole.tableName, '', tok, at)
          continue
        }
        if (parts.length >= 2) {
          const col = parts[parts.length - 1]
          const tbl = tableByName.get(up(parts.slice(0, -1).join('.')))
          if (tbl && tbl.tableName.length >= MIN_NAME && !FILE_EXT.test(col)) {
            add('table', tbl.tableName, '', tok, at)
            const known = tbl.columns.find((c) => up(c.name) === up(col))
            if (known) add('column', known.name, tbl.tableName, tok, at)
            else if (!unknownSeen.has(`${doc.rel}|${lineNo}|${up(tok)}`)) {
              unknownSeen.add(`${doc.rel}|${lineNo}|${up(tok)}`)
              issues.push({ rel: doc.rel, line: lineNo, heading: info.heading[i], severity: 'error', code: 'unknown-column', subject: `${tbl.tableName}.${col}` })
            }
            continue
          }
        }
        for (const p of parts) {
          if (p.length < MIN_NAME) continue
          const t = tableByName.get(up(p))
          if (t) add('table', t.tableName, '', p, at)
          const c = columnName.get(up(p))
          if (c) add('column', c, '', p, at)
          const s = screenById.get(up(p))
          if (s) add('screen', s.id, '', p, at)
        }
      }
      for (const name of cjkTables) {
        const at = text.indexOf(name)
        if (at >= 0) add('table', name, '', name, at)
      }
      // Tên logic: chỉ khi đứng nguyên một ô bảng (vd 項目名 của 画面項目定義 trùng 論理名 của cột)
      if (text.trimStart().startsWith('|')) {
        for (const cell of splitTableRow(info.lines[i])) {
          const v = plain(cell).trim()
          const at = Math.max(0, text.indexOf(v))
          const tl = tableLogical.get(v)
          if (tl) add('table', tl, '', v, at)
          const cols = logical.get(v)
          if (!cols) continue
          for (const name of new Set(cols.map((c) => c.name))) {
            const owners = cols.filter((c) => c.name === name)
            add('column', name, owners.length === 1 ? owners[0].table : '', v, at)
          }
        }
      }
    }
  }

  /* Cách viết mơ hồ (など / 適宜 / TBD / 未定...) trong tài liệu 画面 / テーブル: một cảnh báo mỗi dòng */
  const specRels = new Set([...screens.map((s) => s.rel), ...tables.map((t) => t.source)])
  let ambiguous = 0
  for (const doc of docs) {
    const info = infos.get(doc.rel)
    if (!info || !specRels.has(doc.rel)) continue
    for (let i = 0; i < info.lines.length && ambiguous < MAX_AMBIGUOUS; i++) {
      if (info.lines[i].length > MAX_LINE) continue
      const m = AMBIGUOUS_RE.exec(plain(info.lines[i]))
      if (!m) continue
      ambiguous++
      issues.push({ rel: doc.rel, line: i + 1, heading: info.heading[i], severity: 'warning', code: 'ambiguous-term', subject: m[0] })
    }
  }

  const gRel = findGlossaryRel(docs.map((d) => d.rel))
  const gDoc = gRel === undefined ? undefined : docs.find((d) => d.rel === gRel)

  return {
    docCount: docs.length,
    screens,
    nodes: [...nodes.values()],
    transitions,
    tables,
    refs,
    issues,
    glossary: gDoc ? { rel: gDoc.rel, entries: parseGlossary(gDoc.text) } : null,
    truncated: { docs: input.length > docs.length, refs: refsTruncated },
  }
}

/** Chữ ký kiểu để so: `VARCHAR(10)`; kiểu trống -> '' (không so được). */
function typeSig(c: TableColumn): string {
  const t = up(c.type).replace(/\s+/g, '')
  if (!t) return ''
  return t.includes('(') || !c.length ? t : `${t}(${up(c.length)}${c.scale ? ',' + c.scale : ''})`
}

/* -------------------------------- 影響調査 -------------------------------- */

export type ImpactReason = 'definition' | 'reference' | 'transition' | 'related'

export interface ImpactHit extends SpecLoc {
  reason: ImpactReason
  /** Chữ cần tô sáng khi mở tài liệu */
  term: string
  snippet: string
}

export interface ImpactResult {
  kind: 'table' | 'column' | 'screen' | 'none'
  /** Tên đã giải: bảng, `TBL.COL` / `COL`, 画面ID */
  targets: string[]
  /** Màn hình bị ảnh hưởng trực tiếp (chứa tham chiếu) và liên quan (遷移 tới/từ màn hình bị ảnh hưởng) */
  screens: { id: string; name: string; relation: 'direct' | 'related' }[]
  groups: { rel: string; hits: ImpactHit[] }[]
}

/** Gợi ý cho ô 影響調査: bảng, `TBL.COL`, 画面ID (kèm tên logic / tên màn hình để hiện). */
export function impactSuggestions(index: SpecIndex, max = 2000): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  for (const t of index.tables) {
    out.push({ value: t.tableName, label: t.logicalName })
    for (const c of t.columns) out.push({ value: `${t.tableName}.${c.name}`, label: c.logical })
  }
  for (const s of index.screens) out.push({ value: s.id, label: s.name })
  const seen = new Set<string>()
  return out.filter((x) => !seen.has(x.value) && seen.add(x.value)).slice(0, max)
}

/** Ảnh hưởng của việc sửa một bảng / cột (`TBL.COL` hoặc tên cột) / màn hình (ID hoặc tên). */
export function impactOf(index: SpecIndex, query: string): ImpactResult {
  const q = query.normalize('NFKC').trim()
  const none: ImpactResult = { kind: 'none', targets: [], screens: [], groups: [] }
  if (!q) return none
  const hits: ImpactHit[] = []
  const screenById = new Map<string, SpecScreen>()
  for (const s of index.screens) if (!screenById.has(up(s.id))) screenById.set(up(s.id), s)
  const tables = new Map<string, TableDef>()
  for (const t of index.tables) if (!tables.has(up(t.tableName))) tables.set(up(t.tableName), t)
  const defHit = (rel: string, line: number, term: string, snippet: string): ImpactHit => ({ rel, line, heading: '', reason: 'definition', term, snippet })
  const refHit = (r: SpecRef): ImpactHit => ({ rel: r.rel, line: r.line, heading: r.heading, reason: 'reference', term: r.term, snippet: r.snippet })

  let kind: ImpactResult['kind'] = 'none'
  let targets: string[] = []
  const affected = new Set<string>()

  const dot = q.lastIndexOf('.')
  const qTable = dot > 0 ? tables.get(up(q.slice(0, dot))) : undefined
  const qCol = qTable?.columns.find((c) => up(c.name) === up(q.slice(dot + 1)))
  const table = tables.get(up(q)) ?? index.tables.find((t) => t.logicalName.trim() === q)
  const screen = screenById.get(up(q)) ?? index.screens.find((s) => s.name && normName(s.name) === normName(q))
  const cols = qTable && qCol ? [{ t: qTable, c: qCol }] : index.tables.flatMap((t) => t.columns.filter((c) => up(c.name) === up(q) || c.logical.trim() === q).map((c) => ({ t, c })))

  if (table && !(qTable && qCol)) {
    kind = 'table'
    targets = [table.tableName]
    hits.push(defHit(table.source, table.line, table.tableName, table.logicalName ? `${table.tableName} (${table.logicalName})` : table.tableName))
    for (const r of index.refs) {
      if ((r.kind === 'table' && up(r.name) === up(table.tableName)) || (r.kind === 'column' && up(r.table) === up(table.tableName))) hits.push(refHit(r))
    }
  } else if (screen) {
    kind = 'screen'
    targets = [screen.id]
    affected.add(screen.id)
    hits.push({ ...defHit(screen.rel, screen.line, screen.id, `${screen.id} ${screen.name}`.trim()), heading: screen.heading })
    for (const r of index.refs) if (r.kind === 'screen' && up(r.name) === up(screen.id)) hits.push(refHit(r))
  } else if (cols.length > 0) {
    kind = 'column'
    targets = [...new Set(cols.map(({ t, c }) => `${t.tableName}.${c.name}`))]
    const names = new Set(cols.map(({ c }) => up(c.name)))
    const owners = new Set(cols.map(({ t }) => up(t.tableName)))
    for (const { t, c } of cols) hits.push(defHit(t.source, c.line, c.name, `${t.tableName}.${c.name}${c.logical ? ` (${c.logical})` : ''}`))
    for (const r of index.refs) {
      if (r.kind === 'column' && names.has(up(r.name)) && (!r.table || owners.has(up(r.table)))) hits.push(refHit(r))
    }
  } else return none

  // Màn hình chứa tham chiếu: screen định nghĩa trong cùng phần (cùng file, cùng heading `##`) và đứng trước dòng
  if (kind !== 'screen') {
    const byRel = new Map<string, SpecScreen[]>()
    for (const s of index.screens) byRel.set(s.rel, [...(byRel.get(s.rel) ?? []), s])
    for (const h of hits) {
      const owner = ownerScreen(byRel.get(h.rel) ?? [], h.line)
      if (owner) affected.add(owner.id)
    }
  }
  const related = new Set<string>()
  for (const tr of index.transitions) {
    const touches = affected.has(tr.from) || affected.has(tr.to)
    if (!touches) continue
    if (kind === 'screen') {
      const s = screenById.get(up(targets[0]))
      hits.push({ rel: tr.rel, line: tr.line, heading: tr.heading, reason: 'transition', term: s?.name || s?.id || '', snippet: `${labelOf(index, tr.from)} ${tr.bidi ? '↔' : '→'} ${labelOf(index, tr.to)}${tr.label ? `（${tr.label}）` : ''}` })
    }
    for (const k of [tr.from, tr.to]) if (!affected.has(k) && screenById.has(up(k))) related.add(k)
  }
  for (const id of related) {
    const s = screenById.get(up(id)) as SpecScreen
    hits.push({ rel: s.rel, line: s.line, heading: s.heading, reason: 'related', term: s.id, snippet: `${s.id} ${s.name}`.trim() })
  }

  // Gom theo tài liệu, bỏ trùng (cùng dòng giữ lý do mạnh hơn: definition > reference > transition > related)
  const order: ImpactReason[] = ['definition', 'reference', 'transition', 'related']
  const byRel = new Map<string, Map<number, ImpactHit>>()
  for (const h of hits) {
    const m = byRel.get(h.rel) ?? new Map<number, ImpactHit>()
    const old = m.get(h.line)
    if (!old || order.indexOf(h.reason) < order.indexOf(old.reason)) m.set(h.line, h)
    byRel.set(h.rel, m)
  }
  const groups = [...byRel.entries()]
    .map(([rel, m]) => ({ rel, hits: [...m.values()].sort((a, b) => a.line - b.line) }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  const screens = [
    ...[...affected].sort().map((id) => ({ id, relation: 'direct' as const })),
    ...[...related].sort().map((id) => ({ id, relation: 'related' as const })),
  ]
    .filter((x) => screenById.has(up(x.id)))
    .map((x) => ({ ...x, name: screenById.get(up(x.id))?.name ?? '' }))
  return { kind, targets, screens, groups }
}

/** Screen (cùng file) sở hữu dòng `line`: 画面ID gần nhất phía trên, trong cùng phần `#`/`##`. */
function ownerScreen(screens: SpecScreen[], line: number): SpecScreen | undefined {
  let best: SpecScreen | undefined
  for (const s of screens) if (s.line <= line && line <= s.end && (!best || s.line > best.line)) best = s
  return best
}

const labelOf = (index: SpecIndex, key: string): string => index.nodes.find((n) => n.key === key)?.label ?? key.replace(/^\?/, '')

/* --------------------------------- CRUD図 --------------------------------- */

export type CrudOp = 'C' | 'R' | 'U' | 'D'
const CRUD_ORDER: CrudOp[] = ['C', 'R', 'U', 'D']
/** Động từ -> thao tác (Nhật / Việt / Anh). Từ tiếng Anh phải đứng nguyên từ (`add` không khớp `address`). */
const CRUD_VERBS: Record<CrudOp, RegExp> = {
  C: /登録|追加|作成|新規|挿入|thêm|tạo|đăng ký|(?<![a-z])(?:insert(?:s|ed|ing)?|creat(?:e|es|ed|ing)|add(?:s|ed|ing)?|register(?:s|ed|ing)?)(?![a-z])/i,
  R: /表示|検索|参照|取得|照会|一覧|抽出|閲覧|hiển thị|tìm kiếm|tra cứu|lấy|(?<![a-z])(?:select|search|display|view|read|fetch|list)(?:s|es|ed|ing)?(?![a-z])/i,
  U: /更新|変更|修正|編集|cập nhật|chỉnh sửa|sửa|thay đổi|(?<![a-z])(?:updat(?:e|es|ed|ing)|edit(?:s|ed|ing)?|modif(?:y|ies|ied|ying))(?![a-z])/i,
  D: /削除|取消|取り消し|xóa|xoá|(?<![a-z])(?:delet(?:e|es|ed|ing)|remov(?:e|es|ed|ing))(?![a-z])/i,
}
/** Tối đa bằng chứng giữ cho một ô */
const CRUD_MAX_EVIDENCE = 50

/** Thao tác CRUD mà `text` nói tới (thứ tự C R U D), [] nếu không có động từ nào. */
export function crudOpsOf(text: string): CrudOp[] {
  const t = text.normalize('NFC')
  return CRUD_ORDER.filter((op) => CRUD_VERBS[op].test(t))
}

export interface CrudEvidence extends SpecLoc {
  /** Thao tác đọc được ở dòng (hoặc heading), '?' nếu không có động từ */
  ops: string
  term: string
  snippet: string
}

export interface CrudCell {
  /** `CR`, `U`...; '?' khi có tham chiếu nhưng không xác định được thao tác (không đoán) */
  ops: string
  evidence: CrudEvidence[]
}

export interface CrudMatrix {
  screens: { id: string; name: string }[]
  /** Mọi bảng (không trùng tên) */
  tables: string[]
  /** cells[画面ID][tên bảng] */
  cells: Record<string, Record<string, CrudCell>>
}

/** CRUD図 画面 × テーブル: tham chiếu bảng / cột (`TBL.COL` hoặc tên logic chỉ thuộc một bảng) nằm trong phần của
 * một 画面ID được gán cho màn hình đó; thao tác lấy từ động từ trong dòng, không có thì từ heading, không có nữa thì '?'.
 * Tên của chính tham chiếu (vd 論理名 `登録日`) không tính là động từ. */
export function crudMatrix(index: SpecIndex): CrudMatrix {
  const byRel = new Map<string, SpecScreen[]>()
  for (const s of index.screens) byRel.set(s.rel, [...(byRel.get(s.rel) ?? []), s])
  const screens = new Map<string, { id: string; name: string }>()
  for (const s of index.screens) if (!screens.has(up(s.id))) screens.set(up(s.id), { id: s.id, name: s.name })
  const tables = new Map<string, string>()
  for (const t of index.tables) if (!tables.has(up(t.tableName))) tables.set(up(t.tableName), t.tableName)
  const cells: Record<string, Record<string, CrudCell>> = {}
  const seen = new Set<string>()
  for (const r of index.refs) {
    const table = tables.get(up(r.kind === 'table' ? r.name : r.kind === 'column' ? r.table : ''))
    const owner = table && ownerScreen(byRel.get(r.rel) ?? [], r.line)
    if (!table || !owner) continue
    const id = (screens.get(up(owner.id)) as { id: string }).id
    const k = `${id}|${table}|${r.rel}|${r.line}`
    if (seen.has(k)) continue // bảng + cột của bảng trên cùng dòng: một bằng chứng
    seen.add(k)
    const own = r.snippet.split(r.term).join(' ')
    const found = crudOpsOf(own)
    const ops = found.length > 0 ? found : crudOpsOf(r.heading)
    const row = (cells[id] ??= {})
    const cell = (row[table] ??= { ops: '', evidence: [] })
    if (cell.evidence.length < CRUD_MAX_EVIDENCE) cell.evidence.push({ rel: r.rel, line: r.line, heading: r.heading, ops: ops.join('') || '?', term: r.term, snippet: r.snippet })
    cell.ops = CRUD_ORDER.filter((op) => cell.ops.includes(op) || ops.includes(op)).join('')
  }
  for (const row of Object.values(cells)) for (const cell of Object.values(row)) if (!cell.ops) cell.ops = '?'
  return { screens: [...screens.values()], tables: [...tables.values()], cells }
}

/** CRUD図 dạng TSV (dán vào Excel) hoặc bảng Markdown. Hàng = màn hình, cột = bảng. */
export function crudText(m: CrudMatrix, format: 'md' | 'tsv'): string {
  const head = ['画面', ...m.tables]
  const rows = m.screens.map((s) => [s.name ? `${s.id} ${s.name}` : s.id, ...m.tables.map((t) => m.cells[s.id]?.[t]?.ops ?? '')])
  if (format === 'tsv') return [head, ...rows].map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n') + '\n'
  const md = (r: string[]): string => `| ${r.map((c) => c.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ')).join(' | ')} |`
  return [md(head), `|${head.map(() => '---').join('|')}|`, ...rows.map(md)].join('\n') + '\n'
}

/* --------------------------------- Mermaid -------------------------------- */

/** Chữ trong "...": Mermaid không cho `"`, xuống dòng; `<>` / backtick là HTML / markdown string, `|` đóng nhãn cạnh, `#…;` là entity. */
const mmd = (s: string, max = 40): string => {
  const t = s.replace(/["`\\<>|#]/g, "'").replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

export interface FlowDiagram {
  source: string
  /** id nút trong Mermaid (`n0`...) -> khóa nút (画面ID hoặc `?…`) */
  ids: Record<string, string>
  truncated: boolean
}

/** Nút điều kiện / rẽ nhánh trong sơ đồ 画面遷移 (kết thúc bằng ？ / ?), vd 権限あり？, 入力OK? */
export const isDecision = (label: string): boolean => /[?？]\s*$/.test(label)

/** Mermaid `flowchart LR` của 画面遷移: id nút an toàn (`n0`...), nút treo có class `dangling` (viền đứt). */
export function transitionMermaid(index: SpecIndex): FlowDiagram {
  // Nút có cạnh trước (sơ đồ hữu ích hơn), rồi tới screen đứng một mình
  const used = new Set(index.transitions.flatMap((t) => [t.from, t.to]))
  const ordered = [...index.nodes.filter((n) => used.has(n.key)), ...index.nodes.filter((n) => !used.has(n.key))]
  const kept = ordered.slice(0, SPEC_MAX_NODES)
  const idOf = new Map(kept.map((n, i) => [n.key, `n${i}`]))
  const lines = ['flowchart LR']
  // Nút điều kiện vẽ hình thoi, màn hình hình chữ nhật
  for (const n of kept) {
    const label = mmd(n.label) || '?'
    lines.push(!n.screen && isDecision(n.label) ? `  ${idOf.get(n.key)}{"${label}"}` : `  ${idOf.get(n.key)}["${label}"]`)
  }
  let textLen = lines.reduce((sum, l) => sum + l.length + 1, 0)
  let truncated = kept.length < ordered.length
  const seen = new Set<string>()
  for (const tr of index.transitions) {
    const a = idOf.get(tr.from)
    const b = idOf.get(tr.to)
    if (!a || !b) continue
    const k = `${a}|${b}|${tr.label}|${tr.bidi}`
    if (seen.has(k)) continue
    seen.add(k)
    const label = mmd(tr.label, 30)
    const edge = `  ${a} ${tr.bidi ? '<-->' : '-->'}${label ? `|"${label}"|` : ''} ${b}`
    if (textLen + edge.length > MERMAID_MAX_TEXT) {
      truncated = true
      break
    }
    lines.push(edge)
    textLen += edge.length + 1
  }
  const dangling = kept.filter((n) => !n.screen && !isDecision(n.label)).map((n) => idOf.get(n.key))
  if (dangling.length > 0) {
    lines.push('  classDef dangling stroke-dasharray:5 4')
    lines.push(`  class ${dangling.join(',')} dangling`)
  }
  return { source: lines.join('\n') + '\n', ids: Object.fromEntries([...idOf].map(([k, v]) => [v, k])), truncated }
}

/** Mermaid `erDiagram` của mọi bảng (không trùng tên), cắt bớt bảng để vừa giới hạn của Mermaid. */
export function erMermaid(index: SpecIndex): { source: string; truncated: boolean } {
  const seen = new Set<string>()
  const defs = index.tables.filter((t) => !seen.has(up(t.tableName)) && seen.add(up(t.tableName)))
  const kept: TableDef[] = []
  let size = 0
  for (const d of defs.slice(0, SPEC_MAX_NODES)) {
    size += toErMermaid([d]).length
    if (size > MERMAID_MAX_TEXT) break
    kept.push(d)
  }
  return { source: kept.length > 0 ? toErMermaid(kept) : '', truncated: kept.length < defs.length }
}
