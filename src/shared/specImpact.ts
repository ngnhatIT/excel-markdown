/* 影響調査: sửa một bảng / cột / màn hình thì ảnh hưởng tới đâu (trên chỉ mục đã dựng). */
import { normName, ownerScreen, up, type SpecIndex, type SpecLoc, type SpecRef, type SpecScreen } from './specCore'
import type { TableDef } from './tableDef'

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

const labelOf = (index: SpecIndex, key: string): string => index.nodes.find((n) => n.key === key)?.label ?? key.replace(/^\?/, '')
