/* Độ hoàn thiện thiết kế (設計書の完成度): mỗi màn hình / mỗi bảng được chấm theo các tiêu chí đọc được từ Bản đồ
 * thiết kế, để PM / BrSE thấy ngay màn hình nào còn thiếu gì. Không AI: chỉ đếm những gì chỉ mục đã nhận ra. */
import { crudMatrix, ownerScreen, type SpecIndex, type SpecScreen } from './specIndex'

/** Một tiêu chí: true = đạt, false = chưa đạt, null = không áp dụng (vd không dùng bảng nào thì không xét CRUD). */
export type Check = boolean | null

export interface ScreenCompleteness {
  id: string
  name: string
  rel: string
  line: number
  heading: string
  /** Có bảng 項目定義 */
  items: Check
  /** Có 画面遷移 đi / đến */
  transitions: Check
  /** Nhắc tới ít nhất một bảng (biết màn hình dùng dữ liệu gì) */
  tables: Check
  /** Mọi bảng đã rõ thao tác C/R/U/D (không còn ô `?`); null nếu không dùng bảng */
  crud: Check
  /** Không còn chữ mơ hồ (TBD / 要確認 / など...) trong phần màn hình */
  noVague: Check
  /** Không còn lỗi / cảnh báo 整合性 khác trong phần màn hình (遷移 treo, 桁数 > DB, cột không có...) */
  noIssues: Check
  /** Số chữ mơ hồ / vấn đề khác (để hiện cạnh dấu ✗) */
  vague: number
  issues: number
  /** Tỉ lệ đạt trên các tiêu chí áp dụng, 0..1 */
  score: number
}

export interface TableCompleteness {
  name: string
  logical: string
  rel: string
  line: number
  /** Có khóa chính */
  pk: Check
  /** Mọi cột có 型 */
  types: Check
  /** Có màn hình nào nhắc tới (bảng không ai dùng: thừa hoặc thiếu tài liệu màn hình) */
  used: Check
  columns: number
  score: number
}

export interface Completeness {
  screens: ScreenCompleteness[]
  tables: TableCompleteness[]
  /** Trung bình score của mọi màn hình và bảng, 0..1 (0 nếu không có gì) */
  overall: number
  /** Số màn hình / bảng đạt đủ mọi tiêu chí */
  doneScreens: number
  doneTables: number
}

const scoreOf = (checks: Check[]): number => {
  const applied = checks.filter((c) => c !== null)
  return applied.length === 0 ? 1 : applied.filter(Boolean).length / applied.length
}

/** Chấm độ hoàn thiện; màn hình / bảng yếu nhất đứng đầu. */
export function completenessOf(index: SpecIndex): Completeness {
  const byRel = new Map<string, SpecScreen[]>()
  for (const s of index.screens) byRel.set(s.rel, [...(byRel.get(s.rel) ?? []), s])
  const firstById = new Map<string, SpecScreen>()
  for (const s of index.screens) if (!firstById.has(s.id)) firstById.set(s.id, s)

  // Vấn đề 整合性 thuộc màn hình nào: theo vị trí (phần của 画面ID) — chữ mơ hồ đếm riêng
  const vague = new Map<string, number>()
  const issues = new Map<string, number>()
  for (const i of index.issues) {
    const sc = ownerScreen(byRel.get(i.rel) ?? [], i.line)
    if (!sc) continue
    const m = i.code === 'ambiguous-term' ? vague : issues
    m.set(sc.id, (m.get(sc.id) ?? 0) + 1)
  }
  const inTransition = new Set(index.transitions.flatMap((t) => [t.from, t.to]))
  const crud = crudMatrix(index)
  const withItems = new Set(index.itemScreens)

  const screens: ScreenCompleteness[] = [...firstById.values()].map((s) => {
    const cells = Object.values(crud.cells[s.id] ?? {})
    const c: Omit<ScreenCompleteness, 'score'> = {
      id: s.id,
      name: s.name,
      rel: s.rel,
      line: s.line,
      heading: s.heading,
      items: withItems.has(s.id),
      transitions: inTransition.has(s.id),
      tables: cells.length > 0,
      crud: cells.length === 0 ? null : cells.every((x) => x.ops !== '?'),
      noVague: !vague.has(s.id),
      noIssues: !issues.has(s.id),
      vague: vague.get(s.id) ?? 0,
      issues: issues.get(s.id) ?? 0,
    }
    return { ...c, score: scoreOf([c.items, c.transitions, c.tables, c.crud, c.noVague, c.noIssues]) }
  })

  const usedTables = new Set(Object.values(crud.cells).flatMap((row) => Object.keys(row).map((t) => t.toUpperCase())))
  const seenT = new Set<string>()
  const tables: TableCompleteness[] = []
  for (const t of index.tables) {
    const k = t.tableName.toUpperCase()
    if (seenT.has(k)) continue
    seenT.add(k)
    const c = {
      name: t.tableName,
      logical: t.logicalName,
      rel: t.source,
      line: t.line,
      // Bảng suy từ テーブル編集仕様 không có PK / 型 để xét
      pk: t.inferred ? null : t.columns.some((col) => col.pk),
      types: t.inferred ? null : t.columns.length > 0 && t.columns.every((col) => col.type.trim() !== ''),
      // Chưa có màn hình nào trong thư mục thì không xét "được dùng"
      used: screens.length === 0 ? null : usedTables.has(k),
      columns: t.columns.length,
    }
    tables.push({ ...c, score: scoreOf([c.pk, c.types, c.used]) })
  }

  // Cùng điểm: nhiều vấn đề hơn đứng trước
  screens.sort((a, b) => a.score - b.score || b.issues + b.vague - (a.issues + a.vague) || (a.id < b.id ? -1 : 1))
  tables.sort((a, b) => a.score - b.score || (a.name < b.name ? -1 : 1))
  const all = [...screens.map((s) => s.score), ...tables.map((t) => t.score)]
  return {
    screens,
    tables,
    overall: all.length === 0 ? 0 : all.reduce((a, b) => a + b, 0) / all.length,
    doneScreens: screens.filter((s) => s.score === 1).length,
    doneTables: tables.filter((t) => t.score === 1).length,
  }
}
