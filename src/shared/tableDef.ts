/* テーブル定義書 (Markdown đã convert) → DDL / Mermaid erDiagram / JSON. Thuần, dùng chung main + renderer.
 * Nhận diện: meta `- **テーブルID**: X` / heading gần nhất cho tên bảng, rồi bảng Markdown kế tiếp có cột
 * tên vật lý + cột kiểu. Header mỗi công ty một kiểu nên so theo danh sách alias (NFKC, không phân biệt hoa thường). */
import { splitTableRow } from './specDiff'

export type SqlDialect = 'generic' | 'postgres' | 'mysql' | 'oracle' | 'sqlserver'
export const SQL_DIALECTS: readonly SqlDialect[] = ['generic', 'postgres', 'mysql', 'oracle', 'sqlserver']

export interface TableColumn {
  /** Tên vật lý (物理名), luôn khác rỗng */
  name: string
  /** Tên logic (論理名), '' nếu không có */
  logical: string
  /** Kiểu như trong tài liệu (NFKC), vd `VARCHAR(10)`, `文字列`; '' nếu trống */
  type: string
  /** 桁数 / 小数桁 dạng chuỗi ('' nếu không có), vd '10', '2', 'MAX' */
  length: string
  scale: string
  pk: boolean
  notNull: boolean
  /** 既定値 nguyên văn ('' nếu không có; `-`, `N/A`, `なし` coi như không có) */
  default: string
  comment: string
  /** Dòng của hàng trong Markdown (tính từ 1) */
  line: number
}

export interface TableDef {
  /** Tên file nguồn (tham số `source` của parseTableDefs) */
  source: string
  /** Tên vật lý của bảng (テーブルID / 物理名 / heading gần nhất) */
  tableName: string
  /** Tên logic (テーブル名 / 論理名), '' nếu không có */
  logicalName: string
  columns: TableColumn[]
  /** Dòng header của bảng cột trong Markdown (tính từ 1) */
  line: number
}

/* ------------------------------- Nhận diện ------------------------------- */

/** Chuẩn hóa nhãn để so alias: NFKC, chữ thường, bỏ khoảng trắng / `*` / chú thích trong ngoặc. */
const normLabel = (s: string): string =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[\s*_`]/g, '')

type Field = 'name' | 'logical' | 'type' | 'length' | 'scale' | 'pk' | 'notnull' | 'nullable' | 'default' | 'comment'

const ALIASES: Record<Field, string[]> = {
  name: ['物理名', 'カラム物理名', '項目物理名', 'カラム名', 'column', 'columnname', 'physical', 'physicalname'],
  logical: ['論理名', '項目名', 'カラム論理名', '項目論理名', 'name', 'logicalname'],
  type: ['型', 'データ型', 'データタイプ', 'type', 'datatype'],
  length: ['桁', '桁数', '長さ', 'サイズ', 'length', 'size'],
  scale: ['小数', '小数桁', '小数桁数', 'scale'],
  pk: ['pk', '主キー', 'key', 'キー'],
  notnull: ['notnull', 'nn', '必須'],
  nullable: ['null許可', 'null', 'nullable', 'null可'],
  default: ['既定値', '初期値', 'デフォルト', 'デフォルト値', 'default', 'defaultvalue'],
  comment: ['備考', '説明', 'comment', 'remarks', 'description'],
}
const FIELD_OF = new Map<string, Field>(Object.entries(ALIASES).flatMap(([f, list]) => list.map((a) => [a, f as Field])))

const YES = new Set(['○', '◯', '●', '〇', '◎', '✓', '✔', 'y', 'yes', '1', 'true'])
const isYes = (v: string): boolean => YES.has(v.normalize('NFKC').trim().toLowerCase())
/** Giá trị "không có" trong ô (既定値 `N/A`,桁数 `-`...) */
const isBlank = (v: string): boolean => /^(?:[-－ー―‐]|n\/a|なし|無し)?$/i.test(v.normalize('NFKC').trim())

/** Ô bảng → chữ thuần: bỏ escape Markdown của converter (`\_`, `\<`), `**`, `` ` ``, link. */
function cellText(s: string | undefined): string {
  return (s ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!<>~&|])/g, '$1')
    .trim()
}

const DELIM_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-*:?\s*)*\|?\s*$/
const isTableStart = (line: string, next: string | undefined): boolean =>
  line.trimStart().startsWith('|') && next !== undefined && DELIM_RE.test(next) && next.includes('-')

const META_RE = /^\s*(?:[-*+]\s+)?(?:\*\*)?([^*:：|]{1,40}?)(?:\*\*)?\s*[:：]\s*(?:\*\*)?\s*(.+?)\s*$/
const ID_LABELS = new Set(['テーブルid', 'テーブル物理名', '物理名', 'tableid'].map(normLabel))
const NAME_LABELS = new Set(['テーブル名', '論理名', 'テーブル論理名', 'tablename'].map(normLabel))
const IDENT_RE = /[A-Za-z_][A-Za-z0-9_$#.]*/
const isIdent = (s: string): boolean => new RegExp(`^${IDENT_RE.source}$`).test(s)

/** Heading chung chung (【カラム定義】, テーブル定義...) không dùng làm tên bảng. */
const GENERIC_HEADING = /^(?:テーブル|カラム|項目|列|フィールド|table|columns?|fields?)?\s*(?:定義|一覧|情報|レイアウト|definition|list)?\s*書?$/i
const cleanHeading = (s: string): string =>
  cellText(s)
    .replace(/[【】■□◆◇●]/g, ' ')
    .replace(/^\s*(?:\d+(?:\.\d+)*\.?|[(（]\d+[)）])\s*/, '')
    .trim()

/** Tìm mọi テーブル定義 trong Markdown. Không ném với Markdown bất kỳ. */
export function parseTableDefs(md: string, source = ''): TableDef[] {
  const lines = md.split(/\r?\n/)
  const defs: TableDef[] = []
  let metaId = ''
  let metaName = ''
  const headings: { level: number; text: string }[] = []
  let fence = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (f) {
      if (!fence) fence = f[1]
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = ''
      continue
    }
    if (fence) continue
    const h = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) {
      const level = h[1].length
      while (headings.length > 0 && headings[headings.length - 1].level >= level) headings.pop()
      headings.push({ level, text: cleanHeading(h[2]) })
      // Sheet / phần mới (# / ##): meta của bảng trước không còn hiệu lực
      if (level <= 2) metaId = metaName = ''
      continue
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      metaId = metaName = ''
      continue
    }
    if (isTableStart(line, lines[i + 1])) {
      const header = splitTableRow(line)
      const cols = new Map<Field, number>()
      header.forEach((c, idx) => {
        const field = FIELD_OF.get(normLabel(cellText(c)))
        if (field && !cols.has(field)) cols.set(field, idx)
      })
      const start = i
      i += 2
      const rows: { cells: string[]; line: number }[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        rows.push({ cells: splitTableRow(lines[i]), line: i + 1 })
        i++
      }
      i--
      if (!cols.has('name') || !cols.has('type')) continue
      const get = (cells: string[], f: Field): string => {
        const idx = cols.get(f)
        return idx === undefined ? '' : cellText(cells[idx]).replace(/\n+/g, ' ')
      }
      const columns: TableColumn[] = []
      for (const { cells, line: n } of rows) {
        const name = get(cells, 'name').normalize('NFKC').trim()
        if (!name || isBlank(name)) continue
        let length = get(cells, 'length').normalize('NFKC').trim()
        let scale = get(cells, 'scale').normalize('NFKC').trim()
        if (isBlank(length)) length = ''
        if (isBlank(scale)) scale = ''
        // 桁数 "10,2" / "10.2" khi không có cột 小数
        const ps = /^(\d+)\s*[,.、]\s*(\d+)$/.exec(length)
        if (ps && !scale) [length, scale] = [ps[1], ps[2]]
        const pkCell = get(cells, 'pk').normalize('NFKC').trim()
        const pk = isYes(pkCell) || /^[1-9]\d*$/.test(pkCell) || /\bpk\b|主/i.test(pkCell)
        const notNull = cols.has('notnull')
          ? isYes(get(cells, 'notnull')) || /not\s*null/i.test(get(cells, 'notnull'))
          : cols.has('nullable')
            ? !isYes(get(cells, 'nullable'))
            : false
        const def = get(cells, 'default')
        columns.push({
          name,
          logical: get(cells, 'logical'),
          type: get(cells, 'type').normalize('NFKC').trim(),
          length,
          scale,
          pk,
          notNull,
          default: isBlank(def) ? '' : def,
          comment: get(cells, 'comment'),
          line: n,
        })
      }
      if (columns.length === 0) continue
      // Tên bảng: meta trước, rồi heading gần nhất không chung chung
      let tableName = metaId
      let logicalName = metaName
      if (!tableName && isIdent(metaName)) [tableName, logicalName] = [metaName, '']
      if (!tableName) {
        const head = [...headings].reverse().find((x) => x.text && !GENERIC_HEADING.test(x.text))?.text ?? ''
        const id = IDENT_RE.exec(head)?.[0] ?? ''
        if (id.length >= 2) {
          tableName = id
          const rest = head.replace(id, '')
          logicalName ||= /[（(]([^)）]+)[)）]/.exec(rest)?.[1].trim() ?? rest.replace(/^[\s:：()（）\-_/]+|[\s:：()（）\-_/]+$/g, '')
        } else {
          tableName = head || `table_${defs.length + 1}`
          logicalName ||= head
        }
      }
      defs.push({ source, tableName, logicalName, columns, line: start + 1 })
      metaId = metaName = ''
      continue
    }
    const m = META_RE.exec(line)
    if (m) {
      const label = normLabel(m[1])
      const value = cellText(m[2])
      if (ID_LABELS.has(label)) metaId = value.normalize('NFKC')
      else if (NAME_LABELS.has(label)) metaName = value
    }
  }
  return defs
}

/* ---------------------------------- DDL ---------------------------------- */

type TypeClass = 'varchar' | 'nvarchar' | 'char' | 'nchar' | 'numeric' | 'int' | 'bigint' | 'smallint' | 'date' | 'datetime' | 'timestamp' | 'boolean' | 'text'

const TYPE_CLASS: Record<string, TypeClass> = {
  VARCHAR: 'varchar', VARCHAR2: 'varchar', 'CHARACTER VARYING': 'varchar', STRING: 'varchar', 文字列: 'varchar', 可変長文字列: 'varchar', 文字: 'varchar',
  NVARCHAR: 'nvarchar', NVARCHAR2: 'nvarchar',
  CHAR: 'char', CHARACTER: 'char', 固定長文字列: 'char',
  NCHAR: 'nchar',
  NUMBER: 'numeric', NUMERIC: 'numeric', DECIMAL: 'numeric', DEC: 'numeric', 数値: 'numeric', 数字: 'numeric',
  INT: 'int', INTEGER: 'int', INT4: 'int', 整数: 'int',
  BIGINT: 'bigint', INT8: 'bigint',
  SMALLINT: 'smallint', INT2: 'smallint',
  DATE: 'date', 日付: 'date',
  DATETIME: 'datetime', DATETIME2: 'datetime', 日時: 'datetime',
  TIMESTAMP: 'timestamp', タイムスタンプ: 'timestamp',
  BOOLEAN: 'boolean', BOOL: 'boolean', BIT: 'boolean', 真偽値: 'boolean',
  TEXT: 'text', CLOB: 'text', NCLOB: 'text', テキスト: 'text',
}

// Thứ tự cột: generic, postgres, mysql, oracle, sqlserver
const TYPE_NAME: Record<TypeClass, [string, string, string, string, string]> = {
  varchar: ['VARCHAR', 'VARCHAR', 'VARCHAR', 'VARCHAR2', 'VARCHAR'],
  nvarchar: ['NVARCHAR', 'VARCHAR', 'VARCHAR', 'NVARCHAR2', 'NVARCHAR'],
  char: ['CHAR', 'CHAR', 'CHAR', 'CHAR', 'CHAR'],
  nchar: ['NCHAR', 'CHAR', 'CHAR', 'NCHAR', 'NCHAR'],
  numeric: ['NUMERIC', 'NUMERIC', 'DECIMAL', 'NUMBER', 'DECIMAL'],
  int: ['INTEGER', 'INTEGER', 'INT', 'NUMBER(10)', 'INT'],
  bigint: ['BIGINT', 'BIGINT', 'BIGINT', 'NUMBER(19)', 'BIGINT'],
  smallint: ['SMALLINT', 'SMALLINT', 'SMALLINT', 'NUMBER(5)', 'SMALLINT'],
  date: ['DATE', 'DATE', 'DATE', 'DATE', 'DATE'],
  datetime: ['TIMESTAMP', 'TIMESTAMP', 'DATETIME', 'TIMESTAMP', 'DATETIME2'],
  timestamp: ['TIMESTAMP', 'TIMESTAMP', 'TIMESTAMP', 'TIMESTAMP', 'DATETIME2'],
  boolean: ['BOOLEAN', 'BOOLEAN', 'BOOLEAN', 'NUMBER(1)', 'BIT'],
  text: ['TEXT', 'TEXT', 'TEXT', 'CLOB', 'NVARCHAR(MAX)'],
}
const SIZED: ReadonlySet<TypeClass> = new Set(['varchar', 'nvarchar', 'char', 'nchar', 'numeric'])
/** Kiểu SQL "lạ" vẫn giữ nguyên nếu đúng hình dạng (UUID, JSONB, BLOB, RAW(16)...). */
const SQL_TYPE_RE = /^[A-Za-z][A-Za-z0-9_]*(?: [A-Za-z][A-Za-z0-9_]*)*(?:\(\s*[0-9A-Za-z]+(?:\s*,\s*[0-9]+)?(?:\s+(?:BYTE|CHAR))?\s*\))?(?: [A-Za-z][A-Za-z0-9_]*)*$/

const di = (d: SqlDialect): number => SQL_DIALECTS.indexOf(d)
const num = (s: string): string => /\d+/.exec(s)?.[0] ?? ''

/** Kiểu SQL theo dialect; null nếu kiểu không phải dạng SQL (vd 時刻) → caller dùng kiểu dự phòng. */
function sqlType(col: TableColumn, d: SqlDialect): string | null {
  const m = /^(.*?)\s*(\(.*\))?$/.exec(col.type.trim()) ?? ['', '', undefined]
  const base = m[1].trim()
  let parens = m[2]
  const cls = TYPE_CLASS[base.toUpperCase().replace(/\s+/g, ' ')]
  if (!cls) return SQL_TYPE_RE.test(col.type.trim()) ? col.type.trim() : null
  const name = TYPE_NAME[cls][di(d)]
  if (!SIZED.has(cls) || name.includes('(')) return name
  if (parens) {
    // VARCHAR2(10 BYTE) chỉ hợp lệ ở Oracle
    if (d !== 'oracle') parens = parens.replace(/\s+(?:BYTE|CHAR)\s*\)/i, ')')
    const p = /^\(\s*(\d+|MAX)\s*(?:,\s*(\d+)\s*)?(\s(?:BYTE|CHAR))?\s*\)$/i.exec(parens)
    return p ? `${name}(${p[1]}${p[2] ? ',' + p[2] : ''}${p[3] ? ' ' + p[3].trim().toUpperCase() : ''})` : name
  }
  const len = /^max$/i.test(col.length) ? (d === 'sqlserver' ? 'MAX' : '') : num(col.length)
  const scale = num(col.scale)
  if (cls === 'numeric') return len ? `${name}(${len}${scale ? ',' + scale : ''})` : name
  // VARCHAR không độ dài: MySQL / Oracle / SQL Server bắt buộc (SQL Server mặc định 1)
  return len ? `${name}(${len})` : d === 'mysql' || d === 'oracle' || d === 'sqlserver' ? `${name}(255)` : name
}

const RESERVED = new Set(
  'add all alter and as asc between by case check column comment constraint create current date default delete desc distinct drop else end exists from grant group having in index insert into is key level like limit not null number of offset on option or order primary references rename row rows select session set size start table then to trigger union unique update user values view when where with'.split(' ')
)

/** Tên định danh SQL: chỉ bọc khi cần (ký tự lạ, từ khóa, bắt đầu bằng số). `a.b` an toàn giữ nguyên dạng schema.table. */
export function quoteIdent(name: string, d: SqlDialect): string {
  const safe = (p: string): boolean => /^[A-Za-z_][A-Za-z0-9_$#]*$/.test(p) && !RESERVED.has(p.toLowerCase())
  if (name.split('.').every(safe)) return name
  if (d === 'mysql') return '`' + name.replace(/`/g, '``') + '`'
  if (d === 'sqlserver') return '[' + name.replace(/]/g, ']]') + ']'
  return '"' + name.replace(/"/g, '""') + '"'
}

/** Chuỗi SQL: nháy đơn nhân đôi; MySQL coi `\` là escape nên nhân đôi luôn. */
const sqlString = (s: string, d: SqlDialect): string => "'" + (d === 'mysql' ? s.replace(/\\/g, '\\\\') : s).replace(/'/g, "''") + "'"
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim()
const blockComment = (s: string): string => '/* ' + oneLine(s).replace(/\*\//g, '* /').replace(/\/\*/g, '/ *') + ' */'

const SQL_FUNCS = new Set(['CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME', 'LOCALTIMESTAMP', 'LOCALTIME', 'SYSDATE', 'SYSTIMESTAMP', 'CURRENT_USER', 'NULL', 'TRUE', 'FALSE'])

function sqlDefault(v: string, d: SqlDialect): string {
  const s = oneLine(v)
  // Số có số 0 đứng đầu ('01') là chuỗi mã, giữ nháy
  if (/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)) return s
  if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) return s.replace(/,/g, '')
  if (SQL_FUNCS.has(s.toUpperCase())) return s.toUpperCase()
  // Hàm không tham số: now(), GETDATE(), gen_random_uuid()
  if (/^[A-Za-z_][A-Za-z0-9_]*\(\)$/.test(s)) return s
  const quoted = /^'(.*)'$/.exec(s)
  return sqlString(quoted ? quoted[1].replace(/''/g, "'") : s, d)
}

/** CREATE TABLE cho mọi bảng (bỏ cột không có tên vật lý / trùng tên; bảng không còn cột thì bỏ). */
export function toDDL(defs: TableDef[], dialect: SqlDialect = 'generic'): string {
  const d = SQL_DIALECTS.includes(dialect) ? dialect : 'generic'
  const out: string[] = []
  for (const def of defs) {
    const seen = new Set<string>()
    const cols = def.columns.filter((c) => {
      const k = c.name.trim().toLowerCase()
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
    if (cols.length === 0 || !def.tableName.trim()) continue
    const table = quoteIdent(def.tableName.trim(), d)
    const label = (c: TableColumn): string => oneLine(c.logical || c.comment)
    const lines = cols.map((c) => {
      const type = sqlType(c, d)
      const parts = [quoteIdent(c.name.trim(), d), type ?? `${d === 'oracle' ? 'VARCHAR2' : 'VARCHAR'}(${num(c.length) || 255})`]
      if (type === null) parts.push(blockComment(c.type || '?'))
      if (c.default) parts.push('DEFAULT ' + sqlDefault(c.default, d))
      if (c.notNull || c.pk) parts.push('NOT NULL')
      if (d === 'mysql' && label(c)) parts.push('COMMENT ' + sqlString(label(c), d))
      return '  ' + parts.join(' ')
    })
    const pk = cols.filter((c) => c.pk)
    if (pk.length > 0) lines.push(`  PRIMARY KEY (${pk.map((c) => quoteIdent(c.name.trim(), d)).join(', ')})`)
    const head = [def.logicalName, def.source].map(oneLine).filter(Boolean).join(' / ')
    const tableComment = d === 'mysql' && def.logicalName ? ' COMMENT=' + sqlString(oneLine(def.logicalName), d) : ''
    const block = [...(head ? ['-- ' + head] : []), `CREATE TABLE ${table} (`, lines.join(',\n'), `)${tableComment};`]
    if (d === 'postgres' || d === 'oracle') {
      if (def.logicalName) block.push(`COMMENT ON TABLE ${table} IS ${sqlString(oneLine(def.logicalName), d)};`)
      for (const c of cols) if (label(c)) block.push(`COMMENT ON COLUMN ${table}.${quoteIdent(c.name.trim(), d)} IS ${sqlString(label(c), d)};`)
    }
    out.push(block.join('\n'))
  }
  return out.length > 0 ? out.join('\n\n') + '\n' : ''
}

/* -------------------------------- Mermaid -------------------------------- */

/** Định danh ASCII an toàn cho Mermaid; tên có ký tự khác (tiếng Nhật...) thay bằng `prefix_n`. */
function mermaidId(name: string, prefix: string, n: number, used: Set<string>): string {
  let id = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : name.replace(/[^A-Za-z0-9_]/g, '_')
  if (id !== name && !/[A-Za-z0-9]/.test(id)) id = `${prefix}_${n}`
  // PK / FK / UK là từ khóa của lexer Mermaid
  if (/^[0-9]/.test(id) || /^(?:pk|fk|uk)$/i.test(id)) id = `${prefix}_${id}`
  let out = id
  for (let k = 2; used.has(out.toLowerCase()); k++) out = `${id}_${k}`
  used.add(out.toLowerCase())
  return out
}
/** Kiểu thuộc tính: chữ ASCII + `(),` (ngữ pháp Mermaid), kiểu tiếng Nhật / trống thành `unknown`. */
function mermaidType(type: string): string {
  const t = type.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_(),]/g, '')
  return /^[A-Za-z_]/.test(t) && /[A-Za-z0-9]/.test(t) ? t : 'unknown'
}
/** Chuỗi trong "...": Mermaid không cho `"`, `%`, `\`, xuống dòng. */
const mermaidText = (s: string): string => oneLine(s).replace(/["%\\]/g, ' ').replace(/\s+/g, ' ').trim()

/** Bảng có đúng 1 cột PK → tên cột PK (chữ thường), không thì ''. */
const singlePk = (def: TableDef): string => {
  const pk = def.columns.filter((c) => c.pk)
  return pk.length === 1 ? pk[0].name.toLowerCase() : ''
}

/** Mermaid `erDiagram`: thực thể + thuộc tính (kiểu, PK/FK, tên logic) + quan hệ FK suy ra thận trọng:
 * cột A trùng tên với PK đơn của bảng B (hoặc tên `<B>_ID`, bỏ tiền tố TBL_/M_/T_...) và không phải PK đơn của A. */
export function toErMermaid(defs: TableDef[]): string {
  const used = new Set<string>()
  const tables = defs
    .filter((d) => d.columns.length > 0)
    .map((def, i) => {
      const id = mermaidId(def.tableName, 'T', i + 1, used)
      return { def, id, pk: singlePk(def) }
    })
  const rels: string[] = []
  const fk = new Set<string>()
  for (const a of tables) {
    for (const c of a.def.columns) {
      const col = c.name.toLowerCase()
      if (c.pk && a.pk === col) continue
      for (const b of tables) {
        if (b === a || !b.pk) continue
        const bName = b.def.tableName.toLowerCase()
        const stem = bName.replace(/^(?:tbl|tb|t|m|mst|tm|tt)_/, '')
        if (col !== b.pk && col !== `${bName}_id` && col !== `${stem}_id`) continue
        const key = `${a.id}|${b.id}|${col}`
        if (fk.has(key)) continue
        fk.add(key)
        fk.add(`${a.id}|${col}`)
        rels.push(`  ${a.id} }o--|| ${b.id} : "${mermaidText(c.name) || 'fk'}"`)
      }
    }
  }
  const lines = ['erDiagram']
  for (const { def, id } of tables) {
    const label = mermaidText([def.tableName, def.logicalName && def.logicalName !== def.tableName && `(${def.logicalName})`].filter(Boolean).join(' '))
    lines.push(`  ${id}${label && label !== id ? `["${label}"]` : ''} {`)
    const attrUsed = new Set<string>()
    def.columns.forEach((c, j) => {
      const type = mermaidType(sqlType(c, 'generic') ?? c.type)
      const name = mermaidId(c.name, 'col', j + 1, attrUsed)
      const keys = [c.pk && 'PK', fk.has(`${id}|${c.name.toLowerCase()}`) && 'FK'].filter(Boolean).join(', ')
      const comment = mermaidText([c.logical, name !== c.name && c.name].filter(Boolean).join(' / '))
      lines.push(`    ${type} ${name}${keys ? ' ' + keys : ''}${comment ? ` "${comment}"` : ''}`)
    })
    lines.push('  }')
  }
  return [...lines, ...rels].join('\n') + '\n'
}

/** JSON (2 khoảng trắng) của danh sách bảng. */
export function toJson(defs: TableDef[]): string {
  return JSON.stringify(defs, null, 2) + '\n'
}
