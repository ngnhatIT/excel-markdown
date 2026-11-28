/* 整合性チェック trên chỉ mục đã dựng: cách viết mơ hồ, 桁数 của hạng mục màn hình so với cột DB. */
import { isDelimRow } from './mdLines'
import { normRule } from './projectConfig'
import { splitTableRow } from './specDiff'
import { AMBIGUOUS_RE, MAX_AMBIGUOUS, MAX_LINE, charLength, isItemHeader, itemColumns, ownerScreen, plain, snippetOf, typeSig, type DocInfo, type SpecDoc, type SpecIssue, type SpecScreen } from './specCore'
import type { ProjectRules } from './projectConfig'
import type { TableColumn, TableDef } from './tableDef'

/** Cách viết mơ hồ (など / 適宜 / TBD / 未定...) trong tài liệu 画面 / テーブル: một cảnh báo mỗi dòng. */
export function ambiguousIssues(docs: SpecDoc[], infos: Map<string, DocInfo>, screens: SpecScreen[], tables: TableDef[], extraAmbiguous: string[], issues: SpecIssue[]): void {
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
}

/** Hạng mục nhập của màn hình (bảng 項目定義) dài hơn cột chữ cùng 論理名 trong テーブル定義: nhập đủ 桁数 thì lỗi / bị cắt
 * khi lưu. Chỉ báo khi dài hơn MỌI cột cùng tên (tên logic thuộc nhiều bảng); màn hình ngắn hơn DB là bình thường.
 * Trả về 画面ID có bảng 項目定義. */
export function itemLengthIssues(docs: SpecDoc[], infos: Map<string, DocInfo>, screens: SpecScreen[], tables: Iterable<TableDef>, defLines: Map<string, Set<number>>, issues: SpecIssue[], rules?: ProjectRules): string[] {
  const charCols = new Map<string, { t: TableDef; c: TableColumn; len: number }[]>()
  for (const t of tables) {
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
      const cols = itemColumns(splitTableRow(L[i]), rules?.itemColumns)
      const owner = ownerScreen(own, i + 1)
      if (owner && isItemHeader(cols)) itemScreens.add(owner.id)
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
  return [...itemScreens]
}
