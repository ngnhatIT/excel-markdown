/* Sơ đồ Mermaid của chỉ mục: 画面遷移 (flowchart) và ER. */
import { MERMAID_MAX_TEXT, SPEC_MAX_NODES, isDecision, up, type SpecIndex } from './specCore'
import { toErMermaid, type TableDef } from './tableDef'

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
