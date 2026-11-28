/* CRUD図 画面 × テーブル: động từ -> thao tác, ma trận kèm bằng chứng, xuất TSV / Markdown. */
import { tsvCell } from './mdLines'
import { normRule, type ProjectRules } from './projectConfig'
import { CRUD_ORDER, ownerScreen, up, type CrudOp, type SpecIndex, type SpecLoc, type SpecScreen } from './specCore'

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
