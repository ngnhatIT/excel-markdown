/* Bản đồ thiết kế + 影響調査: chỉ mục thuần (không AI, không mạng) của cả thư mục tài liệu Markdown đã convert.
 * Rút ra 画面 (meta 画面ID / 画面名), 画面遷移 (meta chuỗi `A → B` và dòng `〔矢印〕A → B（nhãn）` từ shape),
 * テーブル定義 (parseTableDefs), chỗ nhắc tới bảng / cột / 画面ID ở nơi khác, và lỗi nhất quán.
 * Dùng chung main (IPC, CLI, MCP) + renderer. Dữ liệu không tin cậy: mọi thứ đều có giới hạn. */
import { findGlossaryRel, parseGlossary, type GlossaryEntry } from './glossary'
import { atxHeading, fenceAfter, isDelimRow, normLabel as normHeader, tsvCell } from './mdLines'
import { normRule, type ProjectRules } from './projectConfig'
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

export type SpecIssueCode =
  | 'dangling-transition'
  | 'duplicate-screen'
  | 'duplicate-table'
  | 'unknown-column'
  | 'ambiguous-term'
  | 'column-mismatch'
  | 'item-length'

export interface SpecIssue extends SpecLoc {
  severity: 'error' | 'warning'
  code: SpecIssueCode
  /** Đối tượng: chữ của nút treo / 画面ID / tên bảng / `TBL.COL` */
  subject: string
  /** Trùng / lệch kiểu: nơi định nghĩa đầu tiên */
  other?: { rel: string; line: number }
  /** column-mismatch: kiểu(桁数) ở đây và ở `other`, vd `VARCHAR(10)` / `CHAR(8)`; item-length: `50 > TBL.COL VARCHAR(40)` */
  detail?: string
}

export interface SpecIndex {
  docCount: number
  /** Đường dẫn các tài liệu đã đọc (theo thứ tự), để báo file nào không nhận ra được gì */
  rels: string[]
  /** 画面ID có bảng 項目定義 trong phần của nó */
  itemScreens: string[]
  screens: SpecScreen[]
  nodes: SpecNode[]
  transitions: SpecTransition[]
  tables: TableDef[]
  refs: SpecRef[]
  issues: SpecIssue[]
  /** 用語集 của dự án (`用語集.md` / `glossary.md` ở gốc hoặc sâu tối đa 2 cấp), null nếu không có */
  glossary: { rel: string; entries: GlossaryEntry[] } | null
  truncated: { docs: boolean; refs: boolean }
  /** Khối テーブル編集仕様 (テーブルID + 更新種別 + bảng cột): nguồn CRUD / ER khi không có テーブル定義書 */
  usages: TableUsage[]
  /** Cấu hình dự án x2m.json đã áp dụng (không có file thì không có khóa này) */
  project?: SpecProject
}

/** x2m.json đã tìm thấy: đường dẫn, cảnh báo khi đọc, luật cộng thêm. */
export interface SpecProject {
  path: string
  warnings: string[]
  rules: ProjectRules
}

/** Cột của bảng 項目定義 (画面設計書): header so theo alias sau normLabel. Dùng chung với テスト観点表. */
export type ItemField = 'item' | 'required' | 'length' | 'type' | 'kind' | 'default' | 'note' | 'check'
const ITEM_ALIASES: Record<ItemField, string[]> = {
  item: ['画面ラベル', '項目名', '項目', '項目名称', 'item', 'itemname', 'tênhạngmục', 'hạngmục'],
  required: ['必須', '必須区分', 'required', 'bắtbuộc'],
  length: ['桁数', '桁', '長さ', '最大桁数', 'length', 'maxlength', 'độdài'],
  type: ['型', 'データ型', '属性', 'type', 'datatype', 'kiểu'],
  kind: ['区分', '入出力', '項目区分', 'i/o', 'io', 'loại'],
  default: ['初期値', '初期表示', 'default', 'defaultvalue', 'giátrịmặcđịnh', 'giátrịbanđầu'],
  note: ['備考', 'note', 'notes', 'remarks', 'ghichú'],
  check: ['入力チェック', 'チェック', 'チェック内容', 'validation', 'kiểmtra'],
}
export const ITEM_FIELD_OF = new Map<string, ItemField>(Object.entries(ITEM_ALIASES).flatMap(([f, list]) => list.map((a) => [a, f as ItemField])))

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

// Ô Excel tham chiếu ô khác: converter để lại `giá trị =Sheet!AH3` -> bỏ phần công thức
const stripFormula = (s: string): string => s.replace(/\s*=(?:'[^']+'|[^=\s']*)![$A-Z]+[$\d]+$/, '').trim()
const META_RE = /^\s*[-*+]\s+(?:\*\*)?([^*:：|]{1,40}?)(?:\*\*)?\s*[:：]\s*(.*?)\s*$/
// Nhãn tiếng Việt cho tài liệu viết bằng tiếng Việt (vd `- **Mã màn hình**: CHECKOUT`)
const SCREEN_ID_LABELS = new Set(['画面id', '画面番号', 'screenid', 'mã màn hình', 'id màn hình'].map(normLabel))
const SCREEN_NAME_LABELS = new Set(['画面名', '画面名称', 'screenname', 'tên màn hình'].map(normLabel))
const TRANSITION_LABELS = new Set(['画面遷移', 'screentransition', 'chuyển màn hình', 'luồng màn hình'].map(normLabel))
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
    const nf = fenceAfter(fence, line)
    if (nf !== undefined) fence = nf
    else if (!fence) {
      const m = atxHeading(line)
      if (m) {
        h = plain(m.text).trim()
        if (m.level <= 2) sec++
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

/* ---------------------------- テーブル編集仕様 ---------------------------- */

export interface TableUsage extends SpecLoc {
  table: string
  logical: string
  /** Thao tác theo 更新種別 (`R`, `C`, `CU`...), '' nếu không đọc được */
  ops: string
  /** 更新種別 nguyên văn */
  kind: string
  /** 画面ID của phần, không có thì 機能ID; '' nếu phần không có cả hai */
  owner: string
  ownerName: string
  columns: { name: string; logical: string; line: number }[]
  /** 入力元情報 của từng cột (tên bảng vật lý / logic chưa giải; ô không phải bảng bị bỏ khi giải) */
  sources: { column: string; from: string }[]
}

const FUNC_ID_LABELS = new Set(['機能id', 'functionid', 'mã chức năng'].map(normLabel))
const FUNC_NAME_LABELS = new Set(['機能名', 'functionname', 'tên chức năng'].map(normLabel))
const USAGE_ID_LABELS = new Set(['テーブルid', 'tableid', 'mã bảng'].map(normLabel))
const USAGE_NAME_LABELS = new Set(['テーブル名', 'tablename', 'tên bảng'].map(normLabel))
const USAGE_KIND_LABELS = new Set(['更新種別', '処理種別', 'アクセス種別', 'crud', 'loại cập nhật'].map(normLabel))
const USAGE_PHYS = new Set(['項目名', '物理名', 'カラム名', '項目物理名', 'カラム物理名', 'column', 'columnname'].map(normLabel))
const USAGE_LOGI = new Set(['項目名(日本語)', '論理名', '項目論理名', 'カラム論理名'].map(normLabel))
const USAGE_SRC = new Set(['入力元情報', '入力元テーブル', 'source', 'nguồn'].map(normLabel))
const SQL_OPS: Record<CrudOp, RegExp> = { C: /\b(?:INSERT|MERGE|UPSERT)\b/i, R: /\bSELECT\b/i, U: /\b(?:UPDATE|MERGE|UPSERT)\b/i, D: /\b(?:DELETE|TRUNCATE)\b/i }
const PHYS_RE = /^[A-Za-z_][A-Za-z0-9_$#]*$/

/** Khối テーブル編集仕様 của một tài liệu. Phần ghi 全文削除 (đã xóa khỏi thiết kế) bị bỏ qua. */
function parseUsages(rel: string, lines: string[], heading: string[], section: number[], extra?: ProjectRules['crudVerbs']): { usages: TableUsage[]; blockLines: Set<number> } {
  const usages: TableUsage[] = []
  const blockLines = new Set<number>()
  // Dấu 全文削除: dòng trích dẫn (`> ...全文削除`) hoặc dòng ngắn chỉ ghi dấu, ngoài code fence, trong phần có テーブルID
  const deleted = new Set<number>()
  const usageSec = new Set<number>()
  let pf = ''
  lines.forEach((l, i) => {
    const nf = fenceAfter(pf, l)
    if (nf !== undefined) pf = nf
    if (pf || nf !== undefined) return
    if (/^\s*>.*全文削除/.test(l) || /^\s*[^|\-*+\s>][^|]{0,30}全文削除\s*$/.test(l)) deleted.add(section[i])
    const m = META_RE.exec(plain(l))
    if (m && USAGE_ID_LABELS.has(normLabel(m[1]))) usageSec.add(section[i])
  })
  for (const s of deleted) if (!usageSec.has(s)) deleted.delete(s)
  // Phần đã xóa khỏi thiết kế: không tham chiếu, không CRUD
  section.forEach((s, i) => deleted.has(s) && blockLines.add(i + 1))
  let screen = { id: '', name: '' }
  let func = { id: '', name: '' }
  /** Phần không có 画面ID / 機能ID (vd 【CSV取込項目定義】): thuộc màn hình đầu tiên của tài liệu */
  let first: { id: string; name: string } | undefined
  const docOwner = (): { id: string; name: string } => {
    if (first) return first
    const meta = lines.map((l) => META_RE.exec(plain(l))).map((m) => (m ? { label: normLabel(m[1]), value: stripFormula(m[2]) } : null))
    for (const ids of [SCREEN_ID_LABELS, FUNC_ID_LABELS]) {
      const k = meta.findIndex((m) => m && m.value && ids.has(m.label))
      if (k < 0) continue
      const names = ids === SCREEN_ID_LABELS ? SCREEN_NAME_LABELS : FUNC_NAME_LABELS
      const name = meta.slice(k + 1, k + 6).find((m) => m && m.value && names.has(m.label))?.value ?? ''
      return (first = { id: (meta[k] as { value: string }).value.normalize('NFKC'), name })
    }
    return (first = { id: '', name: '' })
  }
  let cur: TableUsage | null = null
  let fence = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const nf = fenceAfter(fence, line)
    if (nf !== undefined) fence = nf
    if (fence || nf !== undefined || line.length > MAX_LINE) continue
    if (i > 0 && section[i] !== section[i - 1]) {
      screen = { id: '', name: '' }
      func = { id: '', name: '' }
      cur = null
    }
    if (cur && line.trimStart().startsWith('|') && isDelimRow(lines[i + 1] ?? '')) {
      const head = splitTableRow(line).map((c) => normLabel(plain(c)))
      const phys = head.findIndex((h) => USAGE_PHYS.has(h))
      const logi = head.findIndex((h) => USAGE_LOGI.has(h))
      const src = head.findIndex((h) => USAGE_SRC.has(h))
      const u: TableUsage = cur
      cur = null
      if (phys < 0) continue
      for (let n = i; n <= i + 1; n++) blockLines.add(n + 1)
      for (i += 2; i < lines.length && lines[i].trimStart().startsWith('|'); i++) {
        blockLines.add(i + 1)
        const cells = splitTableRow(lines[i]).map((c) => plain(c).trim())
        const name = (cells[phys] ?? '').normalize('NFKC')
        if (!PHYS_RE.test(name)) continue
        u.columns.push({ name, logical: logi >= 0 ? (cells[logi] ?? '') : '', line: i + 1 })
        if (src >= 0 && cells[src]) u.sources.push({ column: name, from: cells[src] })
      }
      i--
      continue
    }
    const m = META_RE.exec(plain(line))
    if (!m) continue
    const label = normLabel(m[1])
    const value = stripFormula(m[2])
    if (SCREEN_ID_LABELS.has(label)) screen = { id: value.normalize('NFKC'), name: '' }
    else if (SCREEN_NAME_LABELS.has(label)) screen.name ||= value
    else if (FUNC_ID_LABELS.has(label)) func = { id: value.normalize('NFKC'), name: '' }
    else if (FUNC_NAME_LABELS.has(label)) func.name ||= value
    else if (USAGE_ID_LABELS.has(label)) {
      const table = /^[A-Za-z_][A-Za-z0-9_$#.]*/.exec(value.normalize('NFKC'))?.[0] ?? ''
      cur = null
      if (!table || deleted.has(section[i])) continue
      const owner = screen.id ? screen : func.id ? func : docOwner()
      cur = { rel, line: i + 1, heading: heading[i], table, logical: '', ops: '', kind: '', owner: owner.id, ownerName: owner.name, columns: [], sources: [] }
      usages.push(cur)
      blockLines.add(i + 1)
    } else if (cur && USAGE_NAME_LABELS.has(label)) {
      cur.logical = value
      blockLines.add(i + 1)
    } else if (cur && USAGE_KIND_LABELS.has(label)) {
      cur.kind = value
      const sql = CRUD_ORDER.filter((op) => SQL_OPS[op].test(value))
      cur.ops = (sql.length > 0 ? sql : crudOpsOf(value, extra)).join('')
      blockLines.add(i + 1)
    }
  }
  return { usages, blockLines }
}

/* --------------------------------- Chỉ mục -------------------------------- */

interface RawEdge extends SpecLoc {
  from: string
  to: string
  label: string
  bidi: boolean
}

/** Chỉ mục của cả thư mục. Không ném với Markdown bất kỳ. */
export function buildSpecIndex(input: SpecDoc[], project?: SpecProject): SpecIndex {
  const docs = input.slice(0, SPEC_MAX_DOCS)
  const rules = project?.rules
  const screenIdLabels = new Set([...SCREEN_ID_LABELS, ...(rules?.screenIdLabels ?? []).map(normLabel)])
  const transitionLabels = new Set([...TRANSITION_LABELS, ...(rules?.transitionLabels ?? []).map(normLabel)])
  const extraAmbiguous = rules?.ambiguousWords ?? []
  const screens: SpecScreen[] = []
  const tables: TableDef[] = []
  const usages: TableUsage[] = []
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
    /** 画面遷移 dạng đường dẫn menu `1. メニュー/画面A【アンカー】/画面này`: đoạn cuối là màn hình hiện tại, `【…】` là nhãn cạnh đi ra */
    const pushBreadcrumb = (value: string, i: number, current: string): void => {
      const segs = value
        .replace(/^\d+\s*[.．、)）]\s*/, '')
        .replace(/(?:\.{2,}|…)\s*$/, '')
        .split(/\s*[/／]\s*/)
        .map((s) => /^(.*?)\s*(?:【([^【】]*)】)?\s*$/.exec(s) as RegExpExecArray)
        .map((m) => ({ text: m[1].trim(), label: (m[2] ?? '').trim() }))
        .filter((s) => s.text)
      if (segs.length < 2) return
      if (current) segs[segs.length - 1].text = current
      for (let k = 1; k < segs.length; k++) raw.push({ ...loc(i), from: segs[k - 1].text, to: segs[k].text, label: segs[k - 1].label, bidi: false })
      chainEnd = segs[segs.length - 1].text
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
      const value = stripFormula(m[2])
      if (!value) return
      if (screenIdLabels.has(label)) {
        current = { ...loc(i), id: value.normalize('NFKC'), name: pendingName, end: section.lastIndexOf(section[i]) + 1 }
        screens.push(current)
        if (!screenSec.has(up(current.id))) screenSec.set(up(current.id), `${doc.rel}#${section[i]}`)
        pendingName = ''
      } else if (SCREEN_NAME_LABELS.has(label)) {
        if (current && !current.name) current.name = value
        else pendingName = value
      } else if (transitionLabels.has(label)) {
        const cur = current as SpecScreen | null
        // Chỉ đường dẫn menu thật (`1. A/B/C` hoặc có 【アンカー】, ≥ 3 đoạn); `一覧/詳細`, ngày `2026/01/27` giữ đường cũ
        const crumb = !ARROW_SPLIT.test(value) && value.split(/[/／]/).length >= 3 && /^\d+\s*[.．、)）]|【[^【】]*】/.test(value)
        if (crumb) pushBreadcrumb(value, i, cur ? cur.id : '')
        else pushChain(value, i, cur ? cur.id : '')
      }
    })
    for (const def of parseTableDefs(doc.text, doc.rel)) {
      tables.push(def)
      if (!tableSec.has(up(def.tableName))) tableSec.set(up(def.tableName), `${doc.rel}#${section[def.line - 1]}`)
      const set = defLines.get(doc.rel) ?? new Set<number>()
      const last = def.columns.reduce((m, c) => Math.max(m, c.line), def.line)
      for (let n = def.line; n <= last; n++) set.add(n)
      defLines.set(doc.rel, set)
    }
    // Khối テーブル編集仕様: không quét tham chiếu trong khối (CRUD lấy thẳng từ 更新種別, không đoán từ heading)
    const pu = parseUsages(doc.rel, lines, heading, section, rules?.crudVerbs)
    usages.push(...pu.usages)
    if (pu.blockLines.size > 0) defLines.set(doc.rel, new Set([...(defLines.get(doc.rel) ?? []), ...pu.blockLines]))
  }

  /* Bảng chỉ có trong テーブル編集仕様 (không có テーブル定義書): bảng suy luận, gộp cột mọi khối */
  const defined = new Set(tables.map((t) => up(t.tableName)))
  const inferred = new Map<string, TableDef>()
  for (const u of usages) {
    if (defined.has(up(u.table))) continue
    let t = inferred.get(up(u.table))
    if (!t) {
      t = { source: u.rel, tableName: u.table, logicalName: u.logical, columns: [], line: u.line, inferred: true }
      inferred.set(up(u.table), t)
    }
    t.logicalName ||= u.logical
    for (const c of u.columns) {
      const have = t.columns.find((x) => up(x.name) === up(c.name))
      if (have) have.logical ||= c.logical
      // Cột từ file khác: dòng không thuộc file nguồn của bảng -> trỏ về dòng khai báo bảng
      else t.columns.push({ name: c.name, logical: c.logical, type: '', length: '', scale: '', pk: false, notNull: false, default: '', comment: '', line: t.source === u.rel ? c.line : t.line })
    }
  }
  tables.push(...inferred.values())

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
      const text = plain(info.lines[i])
      const subject = AMBIGUOUS_RE.exec(text)?.[0] ?? (extraAmbiguous.length > 0 ? extraAmbiguous.find((w) => normRule(text).includes(w)) : undefined)
      if (!subject) continue
      ambiguous++
      // detail: chính dòng đó (để 質問票 trích dẫn ngữ cảnh của chữ mơ hồ)
      issues.push({ rel: doc.rel, line: i + 1, heading: info.heading[i], severity: 'warning', code: 'ambiguous-term', subject, detail: snippetOf(text, text.indexOf(subject)) })
    }
  }

  /* Hạng mục nhập của màn hình (bảng 項目定義) dài hơn cột chữ cùng 論理名 trong テーブル定義: nhập đủ 桁数 thì lỗi / bị cắt
   * khi lưu. Chỉ báo khi dài hơn MỌI cột cùng tên (tên logic thuộc nhiều bảng); màn hình ngắn hơn DB là bình thường. */
  const charCols = new Map<string, { t: TableDef; c: TableColumn; len: number }[]>()
  for (const t of tableByName.values()) {
    for (const c of t.columns) {
      const len = charLength(c)
      const lg = c.logical.trim().normalize('NFKC')
      if (len !== undefined && lg) charCols.set(lg, [...(charCols.get(lg) ?? []), { t, c, len }])
    }
  }
  /** 画面ID có bảng 項目定義 (màn hình không có thì 質問票 hỏi khách danh sách hạng mục) */
  const itemScreens = new Set<string>()
  const screensOf = new Map<string, SpecScreen[]>()
  for (const sc of screens) screensOf.set(sc.rel, [...(screensOf.get(sc.rel) ?? []), sc])
  for (const doc of docs) {
    const info = infos.get(doc.rel)
    const own = screensOf.get(doc.rel)
    if (!info || !own) continue
    const L = info.lines
    for (let i = 0; i + 1 < L.length; i++) {
      if (!L[i].trimStart().startsWith('|') || !isDelimRow(L[i + 1]) || defLines.get(doc.rel)?.has(i + 1)) continue
      const cols = new Map<ItemField, number>()
      splitTableRow(L[i]).forEach((cell, k) => {
        const f = ITEM_FIELD_OF.get(normHeader(plain(cell)))
        if (f && !cols.has(f)) cols.set(f, k)
      })
      const owner = ownerScreen(own, i + 1)
      if (owner && cols.has('item') && (cols.has('kind') || cols.has('type') || cols.has('length') || cols.has('required'))) itemScreens.add(owner.id)
      let j = i + 2
      for (; j < L.length && L[j].trimStart().startsWith('|'); j++) {
        const itemIdx = cols.get('item')
        const lenIdx = cols.get('length')
        if (!owner || itemIdx === undefined || lenIdx === undefined || L[j].length > MAX_LINE) continue
        const cells = splitTableRow(L[j])
        const cell = (k: number | undefined): string => (k === undefined ? '' : plain(cells[k] ?? '').trim())
        if (/出力|表示|ラベル|ボタン|output|display|label|button|hiển thị|nút/i.test(cell(cols.get('kind')))) continue
        const m = /^\d+/.exec(cell(lenIdx).normalize('NFKC'))
        const matches = charCols.get(cell(itemIdx).normalize('NFKC'))
        if (!m || !matches) continue
        const n = Number(m[0])
        if (matches.some((x) => x.len >= n)) continue
        const x = matches[0]
        issues.push({ rel: doc.rel, line: j + 1, heading: info.heading[j], severity: 'warning', code: 'item-length', subject: `${owner.id} ${cell(itemIdx)}`, other: { rel: x.t.source, line: x.c.line }, detail: `${n} > ${x.t.tableName}.${x.c.name} ${typeSig(x.c)}` })
      }
      i = j - 1
    }
  }

  const gRel = findGlossaryRel(docs.map((d) => d.rel))
  const gDoc = gRel === undefined ? undefined : docs.find((d) => d.rel === gRel)

  return {
    docCount: docs.length,
    rels: docs.map((d) => d.rel),
    itemScreens: [...itemScreens],
    screens,
    nodes: [...nodes.values()],
    transitions,
    tables,
    refs,
    issues,
    usages,
    glossary: gDoc ? { rel: gDoc.rel, entries: parseGlossary(gDoc.text) } : null,
    ...(project ? { project } : {}),
    truncated: { docs: input.length > docs.length, refs: refsTruncated },
  }
}

/** Số ký tự tối đa của cột kiểu chữ (CHAR / VARCHAR / NVARCHAR2 / 文字列...); kiểu khác hoặc không rõ 桁数 -> undefined. */
function charLength(c: TableColumn): number | undefined {
  const t = up(c.type).replace(/\s+/g, '')
  if (!/CHAR|文字|STRING|TEXT/.test(t)) return undefined
  const n = /^\d+/.exec(up(c.length))?.[0] ?? /\((\d+)/.exec(t)?.[1]
  return n ? Number(n) : undefined
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
export function ownerScreen(screens: SpecScreen[], line: number): SpecScreen | undefined {
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

/** Thao tác CRUD mà `text` nói tới (thứ tự C R U D), [] nếu không có động từ nào.
 * `extra`: động từ dự án khai trong x2m.json (đã chuẩn hóa bằng normRule), khớp chuỗi con. */
export function crudOpsOf(text: string, extra?: ProjectRules['crudVerbs']): CrudOp[] {
  const t = text.normalize('NFC')
  const lower = extra ? normRule(text) : ''
  return CRUD_ORDER.filter((op) => CRUD_VERBS[op].test(t) || (extra?.[op].some((w) => lower.includes(w)) ?? false))
}

export interface CrudEvidence extends SpecLoc {
  /** Thao tác đọc được ở dòng (hoặc heading); chữ thường = suy từ tên màn hình (vd 顧客検索画面 -> `r`); '?' nếu không có */
  ops: string
  term: string
  snippet: string
}

export interface CrudCell {
  /** `CR`, `U`...; chữ thường = chỉ suy từ tên màn hình (`cR`: R có bằng chứng, C suy luận);
   * '?' khi có tham chiếu nhưng không xác định được thao tác */
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

/** Gộp thao tác hai chuỗi (thứ tự C R U D): chữ hoa (có bằng chứng) thắng chữ thường (suy luận); bỏ '?'. */
const mergeOps = (a: string, b: string): string =>
  CRUD_ORDER.map((op) => (a.includes(op) || b.includes(op) ? op : a.includes(op.toLowerCase()) || b.includes(op.toLowerCase()) ? op.toLowerCase() : '')).join('')

/** CRUD図 画面 × テーブル: tham chiếu bảng / cột (`TBL.COL` hoặc tên logic chỉ thuộc một bảng) nằm trong phần của
 * một 画面ID được gán cho màn hình đó; thao tác lấy từ động từ trong dòng, không có thì từ heading, không có nữa thì
 * suy từ tên màn hình (検索画面 -> r, 登録画面 -> c; ghi chữ thường), không có nữa thì '?'.
 * Tên của chính tham chiếu (vd 論理名 `登録日`) không tính là động từ. */
export function crudMatrix(index: SpecIndex): CrudMatrix {
  const extra = index.project?.rules.crudVerbs
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
    const found = crudOpsOf(own, extra)
    const direct = found.length > 0 ? found : crudOpsOf(r.heading, extra)
    // Dòng / heading không nói thao tác (ô 項目定義 `入力`...): màn hình 顧客検索画面 dùng bảng để đọc -> r
    const ops = direct.length > 0 ? direct.join('') : crudOpsOf(owner.name, extra).join('').toLowerCase()
    const row = (cells[id] ??= {})
    const cell = (row[table] ??= { ops: '', evidence: [] })
    if (cell.evidence.length < CRUD_MAX_EVIDENCE) cell.evidence.push({ rel: r.rel, line: r.line, heading: r.heading, ops: ops || '?', term: r.term, snippet: r.snippet })
    cell.ops = mergeOps(cell.ops, ops)
  }
  // テーブル編集仕様: 更新種別 là bằng chứng trực tiếp; phần chỉ có 機能ID (バッチ...) thành một dòng riêng
  for (const u of index.usages ?? []) {
    const table = tables.get(up(u.table))
    if (!table || !u.owner) continue
    if (!screens.has(up(u.owner))) screens.set(up(u.owner), { id: u.owner, name: u.ownerName })
    const id = (screens.get(up(u.owner)) as { id: string }).id
    const cell = ((cells[id] ??= {})[table] ??= { ops: '', evidence: [] })
    if (cell.evidence.length < CRUD_MAX_EVIDENCE) cell.evidence.push({ rel: u.rel, line: u.line, heading: u.heading, ops: u.ops || '?', term: u.table, snippet: `${u.table} ${u.logical} 更新種別: ${u.kind}`.trim() })
    cell.ops = mergeOps(cell.ops, u.ops)
  }
  for (const row of Object.values(cells)) for (const cell of Object.values(row)) if (!cell.ops) cell.ops = '?'
  return { screens: [...screens.values()], tables: [...tables.values()], cells }
}

/** Bảng (hàng đầu là header) dạng TSV (dán vào Excel) hoặc Markdown (escape `\\` / `|`, gộp khoảng trắng). */
export function tableText(rows: string[][], format: 'md' | 'tsv'): string {
  if (format === 'tsv') return rows.map((r) => r.map(tsvCell).join('\t')).join('\n') + '\n'
  const md = (r: string[]): string => `| ${r.map((c) => c.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ')).join(' | ')} |`
  const [head = [], ...body] = rows
  return [md(head), `|${head.map(() => '---').join('|')}|`, ...body.map(md)].join('\n') + '\n'
}

/** CRUD図 dạng TSV (dán vào Excel) hoặc bảng Markdown. Hàng = màn hình, cột = bảng. */
export function crudText(m: CrudMatrix, format: 'md' | 'tsv'): string {
  const head = ['画面', ...m.tables]
  const rows = m.screens.map((s) => [s.name ? `${s.id} ${s.name}` : s.id, ...m.tables.map((t) => m.cells[s.id]?.[t]?.ops ?? '')])
  return tableText([head, ...rows], format)
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
  // 入力元情報 trỏ sang bảng khác (tên vật lý hoặc tên logic): hai bảng nối qua cột đó; một cạnh mỗi cặp
  const byName = new Map<string, string>()
  for (const t of index.tables) {
    byName.set(up(t.tableName), t.tableName)
    if (t.logicalName.trim().length >= 2 && !byName.has(up(t.logicalName.trim()))) byName.set(up(t.logicalName.trim()), t.tableName)
  }
  const pairs = new Map<string, { from: string; to: string; cols: string[] }>()
  for (const u of index.usages ?? []) {
    for (const s of u.sources) {
      const to = byName.get(up(s.from))
      if (!to || up(to) === up(u.table)) continue
      const k = [up(u.table), up(to)].sort().join('|')
      const p = pairs.get(k) ?? { from: u.table, to, cols: [] }
      if (!p.cols.includes(s.column)) p.cols.push(s.column)
      pairs.set(k, p)
    }
  }
  const rels = [...pairs.values()].map((p) => ({ from: p.from, to: p.to, label: p.cols.length > 2 ? `${p.cols.slice(0, 2).join(', ')} +${p.cols.length - 2}` : p.cols.join(', ') }))
  return { source: kept.length > 0 ? toErMermaid(kept, rels) : '', truncated: kept.length < defs.length }
}
