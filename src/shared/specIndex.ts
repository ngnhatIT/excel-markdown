/* Bản đồ thiết kế + 影響調査: chỉ mục thuần (không AI, không mạng) của cả thư mục tài liệu Markdown đã convert.
 * Rút ra 画面 (meta 画面ID / 画面名), 画面遷移 (meta chuỗi `A → B` và dòng `〔矢印〕A → B（nhãn）` từ shape),
 * テーブル定義 (parseTableDefs), chỗ nhắc tới bảng / cột / 画面ID ở nơi khác, và lỗi nhất quán.
 * Dùng chung main (IPC) + renderer. Dữ liệu không tin cậy: mọi thứ đều có giới hạn. */
import { findGlossaryRel, parseGlossary } from './glossary'
import { atxHeading, fenceAfter, isDelimRow } from './mdLines'
import type { ProjectRules } from './projectConfig'
import { ambiguousIssues, itemLengthIssues } from './specChecks'
import { crudOpsOf } from './specCrud'
import { splitTableRow } from './specDiff'
import { parseTableDefs, type TableColumn, type TableDef } from './tableDef'
import {
  ARROW_SPLIT, CRUD_ORDER, FILE_EXT, MAX_LINE, META_RE, MIN_NAME, SCREEN_ID_LABELS, SCREEN_NAME_LABELS, SPEC_MAX_DOCS, SPEC_MAX_REFS, TOKEN_RE,
  TRANSITION_LABELS, isAscii, isDecision, isItemHeader, itemColumns, ownerScreen, lineInfo, normLabel, normName, plain, snippetOf, splitEndpoint, splitLabel, stripFormula, typeSig, up,
  type CrudOp, type DocInfo, type SpecDoc, type SpecIndex, type SpecIssue, type SpecLoc, type SpecNode, type SpecProject, type SpecRef, type SpecRefKind,
  type SpecScreen, type SpecTransition, type TableUsage,
} from './specCore'

export * from './specCore'
export * from './specChecks'
export * from './specCrud'
export * from './specDiagram'
export * from './specImpact'

/* ---------------------------- テーブル編集仕様 ---------------------------- */

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
export function buildSpecIndex(input: SpecDoc[], project?: SpecProject, opts: { headingScreens?: boolean } = {}): SpecIndex {
  const docs = input.slice(0, SPEC_MAX_DOCS)
  const rules = project?.rules
  const screenIdLabels = new Set([...SCREEN_ID_LABELS, ...(rules?.screenIdLabels ?? []).map(normLabel)])
  const transitionLabels = new Set([...TRANSITION_LABELS, ...(rules?.transitionLabels ?? []).map(normLabel)])
  const extraAmbiguous = rules?.ambiguousWords ?? []
  const screens: SpecScreen[] = []
  const tables: TableDef[] = []
  const usages: TableUsage[] = []
  const raw: RawEdge[] = []
  const infos = new Map<string, DocInfo>()
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
    // Tài liệu không ghi 画面ID (Mock / テスト観点表): phần có bảng 項目定義 mà chưa thuộc màn hình nào -> heading của phần là màn hình
    if (opts.headingScreens) {
      const mine = screens.filter((s) => s.rel === doc.rel)
      for (let i = 0; i + 1 < lines.length; i++) {
        if (!lines[i].trimStart().startsWith('|') || !isDelimRow(lines[i + 1]) || !isItemHeader(itemColumns(splitTableRow(lines[i]), rules?.itemColumns))) continue
        const start = section.indexOf(section[i])
        const title = lines.slice(start, i).map((l) => atxHeading(l)).find((h) => h && h.level <= 2)
        const id = title ? plain(title.text).replace(/[【】]/g, '').trim() : ''
        if (!id || ownerScreen(mine, i + 1)) continue
        const sc: SpecScreen = { ...loc(start), id, name: '', end: section.lastIndexOf(section[i]) + 1 }
        screens.push(sc)
        mine.push(sc)
      }
    }
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

  ambiguousIssues(docs, infos, screens, tables, extraAmbiguous, issues)
  const itemScreens = itemLengthIssues(docs, infos, screens, tableByName.values(), defLines, issues, rules)

  const gRel = findGlossaryRel(docs.map((d) => d.rel))
  const gDoc = gRel === undefined ? undefined : docs.find((d) => d.rel === gRel)

  return {
    docCount: docs.length,
    rels: docs.map((d) => d.rel),
    itemScreens,
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
