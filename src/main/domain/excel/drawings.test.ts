import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { readWorkbook } from '../../adapters/outbound/xlsxFiles'
import { DEFAULT_OPTIONS } from '../../../shared/types'
import { convertSheetInWorkbook, convertSheetsInWorkbook, listSheetsInWorkbook } from './converter'
import { sheetDrawings } from './drawings'
import { workbookMdFiles } from './output'

const FIXTURE = fileURLToPath(new URL('../../../../test/fixtures/ui-drawings.xlsx', import.meta.url))

describe('lớp vẽ: file mẫu ui-drawings.xlsx (scripts/make-ui-fixture.mjs)', () => {
  const wb = readWorkbook(FIXTURE)
  const [layout, flow] = convertSheetsInWorkbook(wb, ['画面レイアウト', '画面遷移図'], DEFAULT_OPTIONS)

  it('ảnh nằm dưới đúng mục, kèm vùng ô', () => {
    const md = layout.markdown
    const img = '![Picture 1 (A7:H24)](x2m-asset:image1.png)'
    expect(md.indexOf('### 【画面イメージ（PC）】')).toBeLessThan(md.indexOf(img))
    expect(md.indexOf(img)).toBeLessThan(md.indexOf('### 【エラーダイアログ】'))
    expect(Object.keys(layout.images ?? {})).toEqual(['image1.png'])
  })

  it('callout, text box nhiều dòng, nhóm shape và comment ô', () => {
    const md = layout.markdown
    expect(md).toContain('- 〔図形 B10〕①')
    expect(md).toContain('- 〔図形 C10:E10〕検索条件エリア：3項目まで入力可')
    expect(md).toContain('- 〔図形 J9:M12〕※デザイン注記<br>・ヘッダー色 #1F4E79<br>・ボタン角丸 4px<br>・一覧は20件/ページ')
    expect(md).toContain('- 〔図形 J15:M16〕「該当データなし」表示')
    // comment neo trong bảng -> ghi sau bảng, không làm gãy bảng
    expect(md).toMatch(/\| 3 \| 検索 \|.*\n\n- 〔コメント B56: 顧客コード〕フォーカスアウト時に桁数チェック/)
  })

  it('sơ đồ chuyển màn hình chỉ bằng shape: mũi tên ra cặp màn hình + nhãn', () => {
    expect(flow.markdown).toContain('- 〔矢印〕ログイン SCR001 → メニュー SCR002')
    expect(flow.markdown).toContain('- 〔矢印〕顧客検索 SCR010 → 顧客詳細 SCR011（行ダブルクリック）')
    // nhãn đã gắn vào mũi tên thì không lặp lại thành shape riêng
    expect(flow.markdown).not.toContain('〕行ダブルクリック')
  })

  it('ghi file: link trỏ vào thư mục ảnh, ảnh đi kèm', () => {
    const used = new Set<string>(['book_images'])
    const files = workbookMdFiles('book', 'book.xlsx', [layout, flow], DEFAULT_OPTIONS, true, used)
    expect(files).toHaveLength(1)
    expect(files[0].text).toContain('](book_images%20%282%29/image1.png)')
    expect(files[0].text).not.toContain('x2m-asset:')
    expect(files[0].images?.map((i) => i.path)).toContain('book_images (2)/image1.png')
  })

  it('preview: ảnh nhúng dạng data:', () => {
    const md = convertSheetInWorkbook(wb, '画面レイアウト', DEFAULT_OPTIONS)
    expect(md).toContain('](data:image/png;base64,')
    expect(md).not.toContain('x2m-asset:')
  })
})

/** Workbook giả chỉ có các part lớp vẽ cần thiết. */
function fakeWb(drawingBody: string): XLSX.WorkBook {
  const f = (s: string): { content: Buffer } => ({ content: Buffer.from(s) })
  const rel = (id: string, type: string, target: string): string =>
    `<Relationships><Relationship Id="${id}" Type="http://x/${type}" Target="${target}"/></Relationships>`
  return {
    SheetNames: ['S'],
    Sheets: { S: {} },
    Workbook: { Sheets: [{ name: 'S', id: 'rId1' }] },
    files: {
      'xl/_rels/workbook.xml.rels': f(rel('rId1', 'worksheet', 'worksheets/sheet1.xml')),
      'xl/worksheets/_rels/sheet1.xml.rels': f(rel('rId1', 'drawing', '../drawings/drawing1.xml')),
      'xl/drawings/drawing1.xml': f(`<xdr:wsDr>${drawingBody}</xdr:wsDr>`),
    },
  } as unknown as XLSX.WorkBook
}
const anchor = (c1: number, r1: number, c2: number, r2: number, body: string): string =>
  `<xdr:twoCellAnchor><xdr:from><xdr:col>${c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
  `<xdr:to><xdr:col>${c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>${body}</xdr:twoCellAnchor>`
const box = (id: number, text: string): string =>
  `<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="${id}" name="B${id}"/></xdr:nvSpPr><xdr:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></xdr:txBody></xdr:sp>`

describe('sheetDrawings', () => {
  it('mũi tên dính vào shape (stCxn/endCxn), chỉ có đầu ở điểm đầu -> đảo chiều', () => {
    const cxn =
      '<xdr:cxnSp><xdr:nvCxnSpPr><xdr:cNvPr id="9" name="C"/><xdr:cNvCxnSpPr><a:stCxn id="2" idx="1"/><a:endCxn id="3" idx="3"/></xdr:cNvCxnSpPr></xdr:nvCxnSpPr>' +
      '<xdr:spPr><a:ln><a:headEnd type="arrow"/></a:ln></xdr:spPr></xdr:cxnSp>'
    // hai shape ở xa mũi tên: chỉ nối được nhờ id
    const d = sheetDrawings(
      fakeWb(anchor(0, 0, 2, 2, box(2, 'A &amp; B')) + anchor(20, 20, 22, 22, box(3, 'C')) + anchor(5, 5, 8, 6, cxn)),
      'S'
    )
    expect(d.items.find((i) => i.arrow)?.arrow).toEqual({ from: 'C', to: 'A & B', both: false, label: undefined })
  })

  it('workbook không có lớp vẽ (vd .xls) -> rỗng', () => {
    expect(sheetDrawings({ SheetNames: ['S'], Sheets: { S: {} } } as XLSX.WorkBook, 'S')).toEqual({ items: [], media: {} })
  })
})

describe('lớp vẽ nâng cao: ui-drawings-advanced.xlsx (scripts/make-ui-fixture-advanced.mjs)', () => {
  const wb = readWorkbook(fileURLToPath(new URL('../../../../test/fixtures/ui-drawings-advanced.xlsx', import.meta.url)))
  const names = listSheetsInWorkbook(wb, true).map((s) => s.name)
  const res = Object.fromEntries(convertSheetsInWorkbook(wb, names, DEFAULT_OPTIONS).map((r) => [r.sheet, r]))
  const md = (s: string): string => res[s]?.markdown ?? ''

  it('sheet DEL_ bị bỏ qua; sheet chỉ có ảnh / chỉ có shape vẫn ra nội dung', () => {
    expect(names).not.toContain('DEL_旧レイアウト')
    expect(md('画像のみ')).toBe('## 画像のみ\n\n![Picture 1 (A1:D18)](x2m-asset:image3.png)')
    expect(md('画面遷移図')).toContain('〔図形 B2:D4〕ログイン<br>SCR001')
  })

  it.each([
    ['dính hai đầu (stCxn/endCxn)', '〔矢印〕ログイン SCR001 → メニュー SCR002'],
    ['thả tự do, trên -> dưới', '〔矢印〕メニュー SCR002 → 権限あり？'],
    ['lật ngang (flipH) + nhãn cách 1 ô', '〔矢印〕権限あり？ → エラー画面 SCR099（いいえ）'],
    ['dính + nhãn', '〔矢印〕権限あり？ → 顧客検索 SCR010（はい）'],
    ['hai đầu mũi tên', '〔矢印〕顧客検索 SCR010 ↔ 顧客詳細 SCR011（行ダブルクリック／戻る）'],
    ['chỉ có headEnd -> đảo chiều', '〔矢印〕エラー画面 SCR099 → ログイン SCR001'],
  ])('mũi tên: %s', (_name, line) => {
    expect(md('画面遷移図')).toContain('- ' + line)
  })

  it('đường trang trí không nối shape bị bỏ; nhãn đã gắn không lặp lại', () => {
    expect(md('画面遷移図').match(/〔矢印〕/g)).toHaveLength(6)
    expect(md('画面遷移図')).not.toMatch(/〔図形 [^〕]+〕(はい|いいえ)$/m)
  })

  it('ảnh trong nhóm shape, alt text, oneCellAnchor, jpeg, emf', () => {
    expect(md('画面レイアウト')).toContain('![スマホ画面 (A43:E58)](x2m-asset:image3.png)')
    expect(md('顧客詳細')).toContain('![顧客詳細画面イメージ (A4)](x2m-asset:image4.jpeg)')
    // ảnh neo trong bảng -> sau bảng
    expect(md('顧客詳細')).toMatch(/\| 2 \| 削除 \|.*\n\n!\[削除アイコン \(F20\)\]\(x2m-asset:icon1\.emf\)$/)
    expect(Object.keys(res['顧客詳細'].images ?? {}).sort()).toEqual(['icon1.emf', 'image4.jpeg'])
  })

  it('chữ nhiều run, ký tự đặc biệt được escape, comment nhiều dòng', () => {
    const m = md('画面レイアウト')
    expect(m).toContain('〔図形 M27:Q28〕③ ページング：前へ/次へ + ページ番号')
    expect(m).toContain('・特殊文字: 初期値 \\<null> / \\*必須\\* / A\\|B & C')
    expect(m).toContain('〔コメント B62: 顧客コード〕フォーカスアウト時に桁数チェック。<br>エラー時は赤枠表示し、ダイアログを出す。')
  })

  it('preview: png/jpeg nhúng data:, emf giữ tên file (trình duyệt không hiển thị được)', () => {
    const m = convertSheetInWorkbook(wb, '顧客詳細', DEFAULT_OPTIONS)
    expect(m).toContain('](data:image/jpeg;base64,')
    expect(m).toContain('](icon1.emf)')
  })

  it('tùy chọn vùng ô: ảnh/shape ngoài vùng bị bỏ', () => {
    const m = convertSheetInWorkbook(wb, '画面レイアウト', { ...DEFAULT_OPTIONS, range: 'A1:L31' })
    expect(m).toContain('![Picture 1 (A7:L31)]')
    expect(m).not.toContain('〔図形 M') // callout cột M trở đi nằm ngoài vùng
    expect(m).not.toContain('エラーダイアログ')
  })
})
