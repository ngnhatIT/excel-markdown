// Sinh test/fixtures/ui-drawings-advanced.xlsx: tài liệu 画面設計書 có lớp vẽ phức tạp, dùng ảnh
// mockup thật trong test/fixtures/mockups. Chạy: node scripts/make-ui-fixture-advanced.mjs
// exceljs chỉ vẽ được ảnh png/jpeg; shape, mũi tên, nhóm, ảnh EMF được chèn thẳng vào XML.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const ExcelJS = require('exceljs')
const JSZip = require('jszip')
const fx = (p) => fileURLToPath(new URL('../test/fixtures/' + p, import.meta.url))
const out = fx('ui-drawings-advanced.xlsx')

const wb = new ExcelJS.Workbook()
const img = (f, extension) => wb.addImage({ buffer: readFileSync(fx('mockups/' + f)), extension })
const pc = img('pc-search.png', 'png'), dlg = img('dialog.png', 'png'), mob = img('mobile.png', 'png'), det = img('detail.jpg', 'jpeg')
const rows = (ws, n) => { for (let i = 0; i < n; i++) ws.addRow([]) }

/* 1. 画面レイアウト */
const s1 = wb.addWorksheet('画面レイアウト')
s1.addRow(['基本設計', '画面設計書']); s1.addRow([])
s1.addRow(['画面ID', 'SCR010', '', '画面名', '顧客検索画面'])
s1.addRow(['画面遷移', 'メニュー → 顧客検索 → 顧客詳細']); s1.addRow([])
s1.addRow(['【画面イメージ（PC）】']); rows(s1, 25)          // ảnh A7:L31
s1.addRow(['【エラーダイアログ】']); rows(s1, 9)              // row 32, ảnh B33:G40
s1.addRow(['【スマホ表示】']); rows(s1, 17)                   // row 42, nhóm (ảnh + chú thích) A43:E58
s1.addRow(['【項目定義】'])                                   // row 60
s1.addRow(['No', '項目名', '区分', '型', '桁数', '必須', '初期値', '備考'])
s1.addRow(['1', '顧客コード', '入力', '文字列', '10', '○', '', '画面イメージ①'])
s1.addRow(['2', '顧客名', '入力', '文字列', '40', '', '', '部分一致'])
s1.addRow(['3', '区分', '選択', '', '', '', '法人', '画面イメージ①'])
s1.addRow(['4', '検索結果一覧', '表示', '', '', '', '', '画面イメージ②、20件/ページ'])
s1.getCell('B62').note = 'フォーカスアウト時に桁数チェック。\nエラー時は赤枠表示し、ダイアログを出す。'
s1.addImage(pc, { tl: { col: 0, row: 6 }, br: { col: 12, row: 31 } })
s1.addImage(dlg, { tl: { col: 1, row: 32 }, br: { col: 7, row: 40 } })

/* 2. 画面遷移図: không có ô dữ liệu, chỉ shape + mũi tên */
const s2 = wb.addWorksheet('画面遷移図')
s2.addImage(mob, { tl: { col: 30, row: 0 }, br: { col: 31, row: 1 } }) // để có drawing part, xoá anchor sau

/* 3. 顧客詳細: ảnh oneCellAnchor (jpeg, có alt text) + icon EMF neo trong bảng */
const s3 = wb.addWorksheet('顧客詳細')
s3.addRow(['画面ID', 'SCR011', '', '画面名', '顧客詳細画面']); s3.addRow([])
s3.addRow(['【画面イメージ】']); rows(s3, 14)
s3.addRow(['【項目定義】'])
s3.addRow(['No', '項目名', '区分', '備考'])
s3.addRow(['1', '編集', 'ボタン', '編集画面へ'])
s3.addRow(['2', '削除', 'ボタン', '確認ダイアログ後に削除'])
s3.addImage(det, { tl: { col: 0, row: 3 }, ext: { width: 600, height: 280 } })

/* 4. 画像のみ: không có ô nào, chỉ một ảnh (dùng lại media mobile) */
wb.addWorksheet('画像のみ').addImage(mob, { tl: { col: 0, row: 0 }, br: { col: 4, row: 18 } })

/* 5. DEL_ sheet có ảnh: mặc định bị bỏ qua */
const s5 = wb.addWorksheet('DEL_旧レイアウト'); s5.addRow(['旧版']); s5.addImage(pc, { tl: { col: 0, row: 2 }, br: { col: 5, row: 10 } })
await wb.xlsx.writeFile(out)

/* ---- Chèn XML ---- */
const A = (c1, r1, c2, r2, body) => `<xdr:twoCellAnchor><xdr:from><xdr:col>${c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>${body}<xdr:clientData/></xdr:twoCellAnchor>`
let nid = 200
const para = (l) => `<a:p>${(Array.isArray(l) ? l : [l]).map((r) => `<a:r><a:rPr lang="ja-JP"/><a:t>${r}</a:t></a:r>`).join('')}</a:p>`
const sp = (prst, lines, { box = false, id = nid++ } = {}) =>
  `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="Shape ${id}"/><xdr:cNvSpPr${box ? ' txBox="1"' : ''}/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom></xdr:spPr><xdr:txBody><a:bodyPr/><a:lstStyle/>${lines.map(para).join('')}</xdr:txBody></xdr:sp>`
const cxn = ({ st, en, head = false, tail = true, flipH = false, flipV = false, prst = 'straightConnector1' } = {}) =>
  `<xdr:cxnSp macro=""><xdr:nvCxnSpPr><xdr:cNvPr id="${nid++}" name="Connector"/><xdr:cNvCxnSpPr>${st ? `<a:stCxn id="${st}" idx="3"/>` : ''}${en ? `<a:endCxn id="${en}" idx="1"/>` : ''}</xdr:cNvCxnSpPr></xdr:nvCxnSpPr>` +
  `<xdr:spPr><a:xfrm${flipH ? ' flipH="1"' : ''}${flipV ? ' flipV="1"' : ''}><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></a:xfrm><a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom><a:ln>${head ? '<a:headEnd type="triangle"/>' : ''}${tail ? '<a:tailEnd type="triangle"/>' : ''}</a:ln></xdr:spPr></xdr:cxnSp>`
const pic = (rid, name) => `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${nid++}" name="${name}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/><a:stretch/></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`
const grp = (inner) => `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="${nid++}" name="Group"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr/>${inner}</xdr:grpSp>`

const zip = await JSZip.loadAsync(readFileSync(out))
const text = (p) => zip.file(p).async('string')
// sheet -> drawing theo rels (không đoán theo thứ tự)
const wbRels = await text('xl/_rels/workbook.xml.rels')
const wbXml = await text('xl/workbook.xml')
const drawingOf = async (name) => {
  const rid = new RegExp(`<sheet [^>]*name="${name}"[^>]*r:id="([^"]+)"`).exec(wbXml)[1]
  const sheet = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(wbRels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`).exec(wbRels)[1]
  const sheetRels = await text('xl/' + sheet.replace('worksheets/', 'worksheets/_rels/') + '.rels')
  return 'xl/drawings/' + /Target="\.\.\/drawings\/(drawing\d+\.xml)"/.exec(sheetRels)[1]
}
const patch = async (name, fn) => {
  const p = await drawingOf(name)
  let xml = await text(p)
  if (!xml.includes('xmlns:a=')) xml = xml.replace('<xdr:wsDr ', '<xdr:wsDr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ')
  zip.file(p, await fn(xml, p))
}
const append = (xml, s) => xml.replace('</xdr:wsDr>', s + '</xdr:wsDr>')
const relOf = async (p, file) => new RegExp(`Id="([^"]+)"[^>]*Target="\\.\\./media/${file}"`).exec(await text(p.replace('drawings/', 'drawings/_rels/') + '.rels'))?.[1]

await patch('画面レイアウト', async (xml, p) => {
  const mobRid = 'rIdMob'
  const relsP = p.replace('drawings/', 'drawings/_rels/') + '.rels'
  // ảnh mobile dùng lại media của sheet 画像のみ: tìm theo kích thước file
  const mobBytes = readFileSync(fx('mockups/mobile.png')).length
  let mobTarget
  for (const f of Object.keys(zip.files).filter((f) => /^xl\/media\/.+/.test(f))) if ((await zip.file(f).async('uint8array')).length === mobBytes) mobTarget = f.slice(3)
  zip.file(relsP, (await text(relsP)).replace('</Relationships>', `<Relationship Id="${mobRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../${mobTarget}"/></Relationships>`))
  return append(xml, [
    A(0, 7, 1, 8, sp('ellipse', ['①'])), A(12, 8, 17, 11, sp('wedgeRectCallout', ['① 検索条件：顧客コードは必須（黄色背景）', '区分の初期値は「法人」'], { box: true })),
    A(0, 15, 1, 16, sp('ellipse', ['②'])), A(12, 15, 17, 18, sp('wedgeRectCallout', ['② 検索結果：20件/ページ、行クリックで顧客詳細へ'], { box: true })),
    A(5, 28, 6, 29, sp('ellipse', ['③'])), A(12, 26, 17, 28, sp('rect', [['③ ページング：', '前へ/次へ ', '+ ページ番号']], { box: true })),
    A(12, 19, 17, 24, sp('rect', ['※デザイン注記', '・ヘッダー色 #1F4E79', '・入力欄 高さ32px、角丸4px', '・特殊文字: 初期値 <null> / *必須* / A|B & C'], { box: true })),
    A(8, 34, 12, 36, sp('wedgeRoundRectCallout', ['OK押下で顧客コード欄にフォーカスを戻す'])),
    A(0, 42, 5, 58, grp(pic(mobRid, 'スマホ画面') + sp('rect', ['幅375px基準、検索結果はカード表示'], { box: true }))),
    A(9, 62, 13, 64, sp('rect', ['※ 桁数はDB定義に準ずる'], { box: true })), // neo trong bảng -> ra sau bảng
  ].join(''))
})

await patch('画面遷移図', async (xml) => {
  xml = xml.replace(/<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/, '') // bỏ ảnh mồi (anchor duy nhất exceljs ghi)
  const box = (c, r, lines, id, prst = 'roundRect') => A(c, r, c + 3, r + 3, sp(prst, lines, { id }))
  return append(xml, [
    box(1, 1, ['ログイン', 'SCR001'], 10), box(7, 1, ['メニュー', 'SCR002'], 11), box(7, 7, ['権限あり？'], 12, 'flowChartDecision'),
    box(13, 7, ['顧客検索', 'SCR010'], 13), box(13, 13, ['顧客詳細', 'SCR011'], 14), box(1, 7, ['エラー画面', 'SCR099'], 15),
    A(4, 2, 7, 3, cxn({ st: 10, en: 11, prst: 'bentConnector3' })),       // dính hai đầu
    A(8, 4, 9, 7, cxn()),                                                  // thả, trên -> dưới
    A(10, 8, 13, 9, cxn({ st: 12, en: 13 })), A(11, 7, 12, 8, sp('rect', ['はい'], { box: true })),
    A(4, 8, 7, 9, cxn({ flipH: true })), A(5, 7, 6, 8, sp('rect', ['いいえ'], { box: true })), // vẽ phải -> trái
    A(14, 10, 15, 13, cxn({ head: true, tail: true })), A(15, 11, 18, 12, sp('rect', ['行ダブルクリック／戻る'], { box: true })),
    A(2, 4, 3, 7, cxn({ head: true, tail: false })),                     // vẽ ログイン -> エラー, đầu mũi tên ở điểm đầu
    A(20, 20, 24, 20, cxn({ tail: false })),                              // đường trang trí, không nối gì
  ].join(''))
})

await patch('顧客詳細', async (xml, p) => {
  const relsP = p.replace('drawings/', 'drawings/_rels/') + '.rels'
  // alt text cho ảnh jpeg
  xml = xml.replace(/(<xdr:cNvPr id="\d+" name="[^"]*")/, '$1 descr="顧客詳細画面イメージ"')
  // icon EMF (ảnh dán từ Office cũ) neo trong bảng
  zip.file('xl/media/icon1.emf', Buffer.from('0100000084000000', 'hex'))
  zip.file(relsP, (await text(relsP)).replace('</Relationships>', '<Relationship Id="rIdEmf" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/icon1.emf"/></Relationships>'))
  const ct = await text('[Content_Types].xml')
  if (!ct.includes('Extension="emf"')) zip.file('[Content_Types].xml', ct.replace('<Default ', '<Default Extension="emf" ContentType="image/x-emf"/><Default '))
  return append(xml, A(5, 19, 6, 20, pic('rIdEmf', '削除アイコン')))
})
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log('ok', out)
