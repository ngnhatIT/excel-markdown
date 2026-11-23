/* Mock màn hình sinh từ 画面設計書 (không AI, không mạng): mỗi 画面ID thành một form HTML theo bảng 【項目定義】
 * (区分 / 型 / 桁数 / 必須 / 初期値 / 備考), danh sách thả xuống từ dòng 〔入力規則〕, nút và link 画面遷移 sang màn hình
 * khác. Trang xuất ra là một file HTML tĩnh, không JavaScript: chuyển màn hình bằng #anchor + CSS :target.
 * Mọi chữ lấy từ tài liệu đều được escape. Dùng chung renderer (xem trước) và CLI. */
import MOCK_CSS from './mockScreen.css?raw'
import { atxHeading, fenceAfter, isDelimRow, normLabel } from './mdLines'
import { splitTableRow } from './specDiff'
import { buildSpecIndex, ITEM_FIELD_OF, type ItemField, type SpecDoc, type SpecScreen } from './specIndex'
import { cellText, isBlank, isButton, isOutput, isYes, LIST_RE } from './testDesign'
import { detectTextLang } from './translate'

export type MockControl = 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'output' | 'button'

export interface MockItem {
  label: string
  control: MockControl
  /** type của <input> khi control = text */
  inputType: 'text' | 'number' | 'date' | 'datetime-local' | 'password' | 'email' | 'tel'
  required: boolean
  /** 桁数 (0 = không rõ) */
  maxLength: number
  value: string
  note: string
  options: string[]
  /** Nút có 画面遷移 khớp nhãn: chỉ số màn hình đích trong danh sách mock, -1 nếu không */
  goto: number
}

export interface MockTransition {
  label: string
  /** Chỉ số màn hình đích, -1 = màn hình chưa định nghĩa */
  to: number
  toLabel: string
}

export interface MockScreen {
  id: string
  name: string
  rel: string
  line: number
  items: MockItem[]
  transitions: MockTransition[]
}

/** Tối đa màn hình / hạng mục (đầu vào không tin cậy) */
export const MOCK_MAX_SCREENS = 300
const MOCK_MAX_ITEMS = 200

/** Chữ trên mock theo ngôn ngữ của tài liệu (mock để khách đọc, không theo ngôn ngữ giao diện app). */
export type MockLang = 'ja' | 'vi' | 'en'
const TEXT: Record<MockLang, Record<'req' | 'trans' | 'none' | 'output' | 'select' | 'choice' | 'src' | 'notice' | 'undef' | 'digits' | 'screens', string>> = {
  ja: {
    req: '必須',
    trans: '遷移',
    none: '項目定義がありません（【項目定義】の表に 項目名 と 区分 / 型 / 桁数 の列が必要です）',
    output: '（表示）',
    select: '（選択）',
    choice: '（選択肢）',
    src: '出典',
    notice: '※ 設計書から自動生成した画面モックです（入力チェック・処理は動作しません）',
    undef: '未定義の画面',
    digits: '{n}桁',
    screens: '画面一覧',
  },
  vi: {
    req: 'Bắt buộc',
    trans: 'Chuyển tới',
    none: 'Chưa có bảng hạng mục (cần cột Hạng mục và Loại / Kiểu / Độ dài)',
    output: '(hiển thị)',
    select: '(chọn)',
    choice: '(lựa chọn)',
    src: 'Nguồn',
    notice: '※ Mock tự sinh từ tài liệu thiết kế (không kiểm tra nhập, không xử lý)',
    undef: 'Màn hình chưa định nghĩa',
    digits: 'tối đa {n} ký tự',
    screens: 'Danh sách màn hình',
  },
  en: {
    req: 'Required',
    trans: 'Go to',
    none: 'No item table (needs an Item column plus Kind / Type / Length)',
    output: '(display)',
    select: '(select)',
    choice: '(option)',
    src: 'Source',
    notice: '※ Mock generated from the design document (no input checks, no processing)',
    undef: 'Undefined screen',
    digits: 'max {n} chars',
    screens: 'Screens',
  },
}

/** Ngôn ngữ của mock: chữ trong tên màn hình + tên hạng mục (Nhật / Việt / Anh). */
export function mockLang(screens: MockScreen[]): MockLang {
  const sample = screens
    .flatMap((s) => [s.name, ...s.items.map((i) => i.label)])
    .join(' ')
    .slice(0, 4000)
  return sample.trim() ? detectTextLang(sample) : 'ja'
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const norm = (s: string): string => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()

/** Loại ô theo 区分 / 型 (và tên hạng mục cho điện thoại / mật khẩu / email). Nhận từ khóa Nhật, Anh, Việt. */
function classify(label: string, kind: string, type: string, maxLength: number): Pick<MockItem, 'control' | 'inputType'> {
  const kt = `${kind} ${type}`.normalize('NFC').toLowerCase()
  const all = `${kt} ${label}`.normalize('NFC').toLowerCase()
  // Radio / checkbox trước nút bấm: ラジオボタン, "Nút chọn" có chữ ボタン / nút nhưng không phải nút bấm
  // 型 = チェック (không phải チェック内容...) cũng là checkbox; I/O = O là ô hiển thị
  if (/チェックボックス|checkbox|hộp kiểm|ô đánh dấu/.test(kt) || /^チェック$/.test(type.trim())) return { control: 'checkbox', inputType: 'text' }
  if (/ラジオ|radio|nút chọn/.test(kt)) return { control: 'radio', inputType: 'text' }
  if (isButton(label, kt)) return { control: 'button', inputType: 'text' }
  if (isOutput(kt) || /^o$/i.test(kind.normalize('NFKC').trim())) return { control: 'output', inputType: 'text' }
  if (/選択|プルダウン|リスト|コンボ|ドロップダウン|select|dropdown|combo|list|chọn|danh sách|thả xuống/.test(kt)) return { control: 'select', inputType: 'text' }
  if (/テキストエリア|textarea|複数行|nhiều dòng|văn bản dài/.test(kt) || maxLength >= 200) return { control: 'textarea', inputType: 'text' }
  const t = type.normalize('NFKC').toLowerCase()
  // Thứ tự có ý nghĩa: "Số điện thoại" là điện thoại, không phải số; "Ngày giờ" trước "Ngày"
  const inputType = /日時|datetime|timestamp|ngày giờ|thời gian/.test(t)
    ? 'datetime-local'
    : /日付|年月日|date|ngày/.test(t)
      ? 'date'
      : /電話|tel|điện thoại|sđt/.test(all)
        ? 'tel'
        : /パスワード|password|mật khẩu/.test(all)
          ? 'password'
          : /メール|mail|thư điện tử/.test(all)
            ? 'email'
            : /数値|数字|整数|金額|number|numeric|decimal|int|(?:^|\s)số(?:\s|$)|số nguyên|số tiền|tiền/.test(t)
              ? 'number'
              : 'text'
  return { control: 'text', inputType }
}

/** Lựa chọn viết thẳng trong 備考 / Ghi chú: `Hà Nội / TP.HCM / Đà Nẵng` (ít nhất 2 mục ngắn). */
function inlineOptions(note: string): string[] {
  const parts = note.split(/\s+\/\s+/).map((p) => p.trim())
  return parts.length >= 2 && parts.every((p) => p && p.length <= 40) ? parts : []
}

/** Màn hình mock của các tài liệu (thứ tự như chỉ mục; 画面ID trùng thì lấy định nghĩa đầu). */
export function buildMockScreens(docs: SpecDoc[]): MockScreen[] {
  const index = buildSpecIndex(docs)
  const seen = new Set<string>()
  const defs: SpecScreen[] = []
  for (const s of index.screens) {
    const k = s.id.toUpperCase()
    if (seen.has(k) || defs.length >= MOCK_MAX_SCREENS) continue
    seen.add(k)
    defs.push(s)
  }
  const pos = new Map(defs.map((s, i) => [s.id, i]))
  const labelOf = new Map(index.nodes.map((n) => [n.key, n.label]))
  const text = new Map(docs.map((d) => [d.rel, d.text.split(/\r?\n/)]))

  return defs.map((s) => {
    const lines = text.get(s.rel) ?? []
    const items: MockItem[] = []
    const lists: string[][] = []
    // 画面ID lặp ở từng phần (レイアウト / 項目定義 / イベント...) của cùng file: đọc mọi phần, mỗi phần một lần
    const ranges = new Map<number, number>()
    for (const x of index.screens) if (x.rel === s.rel && x.id.toUpperCase() === s.id.toUpperCase() && !ranges.has(x.end)) ranges.set(x.end, x.line)
    for (const [end, start] of ranges) {
      let fence = ''
      /** Cột của header 項目定義 gần nhất: bảng sau heading nhóm (### 【ヘッダー情報】) mất header, dòng đầu là dữ liệu */
      let carry: Map<ItemField, number> | null = null
      let carryWidth = 0
      let afterHeading = false
      for (let i = start; i < end && i < lines.length; i++) {
        const line = lines[i]
        const nf = fenceAfter(fence, line)
        if (nf !== undefined) {
          fence = nf
          continue
        }
        if (fence) continue
        if (atxHeading(line)) {
          afterHeading = true
          continue
        }
        if (line.trim() && !line.trimStart().startsWith('|')) afterHeading = false
        const list = LIST_RE.exec(cellText(line))
        if (list) {
          const values = list[2].split(/\s+\/\s+/).map((v) => v.trim()).filter(Boolean)
          if (values.length > 0) lists.push(values)
          continue
        }
        if (!line.trimStart().startsWith('|') || !isDelimRow(lines[i + 1] ?? '')) continue
        let cols = new Map<ItemField, number>()
        splitTableRow(line).forEach((c, k) => {
          const f = ITEM_FIELD_OF.get(normLabel(cellText(c)))
          if (f && !cols.has(f)) cols.set(f, k)
        })
        const width = splitTableRow(line).length
        const isHeader = cols.has('item') && (cols.has('kind') || cols.has('type') || cols.has('length') || cols.has('required'))
        // carry chỉ cho bảng ngay sau heading nhóm, cùng số cột với header; bảng khác (イベント...) xóa carry
        if (isHeader) {
          carry = cols
          carryWidth = width
        } else if (carry && !cols.has('item') && afterHeading && width === carryWidth) cols = carry
        else carry = null
        afterHeading = false
        const isItems = isHeader || (carry !== null && cols === carry)
        i += isHeader || !isItems ? 2 : 0
        for (; i < lines.length && lines[i].trimStart().startsWith('|'); i++) {
          if (!isItems || items.length >= MOCK_MAX_ITEMS || isDelimRow(lines[i])) continue
          const cells = splitTableRow(lines[i])
          const get = (f: ItemField): string => {
            const k = cols.get(f)
            return k === undefined ? '' : cellText(cells[k])
          }
          const label = get('item')
          // Dòng tiêu đề nhóm trong bảng (【テーブル情報】) không phải hạng mục
          if (!label || isBlank(label) || /^【[^】]*】$/.test(label)) continue
          const maxLength = Math.min(Number(/^\d+/.exec(get('length').normalize('NFKC'))?.[0] ?? 0), 100_000)
          const def = get('default')
          items.push({
            label,
            ...classify(label, get('kind'), get('type'), maxLength),
            // Không có cột 必須 thì đọc từ 備考 / チェック (「必須」, không tính 非必須 / 不要)
            required: cols.has('required') ? isYes(get('required')) : /(?<![非不])必須|required/i.test(`${get('note')} ${get('check')}`),
            maxLength,
            value: isBlank(def) ? '' : def,
            note: [get('check'), get('note')].filter((v) => v && !isBlank(v)).join(' / '),
            options: [],
            goto: -1,
          })
        }
        i--
      }
    }
    // Lựa chọn: ưu tiên ghi thẳng ở 備考 / Ghi chú của chính hạng mục; còn lại lấy 〔入力規則〕 của màn hình theo thứ tự
    let li = 0
    for (const it of items) {
      if (it.control !== 'select' && it.control !== 'radio') continue
      const own = inlineOptions(it.note)
      if (own.length > 0) {
        it.options = own
        it.note = ''
      } else if (li < lists.length) it.options = lists[li++]
    }

    const outs = index.transitions.filter((t) => t.from === s.id || (t.bidi && t.to === s.id))
    const transitions: MockTransition[] = []
    const seenT = new Set<string>()
    for (const t of outs) {
      const target = t.from === s.id ? t.to : t.from
      // Chiều về của `↔`（往路／復路）: nhãn sau dấu ／
      const label = t.bidi && t.to === s.id ? (t.label.split(/[／/]/)[1] ?? '').trim() : t.bidi ? (t.label.split(/[／/]/)[0] ?? '').trim() : t.label
      const k = `${target}|${label}`
      if (seenT.has(k) || target === s.id) continue
      seenT.add(k)
      transitions.push({ label, to: pos.get(target) ?? -1, toLabel: labelOf.get(target) ?? target.replace(/^\?/, '') })
    }
    // Cùng màn hình đích: bỏ bản không nhãn khi đã có bản có nhãn (meta 画面遷移 + 〔矢印〕 cùng nói một đường đi)
    const labeled = new Set(transitions.filter((t) => t.label).map((t) => t.toLabel))
    const deduped = transitions.filter((t) => t.label || !labeled.has(t.toLabel))
    // Nút có nhãn khớp 画面遷移 (vd 「詳細」ボタン ↔ 遷移「詳細」) -> bấm được sang màn hình đó
    for (const it of items) {
      if (it.control !== 'button') continue
      const base = norm(it.label.replace(/ボタン|button/gi, ''))
      const hit = deduped.find((t) => t.to >= 0 && base && t.label && (norm(t.label).includes(base) || base.includes(norm(t.label))))
      if (hit) it.goto = hit.to
    }
    return { id: s.id, name: s.name, rel: s.rel, line: s.line, items, transitions: deduped }
  })
}

const anchor = (i: number): string => `scr-${i}`

function fieldHtml(it: MockItem, sid: number, n: number, tx: (typeof TEXT)[MockLang]): string {
  const id = `m${sid}-${n}`
  const req = it.required ? ` <span class="x2m-mock-req">${tx.req}</span>` : ''
  const hint = [it.maxLength > 0 && it.control !== 'output' ? tx.digits.replace('{n}', String(it.maxLength)) : '', it.note].filter(Boolean).join(' / ')
  const hintHtml = hint ? `<span class="x2m-mock-hint">${esc(hint)}</span>` : ''
  // size theo 桁数: ô nhập dài đúng tỉ lệ (thuộc tính HTML, không cần style inline bị CSP của app chặn)
  const size = it.maxLength > 0 && it.inputType === 'text' ? ` size="${Math.min(Math.max(it.maxLength, 4) + 2, 60)}"` : ''
  const attrs = `${it.required ? ' required' : ''}${it.maxLength > 0 ? ` maxlength="${it.maxLength}"` : ''}${size}`
  let control: string
  switch (it.control) {
    case 'output':
      return `<div class="x2m-mock-field"><span class="x2m-mock-label">${esc(it.label)}</span><div class="x2m-mock-out">${esc(it.value || tx.output)}</div>${hintHtml}</div>`
    case 'select':
      control = `<select id="${id}"${it.required ? ' required' : ''}><option value="">${tx.select}</option>${it.options.map((o) => `<option${o === it.value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
      break
    case 'radio': {
      const opts = it.options.length > 0 ? it.options : [tx.choice]
      control = `<div class="x2m-mock-choice" role="radiogroup" aria-labelledby="${id}-l">${opts.map((o) => `<label><input type="radio" name="${id}"${o === it.value ? ' checked' : ''}> ${esc(o)}</label>`).join('')}</div>`
      return `<div class="x2m-mock-field"><span class="x2m-mock-label" id="${id}-l">${esc(it.label)}${req}</span>${control}${hintHtml}</div>`
    }
    case 'checkbox':
      control = `<div class="x2m-mock-choice"><label><input type="checkbox" id="${id}"${it.value ? ' checked' : ''}> ${esc(it.label)}</label></div>`
      break
    case 'textarea':
      control = `<textarea id="${id}"${attrs}>${esc(it.value)}</textarea>`
      break
    default:
      control = `<input id="${id}" type="${it.inputType}"${attrs}${it.value ? ` value="${esc(it.value)}"` : ''}>`
  }
  return `<div class="x2m-mock-field"><label for="${id}">${esc(it.label)}${req}</label>${control}${hintHtml}</div>`
}

const buttonHtml = (it: MockItem): string =>
  it.goto >= 0
    ? `<a class="x2m-mock-btn" href="#${anchor(it.goto)}" data-goto="${it.goto}">${esc(it.label)}</a>`
    : `<button type="button" class="x2m-mock-btn">${esc(it.label)}</button>`

/** HTML của một màn hình (phần <section>), dùng trong trang xuất ra và bản xem trong app. */
export function mockScreenHtml(s: MockScreen, i: number, lang: MockLang = 'ja'): string {
  const tx = TEXT[lang]
  const fields = s.items.filter((it) => it.control !== 'button')
  const buttons = s.items.filter((it) => it.control === 'button')
  const body =
    s.items.length === 0
      ? `<p class="x2m-mock-empty">${tx.none}</p>`
      : fields.map((it, n) => fieldHtml(it, i, n, tx)).join('') + (buttons.length > 0 ? `<div class="x2m-mock-actions">${buttons.map(buttonHtml).join('')}</div>` : '')
  const trans =
    s.transitions.length > 0
      ? `<nav class="x2m-mock-trans" aria-label="${tx.trans}"><span>${tx.trans}:</span>${s.transitions
          .map((t) => {
            const text = esc(t.toLabel + (t.label ? `（${t.label}）` : ''))
            return t.to >= 0 ? `<a class="x2m-mock-btn" href="#${anchor(t.to)}" data-goto="${t.to}">${text}</a>` : `<span class="x2m-mock-btn" aria-disabled="true" title="${tx.undef}">${text}</span>`
          })
          .join('')}</nav>`
      : ''
  return (
    `<section class="x2m-mock-screen" id="${anchor(i)}"><header class="x2m-mock-head"><span class="x2m-mock-id">${esc(s.id)}</span><h2>${esc(s.name || s.id)}</h2></header>` +
    `<div class="x2m-mock-body">${body}</div>${trans}<p class="x2m-mock-src">${tx.src}: ${esc(s.rel)}:${s.line}</p></section>`
  )
}

/** Trang HTML đứng riêng (gửi khách / mở bằng trình duyệt): danh sách màn hình bên trái, chuyển màn hình bằng #anchor. */
export function mockPageHtml(screens: MockScreen[], title: string): string {
  const lang = mockLang(screens)
  const tx = TEXT[lang]
  const nav = screens.map((s, i) => `<a href="#${anchor(i)}">${esc(s.id)} ${esc(s.name)}</a>`).join('')
  const page = `body{margin:0;background:#e9edf1}.x2m-mock-page{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:100vh}
.x2m-mock-nav{background:#1f3350;color:#fff;padding:16px 10px;display:flex;flex-direction:column;gap:2px}
.x2m-mock-nav h1{font-size:14px;margin:0 6px 4px}.x2m-mock-nav p{font-size:11px;opacity:.75;margin:0 6px 12px}
.x2m-mock-nav nav{display:flex;flex-direction:column;gap:2px}.x2m-mock-nav a{color:#dbe6f5;text-decoration:none;padding:5px 8px;border-radius:3px;font-size:13px}.x2m-mock-nav a:hover{background:rgba(255,255,255,.12)}
.x2m-mock-screens{padding:24px;max-width:1000px}.x2m-mock-screen{display:none}.x2m-mock-screen:target{display:block}
.x2m-mock-screens:not(:has(.x2m-mock-screen:target)) .x2m-mock-screen:first-child{display:block}
@media (max-width:720px){.x2m-mock-page{grid-template-columns:1fr}.x2m-mock-field{grid-template-columns:1fr}.x2m-mock-hint{grid-column:1}}`
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${esc(title)}</title><style>${MOCK_CSS}\n${page}</style></head>
<body class="x2m-mock"><div class="x2m-mock-page"><aside class="x2m-mock-nav"><h1>${esc(title)}</h1><p>${tx.notice}</p><nav aria-label="${tx.screens}">${nav}</nav></aside>
<main class="x2m-mock-screens">${screens.map((s, i) => mockScreenHtml(s, i, lang)).join('\n')}</main></div></body></html>
`
}
