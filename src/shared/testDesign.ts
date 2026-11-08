/* テスト観点表 / テスト仕様書 (khung) sinh tại chỗ từ một tài liệu 画面設計書 đã convert (không AI, không mạng).
 * Nguồn: bảng 【項目定義】 nằm trong phần có meta 画面ID (header so theo alias như tableDef.ts),
 * dòng `〔入力規則 C2:C50〕A / B` và 画面遷移 (meta + 〔矢印〕, lấy qua buildSpecIndex).
 * Mỗi quy tắc một dòng: 必須 / 桁数 (biên) / 形式 / 初期値 / 選択肢 / 表示 / ボタン / 遷移. Thuần, dùng chung. */
import { splitTableRow } from './specDiff'
import { buildSpecIndex, type SpecScreen } from './specIndex'

export type TestLang = 'ja' | 'vi' | 'en'
export const TEST_LANGS: readonly TestLang[] = ['ja', 'vi', 'en']
export const TEST_MAX_ROWS = 2000

export interface TestRow {
  no: number
  /** 大項目: màn hình (`SCR010 顧客検索画面`) hoặc heading gần nhất */
  screen: string
  /** 中項目: tên hạng mục / `入力規則 C2:C50` / `A → B` */
  item: string
  aspect: string
  steps: string
  expected: string
  /** 参照元 `file:dòng` */
  ref: string
}

export interface TestDesign {
  rows: TestRow[]
  /** Số bảng 項目定義 của màn hình nhận ra được */
  tables: number
  /** Bị cắt ở TEST_MAX_ROWS */
  truncated: boolean
}

/* ------------------------------- Chữ theo ngôn ngữ ------------------------------- */

const TEXT = {
  ja: {
    head: ['No', '大項目', '中項目', '観点', '手順', '期待結果', '参照元'],
    req: '必須チェック',
    reqEmptyS: '「{item}」を未入力のまま登録（確定）する',
    reqEmptyE: '必須エラーが表示される',
    reqFillS: '「{item}」に値を入力して登録（確定）する',
    reqFillE: 'エラーにならず正常に処理される',
    len: '桁数チェック（境界値）',
    lenS: '「{item}」に{n}文字入力する',
    lenOkE: '正常に受け付けられる',
    lenNgE: '桁数エラーとなる（または{max}文字を超えて入力できない）',
    lenZeroE: 'エラーにならない（任意項目）',
    fmt: '形式チェック（{kind}）',
    fmtS: '「{item}」に不正な形式の値（例: {ex}）を入力する',
    fmtE: '形式エラーとなる',
    kNum: '数値',
    kDate: '日付',
    kAlnum: '半角英数',
    chk: '入力チェック',
    chkS: '「{item}」に「{rule}」に反する値を入力する',
    chkE: 'エラーとなる',
    def: '初期表示',
    defS: '画面を初期表示する',
    defE: '「{item}」に初期値「{v}」が表示される',
    list: '選択肢',
    listOkS: '{item}で各選択肢（{values}）を選択する',
    listOkE: '各選択肢を選択できる',
    listNgS: '{item}に一覧外の値を入力（貼り付け）する',
    listNgE: '一覧外の値は入力できない（エラーとなる）',
    disp: '表示内容確認',
    dispS: '画面を表示する',
    dispE: '「{item}」が仕様どおり表示される',
    btn: 'ボタン押下',
    btnS: '「{item}」を押下する',
    btnE: '押下時の処理が実行される',
    btnToE: '{to} へ遷移する',
    tr: '画面遷移',
    trS: '「{label}」の操作を行う',
    trNoLabelS: '遷移操作を行う',
    trE: '{to} へ遷移する',
    note: '（備考: {note}）',
  },
  vi: {
    head: ['STT', 'Màn hình', 'Hạng mục', 'Quan điểm', 'Thao tác', 'Kết quả mong đợi', 'Nguồn'],
    req: 'Kiểm tra bắt buộc',
    reqEmptyS: 'Để trống "{item}" rồi đăng ký (xác nhận)',
    reqEmptyE: 'Hiện lỗi bắt buộc nhập',
    reqFillS: 'Nhập giá trị vào "{item}" rồi đăng ký (xác nhận)',
    reqFillE: 'Không lỗi, xử lý bình thường',
    len: 'Kiểm tra độ dài (giá trị biên)',
    lenS: 'Nhập {n} ký tự vào "{item}"',
    lenOkE: 'Được chấp nhận bình thường',
    lenNgE: 'Lỗi độ dài (hoặc không nhập được quá {max} ký tự)',
    lenZeroE: 'Không lỗi (hạng mục tùy chọn)',
    fmt: 'Kiểm tra định dạng ({kind})',
    fmtS: 'Nhập giá trị sai định dạng vào "{item}" (vd: {ex})',
    fmtE: 'Lỗi định dạng',
    kNum: 'số',
    kDate: 'ngày',
    kAlnum: 'chữ số half-width',
    chk: 'Kiểm tra nhập',
    chkS: 'Nhập vào "{item}" giá trị vi phạm "{rule}"',
    chkE: 'Báo lỗi',
    def: 'Hiển thị ban đầu',
    defS: 'Mở màn hình lần đầu',
    defE: '"{item}" hiện giá trị ban đầu "{v}"',
    list: 'Lựa chọn',
    listOkS: 'Chọn lần lượt từng lựa chọn ({values}) ở {item}',
    listOkE: 'Chọn được mọi lựa chọn',
    listNgS: 'Nhập (dán) giá trị ngoài danh sách vào {item}',
    listNgE: 'Không nhập được giá trị ngoài danh sách (báo lỗi)',
    disp: 'Kiểm tra hiển thị',
    dispS: 'Mở màn hình',
    dispE: '"{item}" hiển thị đúng đặc tả',
    btn: 'Bấm nút',
    btnS: 'Bấm "{item}"',
    btnE: 'Thực hiện xử lý khi bấm',
    btnToE: 'Chuyển sang {to}',
    tr: 'Chuyển màn hình',
    trS: 'Thao tác "{label}"',
    trNoLabelS: 'Thực hiện thao tác chuyển màn hình',
    trE: 'Chuyển sang {to}',
    note: ' (Ghi chú: {note})',
  },
  en: {
    head: ['No', 'Screen', 'Item', 'Viewpoint', 'Steps', 'Expected result', 'Source'],
    req: 'Required check',
    reqEmptyS: 'Leave "{item}" empty and submit',
    reqEmptyE: 'A required-field error is shown',
    reqFillS: 'Enter a value in "{item}" and submit',
    reqFillE: 'Processed normally without error',
    len: 'Length check (boundary)',
    lenS: 'Enter {n} characters in "{item}"',
    lenOkE: 'Accepted',
    lenNgE: 'Length error (or input is limited to {max} characters)',
    lenZeroE: 'No error (optional item)',
    fmt: 'Format check ({kind})',
    fmtS: 'Enter an invalid value in "{item}" (e.g. {ex})',
    fmtE: 'Format error',
    kNum: 'numeric',
    kDate: 'date',
    kAlnum: 'half-width alphanumeric',
    chk: 'Input check',
    chkS: 'Enter a value in "{item}" that violates "{rule}"',
    chkE: 'An error is shown',
    def: 'Initial display',
    defS: 'Open the screen',
    defE: '"{item}" shows the initial value "{v}"',
    list: 'Choices',
    listOkS: 'Select each choice ({values}) in {item}',
    listOkE: 'Every choice can be selected',
    listNgS: 'Enter (paste) a value not in the list into {item}',
    listNgE: 'Values outside the list are rejected',
    disp: 'Display check',
    dispS: 'Open the screen',
    dispE: '"{item}" is displayed as specified',
    btn: 'Button press',
    btnS: 'Press "{item}"',
    btnE: 'The button action is performed',
    btnToE: 'Navigates to {to}',
    tr: 'Screen transition',
    trS: 'Perform "{label}"',
    trNoLabelS: 'Perform the transition operation',
    trE: 'Navigates to {to}',
    note: ' (Note: {note})',
  },
} satisfies Record<TestLang, Record<string, string | string[]>>

/* ---------------------------------- Nhận diện ---------------------------------- */

const normLabel = (s: string): string =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[\s*_`]/g, '')

type Field = 'item' | 'required' | 'length' | 'type' | 'kind' | 'default' | 'note' | 'check'
const ALIASES: Record<Field, string[]> = {
  item: ['項目名', '項目', '項目名称', 'item', 'itemname', 'tênhạngmục', 'hạngmục'],
  required: ['必須', '必須区分', 'required', 'bắtbuộc'],
  length: ['桁数', '桁', '長さ', '最大桁数', 'length', 'maxlength', 'độdài'],
  type: ['型', 'データ型', '属性', 'type', 'datatype', 'kiểu'],
  kind: ['区分', '入出力', '項目区分', 'i/o', 'io', 'loại'],
  default: ['初期値', '初期表示', 'default', 'defaultvalue', 'giátrịmặcđịnh', 'giátrịbanđầu'],
  note: ['備考', 'note', 'notes', 'remarks', 'ghichú'],
  check: ['入力チェック', 'チェック', 'チェック内容', 'validation', 'kiểmtra'],
}
const FIELD_OF = new Map<string, Field>(Object.entries(ALIASES).flatMap(([f, list]) => list.map((a) => [a, f as Field])))

/** Ô bảng → chữ thuần: bỏ `<br>`, link, `**`, `` ` ``. Ký tự escape (`\]`, `` \` ``) tạm đổi sang vùng riêng (U+E000+)
 * để regex định dạng không bắt nhầm, rồi trả lại chữ gốc. */
const plain = (s: string | undefined): string =>
  (s ?? '')
    .replace(/\\([\\`*_{}[\]()#+\-.!<>~&|])/g, (_, c: string) => String.fromCharCode(0xe000 + c.charCodeAt(0)))
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[\ue000-\ue07f]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000))
    .replace(/\s+/g, ' ')
    .trim()

const YES = new Set(['○', '◯', '●', '〇', '◎', '✓', '✔', 'y', 'yes', 'true', '1', '必須', 'required', 'có', 'bắtbuộc', '要'])
const isYes = (v: string): boolean => YES.has(v.normalize('NFKC').toLowerCase().replace(/[\s*_]/g, ''))
const isBlank = (v: string): boolean => /^(?:[-－ー―‐]|n\/a|なし|無し|null|<null>|空白|空欄)?$/i.test(v.normalize('NFKC').trim())
const isOutput = (kind: string): boolean => /出力|表示|output|display|label|ラベル|hiểnthị|hiển thị/i.test(kind)
const isButton = (item: string, kind: string): boolean => /ボタン|button|nút/i.test(kind) || /ボタン|button|^nút|\bbtn\b/i.test(item)

const DELIM_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-*:?\s*)*\|?\s*$/
const LIST_RE = /〔入力規則\s*([^〕]*)〕\s*(.+)$/

const fill = (s: string, p: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m))
const norm = (s: string): string => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()

interface Draft extends Omit<TestRow, 'no' | 'ref'> {
  line: number
}

/** Sinh khung テスト観点表 từ một tài liệu. Không ném với Markdown bất kỳ. */
export function buildTestDesign(md: string, opts: { source?: string; lang?: TestLang } = {}): TestDesign {
  const source = opts.source ?? ''
  const tx = TEXT[opts.lang ?? 'ja']
  const lines = md.split(/\r?\n/)
  const index = buildSpecIndex([{ rel: source, text: md }])
  const labelOf = new Map(index.nodes.map((n) => [n.key, n.label]))
  const screenLabel = (s: SpecScreen): string => (s.name ? `${s.id} ${s.name}` : s.id)
  const screenAt = (line: number): SpecScreen | undefined => index.screens.find((s) => s.line <= line && line <= s.end)
  const drafts: Draft[] = []
  const push = (line: number, screen: string, item: string, aspect: string, steps: string, expected: string): void => {
    drafts.push({ line, screen, item, aspect, steps, expected })
  }
  let tables = 0
  let heading = ''
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
    const h = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) heading = plain(h[1]).replace(/[【】]/g, '')
    const list = LIST_RE.exec(plain(line))
    if (list) {
      const sc = screenAt(i + 1)
      const values = list[2].split(/\s+\/\s+/).map((v) => v.trim()).filter(Boolean)
      const target = `入力規則 ${list[1].trim()}`.trim()
      if (values.length > 0) {
        push(i + 1, sc ? screenLabel(sc) : heading, target, tx.list, fill(tx.listOkS, { item: target, values: values.join(', ') }), tx.listOkE)
        push(i + 1, sc ? screenLabel(sc) : heading, target, tx.list, fill(tx.listNgS, { item: target }), tx.listNgE)
      }
      continue
    }
    if (!line.trimStart().startsWith('|') || !DELIM_RE.test(lines[i + 1] ?? '') || !(lines[i + 1] ?? '').includes('-')) continue
    const cols = new Map<Field, number>()
    splitTableRow(line).forEach((c, idx) => {
      const field = FIELD_OF.get(normLabel(plain(c)))
      if (field && !cols.has(field)) cols.set(field, idx)
    })
    const start = i
    i += 2
    const rows: { cells: string[]; line: number }[] = []
    while (i < lines.length && lines[i].trimStart().startsWith('|')) rows.push({ cells: splitTableRow(lines[i]), line: ++i })
    i--
    const sc = screenAt(start + 1)
    // Chỉ bảng 項目定義 của màn hình: bảng テーブル定義 (không có 画面ID) hay bảng lạ thì bỏ
    if (!sc || !cols.has('item') || cols.size < 2) continue
    tables++
    const scLabel = screenLabel(sc)
    const outs = index.transitions.filter((t) => t.from === sc.id || (t.bidi && t.to === sc.id))
    for (const { cells, line: n } of rows) {
      const get = (fl: Field): string => {
        const idx = cols.get(fl)
        return idx === undefined ? '' : plain(cells[idx])
      }
      const item = get('item')
      if (!item || isBlank(item)) continue
      const [kind, note, check, type, def] = [get('kind'), get('note'), get('check'), get('type'), get('default')]
      const add = (aspect: string, s: string, e: string): void => push(n, scLabel, item, aspect, fill(s, { item }), e)
      if (isButton(item, kind)) {
        const base = norm(item.replace(/ボタン|button|^nút\s*/gi, ''))
        const hit = outs.find((t) => {
          const lbl = norm(t.label)
          const to = norm(labelOf.get(t.to === sc.id ? t.from : t.to) ?? '')
          return (base && lbl && (lbl.includes(base) || base.includes(lbl))) || (note && to && norm(note).includes(to.replace(/^\?/, '')))
        })
        const to = hit ? (labelOf.get(hit.to === sc.id ? hit.from : hit.to) ?? '') : ''
        add(tx.btn, tx.btnS, to ? fill(tx.btnToE, { to }) : note ? note : tx.btnE)
        continue
      }
      if (isOutput(kind)) {
        add(tx.disp, tx.dispS, fill(tx.dispE, { item }) + (note ? fill(tx.note, { note }) : ''))
        if (!isBlank(def)) add(tx.def, tx.defS, fill(tx.defE, { item, v: def }))
        continue
      }
      const reqCell = get('required')
      const required = cols.has('required') ? isYes(reqCell) : /(?<!非|不)必須|required|bắt buộc/i.test(`${note} ${check}`) && !/任意/.test(note)
      if (required) {
        add(tx.req, tx.reqEmptyS, tx.reqEmptyE)
        add(tx.req, tx.reqFillS, tx.reqFillE)
      }
      const lenM = /^\d+/.exec(get('length').normalize('NFKC'))
      const max = lenM ? Number(lenM[0]) : 0
      if (max > 0 && max <= 100_000) {
        push(n, scLabel, item, tx.len, fill(tx.lenS, { item, n: max }), tx.lenOkE)
        push(n, scLabel, item, tx.len, fill(tx.lenS, { item, n: max + 1 }), fill(tx.lenNgE, { max }))
        if (!required) push(n, scLabel, item, tx.len, fill(tx.lenS, { item, n: 0 }), tx.lenZeroE)
      }
      const fmtText = `${type} ${note} ${check}`.normalize('NFKC')
      const fmt = /数値|数字|整数|number|numeric|decimal|\bint/i.test(fmtText)
        ? { kind: tx.kNum, ex: 'abc' }
        : /日付|日時|date|ngày/i.test(fmtText)
          ? { kind: tx.kDate, ex: '2026/13/45' }
          : /半角英数|英数字?|alphanumeric|alnum/i.test(fmtText)
            ? { kind: tx.kAlnum, ex: 'あいう' }
            : null
      if (fmt) add(fill(tx.fmt, { kind: fmt.kind }), fill(tx.fmtS, { item, ex: fmt.ex }), tx.fmtE)
      if (check && !isBlank(check)) add(tx.chk, fill(tx.chkS, { item, rule: check }), tx.chkE)
      if (!isBlank(def)) add(tx.def, tx.defS, fill(tx.defE, { item, v: def }))
    }
  }

  for (const t of index.transitions) {
    const from = labelOf.get(t.from) ?? t.from
    const to = labelOf.get(t.to) ?? t.to
    // `↔`（行ダブルクリック／戻る）: nhãn trước cho chiều đi, nhãn sau cho chiều về
    const [goLabel, backLabel] = t.bidi ? t.label.split(/[／/]/).map((s) => s.trim()) : [t.label, '']
    const one = (a: string, b: string, label: string | undefined): void =>
      push(t.line, a, `${a} → ${b}`, tx.tr, label ? fill(tx.trS, { label }) : tx.trNoLabelS, fill(tx.trE, { to: b }))
    one(from, to, goLabel)
    if (t.bidi) one(to, from, backLabel)
  }

  drafts.sort((a, b) => a.line - b.line)
  const rows = drafts.slice(0, TEST_MAX_ROWS).map(({ line, ...d }, k) => ({ no: k + 1, ...d, ref: `${source}:${line}` }))
  return { rows, tables, truncated: drafts.length > TEST_MAX_ROWS }
}

/* ---------------------------------- Xuất ---------------------------------- */

/** Tên 7 cột theo ngôn ngữ (No | 大項目 | 中項目 | 観点 | 手順 | 期待結果 | 参照元). */
export const testDesignHeader = (lang: TestLang = 'ja'): string[] => TEXT[lang].head

const cells = (r: TestRow): string[] => [String(r.no), r.screen, r.item, r.aspect, r.steps, r.expected, r.ref]

/** TSV để dán vào Excel: tab / xuống dòng trong ô thành khoảng trắng. */
export function testDesignTsv(d: TestDesign, lang: TestLang = 'ja'): string {
  const clean = (s: string): string => s.replace(/[\t\r\n]+/g, ' ')
  return [TEXT[lang].head, ...d.rows.map(cells)].map((r) => r.map(clean).join('\t')).join('\n') + '\n'
}

/** Markdown `## テスト仕様書` + bảng (mở ở chế độ Markdown → Excel để ra .xlsx). */
export function testDesignMarkdown(d: TestDesign, lang: TestLang = 'ja', title = ''): string {
  const esc = (s: string): string => s.replace(/[\\|`*_[\]<>&]/g, '\\$&').replace(/\r?\n/g, '<br>')
  const head = TEXT[lang].head
  return [
    ...(title ? [`# ${esc(title)}`, ''] : []),
    '## テスト仕様書',
    '',
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...d.rows.map((r) => `| ${cells(r).map(esc).join(' | ')} |`),
    '',
  ].join('\n')
}
