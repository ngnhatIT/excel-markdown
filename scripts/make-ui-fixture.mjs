// Sinh file Excel mẫu có lớp vẽ (ảnh, callout, nhóm shape, mũi tên, comment) cho test:
// test/fixtures/ui-drawings.xlsx. Chạy: node scripts/make-ui-fixture.mjs
// exceljs chỉ vẽ được ảnh; shape/mũi tên được chèn thẳng vào xl/drawings/drawingN.xml.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const ExcelJS = require('exceljs'); const JSZip = require('jszip'); const fs = require('fs')
const out = fileURLToPath(new URL('../test/fixtures/ui-drawings.xlsx', import.meta.url))
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')
const wb = new ExcelJS.Workbook()
const img = wb.addImage({ buffer: png, extension: 'png' })
const thin = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} }

/* Sheet 1: 画面レイアウト — 3 ảnh + callout ①②③ + nhóm shape + comment + layout vẽ bằng ô có viền/màu */
const s1 = wb.addWorksheet('画面レイアウト')
s1.addRow(['基本設計','画面設計書']); s1.addRow([])
s1.addRow(['画面ID','SCR010','','画面名','顧客検索画面'])
s1.addRow(['画面遷移','メニュー → 顧客検索 → 顧客詳細']); s1.addRow([])
s1.addRow(['【画面イメージ（PC）】'])                      // row 6
for (let i=0;i<18;i++) s1.addRow([])                       // ảnh mockup chính rows 7-24
s1.addRow(['【エラーダイアログ】'])                         // row 25
for (let i=0;i<8;i++) s1.addRow([])                        // ảnh dialog rows 26-33
s1.addRow(['【スマホ表示】'])                               // row 34
s1.addRow(['', '', '', '', '', '', '', '', ''])
for (let i=0;i<10;i++) s1.addRow([])                       // ảnh mobile rows 35-45
s1.addRow(['【画面レイアウト（セル描画）】'])                // row 46
const startCell = s1.rowCount + 1
s1.addRow(['','顧客検索']); s1.addRow([])
s1.addRow(['','顧客コード','','','','顧客名','','',''])
s1.addRow(['','電話番号','','','','区分','▼ 法人','',''])
s1.addRow([]); s1.addRow(['','','','','','','[検索]','[クリア]',''])
for (let r=startCell; r<startCell+6; r++) for (let c=2;c<=9;c++) s1.getCell(r,c).border = thin
s1.getCell(startCell,2).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1F4E79'} }
s1.getCell(startCell,2).font = { color:{argb:'FFFFFFFF'}, bold:true }
s1.getCell(startCell+2,3).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFFF2CC'} } // ô nhập màu vàng = bắt buộc
s1.addRow([]); s1.addRow(['【項目定義】'])
s1.addRow(['No','項目名','区分','型','桁数','必須','備考'])
s1.addRow(['1','顧客コード','入力','文字列','10','○','画面イメージ①'])
s1.addRow(['2','顧客名','入力','文字列','40','','部分一致、画面イメージ②'])
s1.addRow(['3','検索','ボタン','','','','画面イメージ③'])
s1.getCell(s1.rowCount-2, 2).note = 'フォーカスアウト時に桁数チェック。エラー時は赤枠表示。'
s1.addImage(img, { tl:{col:0,row:6}, br:{col:8,row:24} })   // mockup PC
s1.addImage(img, { tl:{col:1,row:25}, br:{col:5,row:33} })  // dialog
s1.addImage(img, { tl:{col:0,row:35}, br:{col:3,row:45} })  // mobile
s1.addImage(img, { tl:{col:8,row:0}, br:{col:9,row:2} })    // logo công ty ở header

/* Sheet 2: 画面遷移図 — chỉ toàn shape + mũi tên, không có ô dữ liệu */
const s2 = wb.addWorksheet('画面遷移図')
s2.getCell('A1').value = '【画面遷移図】'
s2.addImage(img, { tl:{col:20,row:0}, br:{col:21,row:1} })  // để exceljs tạo drawing part
await wb.xlsx.writeFile(out)

/* Chèn shape vào drawing XML (exceljs không vẽ được shape) */
const A = (c1,r1,c2,r2,body) => `<xdr:twoCellAnchor><xdr:from><xdr:col>${c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>${body}<xdr:clientData/></xdr:twoCellAnchor>`
let nid = 100
const txt = (lines) => `<xdr:txBody><a:bodyPr/>${lines.map(l=>`<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join('')}</xdr:txBody>`
const sp = (prst, lines, box=false) => `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${nid++}" name="S${nid}"/><xdr:cNvSpPr${box?' txBox="1"':''}/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="900000" cy="300000"/></a:xfrm><a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom></xdr:spPr>${txt(lines)}</xdr:sp>`
const arrow = () => `<xdr:cxnSp macro=""><xdr:nvCxnSpPr><xdr:cNvPr id="${nid++}" name="Arrow"/><xdr:cNvCxnSpPr/></xdr:nvCxnSpPr><xdr:spPr><a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom><a:ln><a:tailEnd type="triangle"/></a:ln></xdr:spPr></xdr:cxnSp>`
const grp = (inner) => `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="${nid++}" name="Group"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1800000" cy="300000"/><a:chOff x="0" y="0"/><a:chExt cx="1800000" cy="300000"/></a:xfrm></xdr:grpSpPr>${inner}</xdr:grpSp>`
const shapes1 = [
  A(1,9,2,10, sp('ellipse',['①'])), A(2,9,5,10, sp('wedgeRectCallout',['検索条件エリア：3項目まで入力可'],true)),
  A(1,14,2,15, sp('ellipse',['②'])), A(1,19,2,20, sp('ellipse',['③'])),
  A(9,8,13,12, sp('rect',['※デザイン注記','・ヘッダー色 #1F4E79','・ボタン角丸 4px','・一覧は20件/ページ'],true)),
  A(9,14,13,16, grp(sp('rect',['検索結果0件時']) + sp('rect',['「該当データなし」表示']))),
  A(6,27,10,29, sp('wedgeRoundRectCallout',['OKで入力欄へフォーカス戻す'])),
].join('')
const shapes2 = [
  A(1,3,4,6, sp('roundRect',['ログイン','SCR001'])), A(4,4,6,5, arrow()),
  A(6,3,9,6, sp('roundRect',['メニュー','SCR002'])), A(9,4,11,5, arrow()),
  A(11,3,14,6, sp('roundRect',['顧客検索','SCR010'])), A(12,6,13,9, arrow()),
  A(11,9,14,12, sp('roundRect',['顧客詳細','SCR011'])),
  A(12,6,15,7, sp('rect',['行ダブルクリック'],true)),
  A(6,9,9,12, sp('flowChartDecision',['権限あり？'])),
].join('')
const zip = await JSZip.loadAsync(fs.readFileSync(out))
const parts = Object.keys(zip.files).filter(f => /xl\/drawings\/drawing\d+\.xml$/.test(f)).sort()
for (const [i, p] of parts.entries()) {
  let xml = await zip.file(p).async('string')
  xml = xml.replace('</xdr:wsDr>', (i===0?shapes1:shapes2) + '</xdr:wsDr>')
  if (!xml.includes('xmlns:a=')) xml = xml.replace('<xdr:wsDr ', '<xdr:wsDr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ')
  zip.file(p, xml)
}
fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer' }))
console.log('drawings:', parts, '| media:', Object.keys(zip.files).filter(f=>/media\/./.test(f)).length, '| comments:', Object.keys(zip.files).filter(f=>/comments/.test(f)))
