import { describe, expect, it } from 'vitest'
import { buildMockScreens, mockLang, mockPageHtml, mockScreenHtml } from './mockScreen'
import { SPEC_SAMPLE } from './specGuide'
import { EMPTY_RULES } from './projectConfig'
import { buildTestDesign } from './testDesign'

const MD = [
  '## 顧客検索',
  '',
  '- **画面ID**: SCR010',
  '- **画面名**: 顧客検索画面',
  '- **画面遷移**: 顧客検索 → 顧客詳細（詳細）',
  '',
  '### 【項目定義】',
  '',
  '| No | 項目名 | 区分 | 型 | 桁数 | 必須 | 初期値 | 備考 |',
  '|---|---|---|---|---|---|---|---|',
  '| 1 | 顧客コード | 入力 | 文字列 | 10 | ○ |  | 半角英数 |',
  '| 2 | 登録日 | 入力 | 日付 |  |  |  |  |',
  '| 3 | 区分 | プルダウン | 文字列 |  |  |  |  |',
  '| 4 | 件数 | 表示 | 数値 |  |  | 0 |  |',
  '| 5 | 詳細 | ボタン |  |  |  |  |  |',
  '| 6 | <script>alert(1)</script> | 入力 | 文字列 | 5 |  |  | "x" & y |',
  '',
  '- 〔入力規則 C2:C50〕法人 / 個人',
  '',
  '---',
  '',
  '## 顧客詳細',
  '',
  '- **画面ID**: SCR011',
  '- **画面名**: 顧客詳細画面',
  '- **画面遷移**: 顧客詳細 → メニュー',
  '',
].join('\n')

describe('buildMockScreens', () => {
  const [search, detail] = buildMockScreens([{ rel: 'a.md', text: MD }])

  it('một mock mỗi 画面ID; hạng mục theo 区分 / 型 / 桁数 / 必須 / 初期値', () => {
    expect(search).toMatchObject({ id: 'SCR010', name: '顧客検索画面', rel: 'a.md', line: 3 })
    expect(search.items.map((i) => `${i.label}:${i.control}:${i.inputType}:${i.maxLength}:${i.required}`)).toEqual([
      '顧客コード:text:text:10:true',
      '登録日:text:date:0:false',
      '区分:select:text:0:false',
      '件数:output:text:0:false',
      '詳細:button:text:0:false',
      '<script>alert(1)</script>:text:text:5:false',
    ])
    expect(search.items[2].options).toEqual(['法人', '個人']) // 〔入力規則〕 của màn hình
    expect(search.items[3].value).toBe('0')
  })

  it('画面遷移 thành link; nút cùng nhãn với 遷移 bấm được; màn hình chưa định nghĩa thì không link', () => {
    expect(search.transitions).toEqual([{ label: '詳細', to: 1, toLabel: 'SCR011 顧客詳細画面' }])
    expect(search.items[4].goto).toBe(1)
    expect(detail.items).toEqual([])
    expect(detail.transitions).toEqual([{ label: '', to: -1, toLabel: 'メニュー' }])
  })

  it('HTML: escape chữ trong tài liệu, maxlength / required / type, link #scr-n, màn hình không có 項目定義 có ghi chú', () => {
    const html = mockScreenHtml(search, 0)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&quot;x&quot; &amp; y')
    expect(html).toContain('<input id="m0-0" type="text" required maxlength="10" size="12">')
    expect(html).toContain('type="date"')
    expect(html).toContain('<option>法人</option><option>個人</option>')
    expect(html).toContain('<a class="x2m-mock-btn" href="#scr-1" data-goto="1">詳細</a>')
    expect(mockScreenHtml(detail, 1)).toContain('項目定義がありません')
    expect(mockScreenHtml(detail, 1)).toContain('aria-disabled="true"')
  })

  it('trang đứng riêng: CSP không cho script / mạng, có CSS, danh sách màn hình', () => {
    const page = mockPageHtml([search, detail], 'デモ <x>')
    expect(page).toContain("default-src 'none'; style-src 'unsafe-inline'")
    expect(page).not.toMatch(/<script/i)
    expect(page).toContain('.x2m-mock-field')
    expect(page).toContain('<title>デモ &lt;x&gt;</title>')
    expect(page).toContain('<a href="#scr-1">SCR011 顧客詳細画面</a>')
  })

  it('tài liệu mẫu của hướng dẫn cũng ra mock', () => {
    const m = buildMockScreens([{ rel: 's.md', text: SPEC_SAMPLE }])
    expect(m.map((s) => `${s.id}:${s.items.length}:${s.transitions.length}`)).toEqual(['SCR010:2:1', 'SCR011:0:1'])
  })

  it('tài liệu tiếng Việt: nhãn Mã / Tên / Chuyển màn hình, từ khóa loại ô, lựa chọn ở Ghi chú, chữ trên mock tiếng Việt', () => {
    const vi = [
      '## Thanh toán',
      '',
      '- **Mã màn hình**: CHECKOUT',
      '- **Tên màn hình**: Thanh toán',
      '- **Chuyển màn hình**: Thanh toán → Đặt hàng thành công（Đặt hàng ngay）',
      '',
      '| Hạng mục | Loại | Kiểu | Độ dài | Bắt buộc | Ghi chú |',
      '|---|---|---|---|---|---|',
      '| Họ và tên | Nhập | Chuỗi | 50 | ○ | |',
      '| Số điện thoại | Nhập | Chuỗi | 11 | ○ | |',
      '| Tỉnh/TP | Chọn | Danh sách | | ○ | Hà Nội / TP.HCM / Đà Nẵng |',
      '| Ngày giao | Nhập | Ngày | | | |',
      '| Số lượng | Nhập | Số | 3 | | |',
      '| Thanh toán | Nút chọn | | | ○ | COD / VietQR |',
      '| Ghi chú đơn | Nhập | Nhiều dòng | | | |',
      '| Tổng cộng | Hiển thị | Số | | | |',
      '| Đặt hàng ngay | Nút | | | | |',
      '',
      '---',
      '',
      '## Hoàn tất',
      '',
      '- **Mã màn hình**: DONE',
      '- **Tên màn hình**: Đặt hàng thành công',
      '',
    ].join('\n')
    const screens = buildMockScreens([{ rel: 'vi.md', text: vi }])
    const [c] = screens
    expect(screens.map((s) => s.id)).toEqual(['CHECKOUT', 'DONE'])
    expect(c.items.map((i) => `${i.label}:${i.control}:${i.inputType}`)).toEqual([
      'Họ và tên:text:text',
      'Số điện thoại:text:tel',
      'Tỉnh/TP:select:text',
      'Ngày giao:text:date',
      'Số lượng:text:number',
      'Thanh toán:radio:text', // "Nút chọn" không phải nút bấm
      'Ghi chú đơn:textarea:text',
      'Tổng cộng:output:text',
      'Đặt hàng ngay:button:text',
    ])
    expect(c.items[2].options).toEqual(['Hà Nội', 'TP.HCM', 'Đà Nẵng'])
    expect(c.items[5].options).toEqual(['COD', 'VietQR'])
    expect(c.items[8].goto).toBe(1) // nút trùng nhãn 遷移 「Đặt hàng ngay」
    expect(mockLang(screens)).toBe('vi')
    const html = mockScreenHtml(c, 0, 'vi')
    expect(html).toContain('Bắt buộc')
    expect(html).toContain('tối đa 50 ký tự')
    expect(html).not.toContain('必須')
    expect(mockPageHtml(screens, 'Shop')).toContain('<html lang="vi">')
  })

  it('ラジオボタン là radio, không phải nút bấm; tài liệu Nhật -> chữ tiếng Nhật', () => {
    const md = ['## 画面', '- **画面ID**: A001', '| 項目名 | 区分 | 型 |', '|---|---|---|', '| 性別 | 入力 | ラジオボタン |', ''].join('\n')
    const s = buildMockScreens([{ rel: 'a.md', text: md }])
    expect(s[0].items[0].control).toBe('radio')
    expect(mockLang(s)).toBe('ja')
  })
})

// Bố cục converter xuất từ 画面設計書 Excel thật: 画面ID lặp ở từng sheet, 項目定義 ở phần riêng,
// header tách khỏi dữ liệu bởi heading nhóm (### 【ヘッダー情報】), dòng dữ liệu đầu bị coi là header.
const XLSX_MD = [
  '## 【画面レイアウト】納品予定照会',
  '',
  '- **画面ID**: SPOR00401AC',
  '- **画面名**: 納品予定照会',
  '',
  '- **画面遷移**: 1. 発注メニュー/発注依頼入力【納品予定数のアンカー】/発注依頼_納品予定照会',
  '',
  '---',
  '',
  '## 【画面項目定義】納品予定照会',
  '',
  '- **画面ID**: SPOR00401AC',
  '- **画面名**: 納品予定照会',
  '',
  '| No | 画面ラベル | 項目名 | I/O | データ型 | 桁数 | 必須 | 初期値 |',
  '|---|---|---|---|---|---|---|---|',
  '',
  '### 【ヘッダー情報】',
  '',
  '| 1 | 拠点 |  | O | ラベル | 10 | - | 受信パラメータ |',
  '|---|---|---|---|---|---|---|---|',
  '| 2 | 納品日 |  | I | 日付 | 10 | ○ |  |',
  '|  | 【テーブル情報】 |  |  |  |  |  |  |',
  '| 3 | チェック |  | I | チェック | - | - |  |',
  '| 4 | 閉じる |  | I | ボタン | - | - |  |',
  '',
  '---',
  '',
  '## 【画面レイアウト】発注依頼入力',
  '',
  '- **画面ID**: SPOR00301AC =【画面レイアウト】発注依頼入力!AH3',
  '- **画面名**: 発注依頼入力 =【画面レイアウト】発注依頼入力!AU3',
].join('\n')

describe('buildMockScreens: 画面設計書 xuất từ Excel', () => {
  const screens = buildMockScreens([{ rel: 'a.md', text: XLSX_MD }])

  it('đọc 項目定義 ở phần khác cùng 画面ID, header tách bởi heading nhóm, nhãn cột 画面ラベル', () => {
    const s = screens.find((x) => x.id === 'SPOR00401AC')
    expect(s?.items.map((i) => `${i.label}:${i.control}${i.required ? '*' : ''}`)).toEqual(['拠点:output', '納品日:text*', 'チェック:checkbox', '閉じる:button'])
    expect(s?.items[1].inputType).toBe('date')
  })

  it('画面ID / 画面名 bỏ phần công thức Excel còn sót (=sheet!AH3)', () => {
    expect(screens.map((s) => `${s.id}|${s.name}`)).toContain('SPOR00301AC|発注依頼入力')
  })

  it('画面遷移 dạng đường dẫn menu (A/B/C) thành chuỗi chuyển tới màn hình hiện tại', () => {
    const t = screens.find((x) => x.id === 'SPOR00401AC')?.transitions
    expect(t).toEqual([])
    const from = screens.find((x) => x.id === 'SPOR00301AC')?.transitions
    expect(from).toEqual([{ label: '納品予定数のアンカー', to: 0, toLabel: 'SPOR00401AC 納品予定照会' }])
  })
})

describe('buildMockScreens: carry không lan sang bảng khác', () => {
  it('bảng イベント sau 項目定義 không thành hạng mục', () => {
    const md = ['## 画面', '- **画面ID**: S01', '', '| No | 項目名 | 型 |', '|---|---|---|', '| 1 | 氏名 | 文字列 |', '', '| No | イベント | 処理内容 |', '|---|---|---|', '| 1 | 初期表示 | 検索 |'].join('\n')
    expect(buildMockScreens([{ rel: 'a.md', text: md }])[0].items.map((i) => i.label)).toEqual(['氏名'])
  })
})

describe('tài liệu lệch mẫu', () => {
  const md = ['## 顧客登録', '', '| フィールド名 | サイズ | 必須/任意 | 説明 |', '|---|---|---|---|', '| 氏名 | 40 | ○ | |', '', '## 改訂履歴', '', '| 版 | 内容 |', '|---|---|', '| 1 | 初版 |'].join('\n')

  it('không có 画面ID: heading của phần có bảng 項目定義 thành màn hình (Mock + 観点表)', () => {
    const screens = buildMockScreens([{ rel: 'a.md', text: md }])
    expect(screens.map((s) => s.id)).toEqual(['顧客登録'])
    expect(screens[0].items.map((i) => `${i.label}:${i.maxLength}${i.required ? '*' : ''}`)).toEqual(['氏名:40*'])
    expect(buildTestDesign(md).tables).toBe(1)
  })

  it('phần đã có 画面ID thì không thêm màn hình từ heading', () => {
    const withId = md.replace('## 顧客登録\n', '## 顧客登録\n\n- **画面ID**: S01\n')
    expect(buildMockScreens([{ rel: 'a.md', text: withId }]).map((s) => s.id)).toEqual(['S01'])
  })

  it('x2m.json rules.itemColumns: tên cột riêng của dự án', () => {
    const custom = ['## 画面', '- **画面ID**: S01', '', '| 部品名称 | 入力桁 |', '|---|---|', '| 氏名 | 40 |'].join('\n')
    expect(buildMockScreens([{ rel: 'a.md', text: custom }])[0].items).toEqual([])
    const rules = { ...EMPTY_RULES, itemColumns: { ...EMPTY_RULES.itemColumns, item: ['部品名称'], length: ['入力桁'] } }
    const project = { path: 'x2m.json', warnings: [], rules }
    expect(buildMockScreens([{ rel: 'a.md', text: custom }], project)[0].items.map((i) => `${i.label}:${i.maxLength}`)).toEqual(['氏名:40'])
    expect(buildTestDesign(custom, { project }).tables).toBe(1)
  })
})

describe('itemColumns: khớp tên cột gần đúng', () => {
  it('header dài hơn alias vẫn nhận; khớp nguyên văn được ưu tiên', () => {
    const md = ['## 画面', '- **画面ID**: S01', '', '| 項目ID | 入力項目名 | 入力桁数 | 必須入力 | 備考欄 |', '|---|---|---|---|---|', '| I01 | 氏名 | 40 | ○ | メモ |'].join('\n')
    expect(buildMockScreens([{ rel: 'a.md', text: md }])[0].items.map((i) => `${i.label}:${i.maxLength}${i.required ? '*' : ''}`)).toEqual(['氏名:40*'])
    const exact = md.replace('入力項目名', '項目名')
    expect(buildMockScreens([{ rel: 'a.md', text: exact }])[0].items.map((i) => i.label)).toEqual(['氏名'])
  })
})
