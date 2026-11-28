/* 質問票 (danh sách câu hỏi gửi khách) sinh từ Bản đồ thiết kế: mỗi chỗ thiết kế chưa rõ thành một câu hỏi lịch sự,
 * kèm màn hình, vị trí file:dòng và cột trống cho khách trả lời. Nguồn: 整合性チェック, ô CRUD `?`, màn hình không có
 * 項目定義. Không AI: câu hỏi điền từ mẫu, nên nội dung luôn khớp đúng chỗ phát hiện. */
import { crudMatrix, ownerScreen, type SpecIndex, type SpecIssueCode, type SpecScreen } from './specIndex'
import { detectTextLang, type TranslateLang } from './translate'

export type QaLang = TranslateLang
export const QA_LANGS: readonly QaLang[] = ['ja', 'vi', 'en']
export type QaKind = SpecIssueCode | 'crud-unknown' | 'no-items'
/** spec: cần khách trả lời; doc: lỗi ghi chép trong tài liệu (thường tự sửa, có thể hỏi lại để chắc) */
export type QaCategory = 'spec' | 'doc'

export interface QaRow {
  no: number
  category: QaCategory
  kind: QaKind
  screenId: string
  screenName: string
  rel: string
  line: number
  heading: string
  /** Chữ để tô sáng khi mở tài liệu */
  term: string
  question: string
}

const CATEGORY: Record<QaKind, QaCategory> = {
  'dangling-transition': 'spec',
  'ambiguous-term': 'spec',
  'item-length': 'spec',
  'column-mismatch': 'spec',
  'crud-unknown': 'spec',
  'no-items': 'spec',
  'duplicate-screen': 'doc',
  'duplicate-table': 'doc',
  'unknown-column': 'doc',
}

type Templates = Record<QaKind, string> & { head: string[]; spec: string; doc: string }

/** {s}: đối tượng; {o}: nơi định nghĩa trước; {d}: chi tiết / câu gốc; {t}: bảng */
const T: Record<QaLang, Templates> = {
  ja: {
    head: ['No', '区分', '画面ID', '画面名', '該当箇所', '質問内容', '回答', '回答者', '回答日'],
    spec: '仕様確認',
    doc: '記載不備',
    'dangling-transition': '「{s}」への画面遷移が記載されていますが、遷移先の画面定義が見当たりません。遷移先の画面ID・画面設計書をご教示いただけますでしょうか。',
    'ambiguous-term': '「{d}」の「{s}」について、具体的な内容（条件・値・範囲）をご教示いただけますでしょうか。',
    'item-length': '画面項目「{s}」の桁数が DB カラムより長くなっています（{d}）。画面と DB のどちらの桁数に合わせるべきかご教示いただけますでしょうか。',
    'column-mismatch': 'カラム「{s}」の型・桁数が他のテーブルと異なります（{d}）。同一項目として扱ってよいか、正しい型・桁数をご教示いただけますでしょうか。',
    'crud-unknown': '画面「{s}」でテーブル「{t}」を使用していますが、処理内容（登録・参照・更新・削除）が読み取れません。どの操作を行うかご教示いただけますでしょうか。',
    'no-items': '画面「{s}」の項目定義（項目名・型・桁数・必須）が見当たりません。画面項目をご提示いただけますでしょうか。',
    'duplicate-screen': '画面ID「{s}」が {o} の定義と重複しています。正しい画面ID をご確認いただけますでしょうか。',
    'duplicate-table': 'テーブル「{s}」が {o} でも定義されています。どちらの定義が最新かご確認いただけますでしょうか。',
    'unknown-column': '「{s}」が記載されていますが、テーブル定義書に該当するカラムがありません。カラム名の誤記か、テーブル定義の追加漏れかご確認いただけますでしょうか。',
  },
  vi: {
    head: ['STT', 'Phân loại', 'Mã màn hình', 'Tên màn hình', 'Vị trí', 'Câu hỏi', 'Trả lời', 'Người trả lời', 'Ngày trả lời'],
    spec: 'Xác nhận đặc tả',
    doc: 'Lỗi tài liệu',
    'dangling-transition': 'Tài liệu có chuyển màn hình tới 「{s}」 nhưng chưa có định nghĩa màn hình này. Xin cho biết mã màn hình và tài liệu thiết kế của màn hình đích.',
    'ambiguous-term': 'Đoạn 「{d}」 có cách viết chưa rõ 「{s}」. Xin cho biết nội dung cụ thể (điều kiện, giá trị, phạm vi).',
    'item-length': 'Hạng mục 「{s}」 trên màn hình dài hơn cột DB ({d}). Nên theo độ dài của màn hình hay của DB?',
    'column-mismatch': 'Cột 「{s}」 có kiểu / độ dài khác với bảng khác ({d}). Đây có phải cùng một hạng mục không, và kiểu / độ dài đúng là gì?',
    'crud-unknown': 'Màn hình 「{s}」 dùng bảng 「{t}」 nhưng chưa rõ thao tác (thêm / đọc / sửa / xóa). Xin cho biết màn hình thực hiện thao tác nào.',
    'no-items': 'Màn hình 「{s}」 chưa có định nghĩa hạng mục (tên, kiểu, độ dài, bắt buộc). Xin cung cấp danh sách hạng mục của màn hình.',
    'duplicate-screen': 'Mã màn hình 「{s}」 trùng với định nghĩa ở {o}. Xin xác nhận mã màn hình đúng.',
    'duplicate-table': 'Bảng 「{s}」 cũng được định nghĩa ở {o}. Xin xác nhận bản định nghĩa nào là mới nhất.',
    'unknown-column': 'Tài liệu ghi 「{s}」 nhưng định nghĩa bảng không có cột này. Xin xác nhận tên cột bị ghi nhầm hay định nghĩa bảng còn thiếu cột.',
  },
  en: {
    head: ['No', 'Category', 'Screen ID', 'Screen name', 'Location', 'Question', 'Answer', 'Answered by', 'Answer date'],
    spec: 'Spec confirmation',
    doc: 'Document error',
    'dangling-transition': 'The document transitions to "{s}", but that screen is not defined. Could you share the screen ID and design document of the target screen?',
    'ambiguous-term': 'The wording "{s}" in "{d}" is not specific. Could you tell us the exact condition, value or range?',
    'item-length': 'Screen item "{s}" is longer than its DB column ({d}). Should we follow the screen length or the DB length?',
    'column-mismatch': 'Column "{s}" has a different type / length from another table ({d}). Is it the same item, and what is the correct type / length?',
    'crud-unknown': 'Screen "{s}" uses table "{t}", but the operation (create / read / update / delete) is unclear. Which operation does the screen perform?',
    'no-items': 'Screen "{s}" has no item definition (name, type, length, required). Could you provide the list of screen items?',
    'duplicate-screen': 'Screen ID "{s}" duplicates the definition at {o}. Could you confirm the correct screen ID?',
    'duplicate-table': 'Table "{s}" is also defined at {o}. Which definition is the latest?',
    'unknown-column': 'The document mentions "{s}", but the table definition has no such column. Is the column name a typo, or is the column missing from the table definition?',
  },
}

const fill = (s: string, p: Record<string, string>): string => s.replace(/\{(\w)\}/g, (m, k: string) => (k in p ? p[k] : m))

/** Ngôn ngữ mặc định: theo tên màn hình / bảng của tài liệu (khách Nhật đọc tiếng Nhật, khách Việt đọc tiếng Việt). */
export function qaLang(index: SpecIndex): QaLang {
  const sample = [...index.screens.map((s) => s.name), ...index.tables.map((t) => t.logicalName)].join(' ').slice(0, 4000)
  return sample.trim() ? detectTextLang(sample) : 'ja'
}

/** Câu hỏi của cả thư mục: câu cần khách trả lời trước, rồi theo file, dòng. */
export function buildQaRows(index: SpecIndex, lang: QaLang = 'ja'): QaRow[] {
  const tx = T[lang]
  const byRel = new Map<string, SpecScreen[]>()
  for (const s of index.screens) byRel.set(s.rel, [...(byRel.get(s.rel) ?? []), s])
  const screenAt = (rel: string, line: number): SpecScreen | undefined => ownerScreen(byRel.get(rel) ?? [], line)
  const label = (s: SpecScreen): string => (s.name ? `${s.id} ${s.name}` : s.id)
  const rows: Omit<QaRow, 'no'>[] = []
  const push = (kind: QaKind, rel: string, line: number, heading: string, term: string, p: Record<string, string>, sc?: SpecScreen): void => {
    rows.push({ category: CATEGORY[kind], kind, screenId: sc?.id ?? '', screenName: sc?.name ?? '', rel, line, heading, term, question: fill(tx[kind], p) })
  }

  for (const i of index.issues) {
    const sc = i.code === 'duplicate-screen' ? index.screens.find((s) => s.rel === i.rel && s.line === i.line) : screenAt(i.rel, i.line)
    const other = i.other ? `${i.other.rel}:${i.other.line}` : ''
    // item-length: subject là "画面ID 項目名" -> câu hỏi chỉ cần tên hạng mục
    const subject = i.code === 'item-length' && sc ? i.subject.replace(new RegExp(`^${sc.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`), '') : i.subject
    push(i.code, i.rel, i.line, i.heading, i.code === 'ambiguous-term' ? i.subject : subject, { s: subject, o: other, d: (i.detail ?? '').trim() }, sc)
  }

  const crud = crudMatrix(index)
  const screenById = new Map<string, SpecScreen>()
  for (const s of index.screens) if (!screenById.has(s.id)) screenById.set(s.id, s)
  for (const [id, row] of Object.entries(crud.cells)) {
    for (const [table, cell] of Object.entries(row)) {
      if (cell.ops !== '?') continue
      const sc = screenById.get(id)
      const ev = cell.evidence[0]
      if (!sc || !ev) continue
      push('crud-unknown', ev.rel, ev.line, ev.heading, ev.term, { s: label(sc), t: table }, sc)
    }
  }

  const withItems = new Set(index.itemScreens)
  for (const sc of screenById.values()) if (!withItems.has(sc.id)) push('no-items', sc.rel, sc.line, sc.heading, sc.id, { s: label(sc) }, sc)

  const order: QaCategory[] = ['spec', 'doc']
  rows.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0) || a.line - b.line)
  return rows.map((r, k) => ({ no: k + 1, ...r }))
}

/** Bảng 質問票 (hàng đầu là header) để xuất TSV / Markdown; cột trả lời để trống cho khách điền. */
export function qaTable(rows: QaRow[], lang: QaLang = 'ja'): string[][] {
  const tx = T[lang]
  return [tx.head, ...rows.map((r) => [String(r.no), tx[r.category], r.screenId, r.screenName, `${r.rel}:${r.line}`, r.question, '', '', ''])]
}

/** Nhãn phân loại để hiện trên giao diện. */
export const qaCategoryLabel = (c: QaCategory, lang: QaLang): string => T[lang][c]
