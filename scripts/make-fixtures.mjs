// Sinh file Excel mẫu (ẩn danh, dữ liệu hư cấu) cho golden test: test/fixtures/kihon-sekkei.xlsx
// Chạy: node scripts/make-fixtures.mjs
// Sau đó (tùy chọn, cần Excel): powershell -File scripts/make-excel-fixture.ps1
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx') // bản CJS: tự nạp fs
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'test', 'fixtures')
mkdirSync(outDir, { recursive: true })

const wb = XLSX.utils.book_new()

/* ---- Sheet 1: 画面項目定義 (banner, meta, section, bảng, ký tự đặc biệt) ---- */
const s1 = XLSX.utils.aoa_to_sheet([
  ['基本設計', '画面項目定義書', '', '', '版数', '作成日', '作成者'],
  ['', '', '', '', '1.0', '2026/10/01', '山田'],
  ['', '', '', '', '1.1', '2026/10/15', '鈴木'],
  [],
  ['機能ID', 'SPXX0001', '', '機能名', '顧客検索'],
  ['画面ID', 'SPXX0001-01', '', '画面名', '顧客検索画面'],
  ['画面遷移', 'メニュー → 顧客検索'],
  ['', '→ 顧客詳細'],
  [],
  ['【項目定義】'],
  ['No', '項目名', '区分', '型', '桁数', '必須', '初期値', '備考'],
  ['1', '顧客コード', '入力', '文字列', '10', '○', '<null>', '半角英数 1~10, 20~30'],
  ['2', '顧客名', '', '文字列', '50', '*必須*', '__x__', '全角　　スペース'],
  ['3', '電話番号', '入力', '文字列', '15', '', '', '形式: 03-xxxx-xxxx\n　※ハイフンあり'],
  ['4', '備考欄', '表示', '文字列', '200', '', '&nbsp;', '<input type="text"> を使用 | 区切り'],
  ['5', '参照', '表示', 'リンク', '', '', '`code`', '[仕様](http://example.com/a)'],
  ['6', '詳細リンク', '表示', '', '', '', '', '詳細仕様'],
  [],
  ['※ 必須項目は○で表示する'],
  [],
  ['■処理順序1'],
  ['# 見出しではない'],
  [],
  ['1. リストではない', '', '補足'],
  [],
  ['- これも', 'リストではない'],
  [],
  ['コード', '名称'],
  ['A', '有効'],
  ['B', '無効'],
])
s1['!merges'] = [{ s: { r: 11, c: 2 }, e: { r: 12, c: 2 } }] // 区分 merge dọc
s1['H17'].l = { Target: 'https://example.com/spec?id=1&lang=ja' }
XLSX.utils.book_append_sheet(wb, s1, '画面項目定義')

/* ---- Sheet 2: テーブル定義 (số/ngày/công thức/lỗi/boolean, !ref phình) ---- */
const s2 = XLSX.utils.aoa_to_sheet([
  ['テーブルID', 'TBL_CUSTOMER', '', 'テーブル名', '顧客マスタ'],
  [],
  ['項番', '論理名', '物理名', '型', '既定値', '更新日', '比率', '有効'],
  ['1', '顧客コード', 'cust_cd', 'VARCHAR(10)', '', '', '', ''],
  ['2', '登録日', 'reg_date', 'DATE', '', '', '', ''],
  ['3', '割引率', 'disc_rate', 'NUMERIC(5,2)', '', '', '', ''],
  ['4', '合計', 'total', 'NUMERIC', '', '', '', ''],
])
s2['E4'] = { t: 's', v: 'N/A' }
s2['F5'] = { t: 'n', v: 46309, z: 'yyyy/mm/dd' }
s2['F6'] = { t: 'n', v: 46309.5, z: 'yyyy"年"m"月"d"日" h:mm' }
s2['G6'] = { t: 'n', v: 0.125, z: '0.00%' }
s2['H6'] = { t: 'b', v: true }
s2['E7'] = { t: 'n', v: 1234567.891, z: '#,##0.00', f: 'SUM(1234567.891)' }
s2['F7'] = { t: 'e', v: 0x2a, w: '#N/A' }
s2['G7'] = { t: 's', v: '顧客検索', f: "'画面項目定義'!E5" }
// !ref phình: Excel ghi dimension theo vùng có định dạng, không theo ô có giá trị
s2['!ref'] = 'A1:AZ20000'
XLSX.utils.book_append_sheet(wb, s2, 'テーブル定義')

/* ---- Sheet 3: DEL_ (mặc định bỏ qua) ---- */
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['旧仕様', '削除済み']]), 'DEL_旧仕様')

/* ---- Sheet 4: ẩn ---- */
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['内部メモ: 公開しない']]), '内部メモ')

/* ---- Sheet 5: rỗng ---- */
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), '空シート')

wb.Workbook = { Sheets: wb.SheetNames.map((n) => ({ name: n, Hidden: n === '内部メモ' ? 1 : 0 })) }

const p = join(outDir, 'kihon-sekkei.xlsx')
XLSX.writeFile(wb, p)
console.log('wrote', p)
