/* Bản đồ thiết kế: kiểu dữ liệu, hằng và tiện ích dùng chung của chỉ mục (specIndex / specChecks / specImpact /
 * specCrud / specDiagram). Thuần, không phụ thuộc file nào trong nhóm đó. */
import type { GlossaryEntry } from './glossary'
import { atxHeading, fenceAfter, normLabel as normHeader } from './mdLines'
import type { ProjectRules } from './projectConfig'
import type { TableColumn, TableDef } from './tableDef'

/** Giới hạn cho đầu vào không tin cậy */
export const SPEC_MAX_DOCS = 5000
export const SPEC_MAX_REFS = 20_000
export const SPEC_MAX_NODES = 500
/** Mermaid mặc định từ chối sơ đồ dài hơn 50 000 ký tự */
export const MERMAID_MAX_TEXT = 45_000
/** Dòng dài hơn (ảnh data: base64...) không quét tham chiếu */
export const MAX_LINE = 20_000
/** Tên vật lý ngắn hơn không tính tham chiếu (giảm nhiễu: `id`, `no`...) */
export const MIN_NAME = 3
/** Tối đa cảnh báo `ambiguous-term` (tài liệu viết mơ hồ hàng loạt không làm ngập danh sách) */
export const MAX_AMBIGUOUS = 500
/** Cách viết mơ hồ trong 設計書 cần chốt. `等` loại các từ ghép thường gặp (同等, 平等, 等しい, 等号...). */
export const AMBIGUOUS_RE = /など|適宜|原則|要確認|検討中|未定|(?<![A-Za-z0-9])TB[DC](?![A-Za-z0-9])|(?<![同平均対上高初中劣優何])等(?![しい号級価分式])/

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
export const ITEM_ALIASES: Record<ItemField, string[]> = {
  item: ['画面ラベル', '項目名', '項目', '項目名称', '表示名', 'フィールド名', 'フィールド', 'item', 'itemname', 'field', 'fieldname', 'tênhạngmục', 'hạngmục', 'têntrường', 'trường'],
  required: ['必須', '必須区分', '必須/任意', '入力必須', '必須項目', 'required', 'mandatory', 'bắtbuộc'],
  length: ['桁数', '桁', '長さ', '最大桁数', '最大長', '文字数', '最大文字数', 'データ長', 'サイズ', 'length', 'maxlength', 'size', 'độdài', 'kíchthước', 'sốkýtự'],
  type: ['型', 'データ型', '属性', 'データ種別', 'データタイプ', '形式', 'type', 'datatype', 'format', 'kiểu', 'kiểudữliệu'],
  kind: ['区分', '入出力', '項目区分', '入出力区分', 'i/o区分', 'io区分', 'コントロール', '部品', 'i/o', 'io', 'control', 'controltype', 'component', 'loại', 'loạiđiềukhiển'],
  default: ['初期値', '初期表示', '既定値', 'デフォルト', 'デフォルト値', 'default', 'defaultvalue', 'initialvalue', 'giátrịmặcđịnh', 'giátrịbanđầu', 'mặcđịnh'],
  note: ['備考', '説明', '補足', 'コメント', 'note', 'notes', 'remarks', 'remark', 'description', 'comment', 'ghichú', 'môtả'],
  check: ['入力チェック', 'チェック', 'チェック内容', 'バリデーション', '入力制限', '制約', 'validation', 'constraint', 'kiểmtra', 'ràngbuộc'],
}
export const ITEM_FIELD_OF = new Map<string, ItemField>(Object.entries(ITEM_ALIASES).flatMap(([f, list]) => list.map((a) => [a, f as ItemField])))
export const ITEM_FIELDS = Object.keys(ITEM_ALIASES) as ItemField[]
/** Tên cột 項目定義 riêng của dự án (x2m.json `rules.itemColumns`), cộng thêm vào alias có sẵn. */
export type ItemColumnRules = Record<ItemField, string[]>

/** Alias đủ dài để khớp một phần header (`入力項目名` ⊃ `項目名`, `Input type` ⊃ `type`): chữ CJK ≥ 2, chữ Latin ≥ 4.
 * Alias dài đứng trước để `チェック内容` thắng `チェック`. */
const FUZZY_ALIASES: [string, ItemField][] = [...ITEM_FIELD_OF]
  .filter(([a]) => (/^[\x20-\x7e]+$/.test(a) ? a.length >= 4 : a.length >= 2))
  .sort((x, y) => y[0].length - x[0].length)

/** Vị trí các cột 項目定義 theo hàng header của bảng (ô thô). Một chỗ duy nhất cho 整合性 / Mock / テスト観点表.
 * Khớp nguyên văn trước (alias có sẵn + `extra` của x2m.json); cột còn lại khớp một phần, vai trò đã có cột thì bỏ qua. */
export function itemColumns(header: string[], extra?: ItemColumnRules): Map<ItemField, number> {
  const cols = new Map<ItemField, number>()
  const heads = header.map((cell) => normHeader(plain(cell)))
  const taken = new Set<number>()
  heads.forEach((h, k) => {
    const f = ITEM_FIELD_OF.get(h) ?? (extra ? ITEM_FIELDS.find((x) => extra[x].some((a) => normHeader(a) === h)) : undefined)
    if (!f) return
    taken.add(k)
    if (!cols.has(f)) cols.set(f, k)
  })
  // Cột khớp alias dài hơn được chọn trước: `入力項目名` (⊃ 項目名) thắng `項目ID` (⊃ 項目) cho vai trò item
  heads
    .map((h, k) => ({ k, hit: taken.has(k) || !h ? undefined : FUZZY_ALIASES.find(([a]) => h.includes(a)) }))
    .filter((x): x is { k: number; hit: [string, ItemField] } => x.hit !== undefined)
    .sort((x, y) => y.hit[0].length - x.hit[0].length)
    .forEach(({ k, hit }) => {
      if (!cols.has(hit[1])) cols.set(hit[1], k)
    })
  return cols
}
/** Header của bảng 項目定義: có cột tên hạng mục và ít nhất một cột thuộc tính. */
export const isItemHeader = (cols: Map<ItemField, number>): boolean =>
  cols.has('item') && (cols.has('kind') || cols.has('type') || cols.has('length') || cols.has('required'))

/* -------------------------------- Tiện ích -------------------------------- */

/** Bỏ escape Markdown của converter (`\_`, `\|`...), `<br>`, `**`, `` ` `` để so chữ thuần. */
export const plain = (s: string): string =>
  s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!<>~&|])/g, '$1')

/** Nhãn meta để so alias: NFKC, chữ thường, bỏ khoảng trắng / `*` / `_`. */
export const normLabel = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[\s*_`]/g, '')
/** Tên màn hình để so: NFKC, bỏ khoảng trắng, bỏ đuôi 画面 (`顧客検索画面` ≡ `顧客検索`). */
export const normName = (s: string): string => s.normalize('NFKC').replace(/\s+/g, '').replace(/画面$/, '').toLowerCase()
/** Khóa so tên vật lý: chữ ASCII không phân biệt hoa thường, CJK giữ nguyên. */
export const up = (s: string): string => s.normalize('NFKC').toUpperCase()

// Ô Excel tham chiếu ô khác: converter để lại `giá trị =Sheet!AH3` -> bỏ phần công thức
export const stripFormula = (s: string): string => s.replace(/\s*=(?:'[^']+'|[^=\s']*)![$A-Z]+[$\d]+$/, '').trim()
export const META_RE = /^\s*[-*+]\s+(?:\*\*)?([^*:：|]{1,40}?)(?:\*\*)?\s*[:：]\s*(.*?)\s*$/
// Nhãn tiếng Việt cho tài liệu viết bằng tiếng Việt (vd `- **Mã màn hình**: CHECKOUT`)
export const SCREEN_ID_LABELS = new Set(['画面id', '画面番号', 'screenid', 'mã màn hình', 'id màn hình'].map(normLabel))
export const SCREEN_NAME_LABELS = new Set(['画面名', '画面名称', 'screenname', 'tên màn hình'].map(normLabel))
export const TRANSITION_LABELS = new Set(['画面遷移', 'screentransition', 'chuyển màn hình', 'luồng màn hình'].map(normLabel))
export const ARROW_SPLIT = /\s*(→|->|⇒|=>|⟶|➡|↔|<->)\s*/
export const ID_LIKE = /^[A-Za-z][A-Za-z0-9]*\d[A-Za-z0-9_-]*$/
/** Định danh ASCII (có thể có `.` / `-`): bảng, cột, `TBL.COL`, 画面ID */
export const TOKEN_RE = /(?<![A-Za-z0-9_$#])[A-Za-z0-9_][A-Za-z0-9_$#-]*(?:\.[A-Za-z_][A-Za-z0-9_$#-]*)*/g
// shortcut: `TBL_CUSTOMER.md` (tên file) không phải cột; danh sách đuôi cố định, mở rộng khi gặp nhiễu khác
export const FILE_EXT = /^(?:md|markdown|xlsx?|xlsm|csv|sql|txt|json|ya?ml|png|jpe?g|gif|pdf|docx?)$/i
export const isAscii = (s: string): boolean => /^[\x20-\x7e]+$/.test(s)

export function snippetOf(line: string, at: number): string {
  const s = line.trim().replace(/\s+/g, ' ')
  if (s.length <= 140) return s
  const start = Math.max(0, Math.min(at - 50, s.length - 140))
  return (start > 0 ? '…' : '') + s.slice(start, start + 140) + (start + 140 < s.length ? '…' : '')
}

/** Mỗi dòng của tài liệu: heading gần nhất + số "phần" (đổi ở `#`/`##` và `---`, như parseTableDefs). */
export function lineInfo(lines: string[]): { heading: string[]; section: number[] } {
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
export function splitEndpoint(text: string): { id: string; name: string } {
  const toks = text.split(/\s+/).filter(Boolean)
  const id = toks.find((t) => ID_LIKE.test(t)) ?? ''
  return { id, name: toks.filter((t) => t !== id).join(' ') }
}

/** Nhãn cạnh `（…）` / `(…)` ở cuối đầu mút. */
export function splitLabel(text: string): { text: string; label: string } {
  const m = /^(.*?)\s*[（(]([^（）()]*)[）)]\s*$/.exec(text)
  return m && m[1] ? { text: m[1].trim(), label: m[2].trim() } : { text: text.trim(), label: '' }
}

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

/** Dòng, heading gần nhất và số phần của một tài liệu (xem lineInfo). */
export interface DocInfo {
  lines: string[]
  heading: string[]
  section: number[]
}

/** Số ký tự tối đa của cột kiểu chữ (CHAR / VARCHAR / NVARCHAR2 / 文字列...); kiểu khác hoặc không rõ 桁数 -> undefined. */
export function charLength(c: TableColumn): number | undefined {
  const t = up(c.type).replace(/\s+/g, '')
  if (!/CHAR|文字|STRING|TEXT/.test(t)) return undefined
  const n = /^\d+/.exec(up(c.length))?.[0] ?? /\((\d+)/.exec(t)?.[1]
  return n ? Number(n) : undefined
}

/** Chữ ký kiểu để so: `VARCHAR(10)`; kiểu trống -> '' (không so được). */
export function typeSig(c: TableColumn): string {
  const t = up(c.type).replace(/\s+/g, '')
  if (!t) return ''
  return t.includes('(') || !c.length ? t : `${t}(${up(c.length)}${c.scale ? ',' + c.scale : ''})`
}

/** Screen (cùng file) sở hữu dòng `line`: 画面ID gần nhất phía trên, trong cùng phần `#`/`##`. */
export function ownerScreen(screens: SpecScreen[], line: number): SpecScreen | undefined {
  let best: SpecScreen | undefined
  for (const s of screens) if (s.line <= line && line <= s.end && (!best || s.line > best.line)) best = s
  return best
}

/** Nút điều kiện / rẽ nhánh trong sơ đồ 画面遷移 (kết thúc bằng ？ / ?), vd 権限あり？, 入力OK? */
export const isDecision = (label: string): boolean => /[?？]\s*$/.test(label)

export type CrudOp = 'C' | 'R' | 'U' | 'D'
export const CRUD_ORDER: CrudOp[] = ['C', 'R', 'U', 'D']
