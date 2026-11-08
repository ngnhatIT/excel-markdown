/* 改訂履歴 tự động từ kết quả So sánh 新旧 (specDiff): mỗi mục thay đổi một dòng nội dung sửa đổi.
 * Thuần, không gọi mạng; người dùng điền 版数 / 改訂者 rồi copy Markdown hoặc TSV (dán thẳng vào Excel). */
import { PATH_SEP, type RowChange, type SectionDiff, type SpecDiff } from './specDiff'

export type RevLang = 'ja' | 'vi' | 'en'

export interface RevisionRow {
  /** 改訂箇所: đường dẫn mục (sheet › 【mục】) */
  place: string
  /** 改訂内容 */
  content: string
}

export interface RevisionMeta {
  version: string
  date: string
  author: string
}

const L = {
  ja: {
    head: ['版数', '改訂日', '改訂者', '改訂箇所', '改訂内容'],
    whole: '（全体）',
    secAdd: '新規追加',
    secDel: '削除',
    rowAdd: (n: number, s: string) => `行追加 ${n}件${s}`,
    rowDel: (n: number, s: string) => `行削除 ${n}件${s}`,
    rowChg: (n: number, s: string) => `行変更 ${n}件${s}`,
    rowMove: (n: number) => `並び順変更 ${n}件`,
    lineAdd: (n: number) => `記述追加 ${n}件`,
    lineDel: (n: number) => `記述削除 ${n}件`,
    lineChg: (n: number) => `記述変更 ${n}件`,
    sep: '、',
    list: (xs: string[]) => `（${xs.join('、')}）`,
  },
  vi: {
    head: ['Phiên bản', 'Ngày', 'Người sửa', 'Vị trí', 'Nội dung'],
    whole: '(toàn bộ)',
    secAdd: 'Thêm mới',
    secDel: 'Xóa',
    rowAdd: (n: number, s: string) => `Thêm ${n} dòng${s}`,
    rowDel: (n: number, s: string) => `Xóa ${n} dòng${s}`,
    rowChg: (n: number, s: string) => `Sửa ${n} dòng${s}`,
    rowMove: (n: number) => `Đổi thứ tự ${n} dòng`,
    lineAdd: (n: number) => `Thêm ${n} đoạn mô tả`,
    lineDel: (n: number) => `Xóa ${n} đoạn mô tả`,
    lineChg: (n: number) => `Sửa ${n} đoạn mô tả`,
    sep: '; ',
    list: (xs: string[]) => ` (${xs.join(', ')})`,
  },
  en: {
    head: ['Version', 'Date', 'Author', 'Location', 'Changes'],
    whole: '(whole document)',
    secAdd: 'Added',
    secDel: 'Removed',
    rowAdd: (n: number, s: string) => `${n} row(s) added${s}`,
    rowDel: (n: number, s: string) => `${n} row(s) removed${s}`,
    rowChg: (n: number, s: string) => `${n} row(s) changed${s}`,
    rowMove: (n: number) => `${n} row(s) reordered`,
    lineAdd: (n: number) => `${n} description line(s) added`,
    lineDel: (n: number) => `${n} description line(s) removed`,
    lineChg: (n: number) => `${n} description line(s) changed`,
    sep: '; ',
    list: (xs: string[]) => ` (${xs.join(', ')})`,
  },
}

/** Tên dễ hiểu của một dòng bảng: ô chữ đầu tiên (bỏ ô số thứ tự), không có thì khóa dòng. */
function rowLabel(r: RowChange): string {
  const cells = r.newCells ?? r.oldCells ?? []
  const label = cells.map((c) => c.trim()).find((c) => c !== '' && !/^\d+$/.test(c)) ?? r.key.replace(/^(No|行)=?/, '')
  return label.length > 24 ? label.slice(0, 23) + '…' : label
}

/** Tối đa 3 tên, còn lại ghi "…". */
const sample = (names: string[], fmt: (xs: string[]) => string): string =>
  names.length === 0 ? '' : fmt(names.length > 3 ? [...names.slice(0, 3), '…'] : names)

function sectionContent(sec: SectionDiff, lang: RevLang): string {
  const t = L[lang]
  if (sec.kind === 'add') return t.secAdd
  if (sec.kind === 'del') return t.secDel
  const by = (k: RowChange['kind']): RowChange[] => sec.rows.filter((r) => r.kind === k)
  const parts: string[] = []
  const add = by('add')
  const del = by('del')
  const chg = by('change')
  const mov = by('move')
  if (add.length) parts.push(t.rowAdd(add.length, sample(add.map(rowLabel), t.list)))
  if (del.length) parts.push(t.rowDel(del.length, sample(del.map(rowLabel), t.list)))
  if (chg.length)
    parts.push(t.rowChg(chg.length, sample(chg.map((r) => `${rowLabel(r)}: ${[...new Set(r.cells.map((c) => c.column))].join('/')}`), t.list)))
  if (mov.length) parts.push(t.rowMove(mov.length))
  const lines = (k: 'add' | 'del' | 'change'): number => sec.lines.filter((l) => l.kind === k).length
  if (lines('add')) parts.push(t.lineAdd(lines('add')))
  if (lines('del')) parts.push(t.lineDel(lines('del')))
  if (lines('change')) parts.push(t.lineChg(lines('change')))
  return parts.join(t.sep)
}

/** Mỗi mục thay đổi một dòng 改訂履歴 (bỏ mục không còn nội dung thay đổi). */
export function revisionRows(diff: SpecDiff, lang: RevLang = 'ja'): RevisionRow[] {
  return diff.sections
    .map((sec) => ({
      place: sec.path.split(PATH_SEP).filter((p) => p.trim() !== '').join(PATH_SEP) || L[lang].whole,
      content: sectionContent(sec, lang),
    }))
    .filter((r) => r.content !== '')
}

const mdCell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
const tsvCell = (s: string): string => s.replace(/[\t\r\n]+/g, ' ')

/** Bảng 改訂履歴: 版数 / 改訂日 / 改訂者 chỉ ghi ở dòng đầu (một lần sửa đổi nhiều mục). */
export function revisionTable(rows: RevisionRow[], meta: RevisionMeta, lang: RevLang, format: 'md' | 'tsv'): string {
  const head = L[lang].head
  const body = rows.map((r, i) => [i === 0 ? meta.version : '', i === 0 ? meta.date : '', i === 0 ? meta.author : '', r.place, r.content])
  if (format === 'tsv') return [head, ...body].map((r) => r.map(tsvCell).join('\t')).join('\n')
  return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...body.map((r) => '| ' + r.map(mdCell).join(' | ') + ' |')].join('\n')
}
