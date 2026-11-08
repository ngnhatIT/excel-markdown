/* Chuỗi của tính năng テーブル定義書 → DDL / ER / JSON (nút DDL trên chip bảng, nút ER trên thanh xem). */
export const tableDefVi = {
  'td.ddlTitle': 'Sinh DDL / JSON / ER từ bảng định nghĩa này',
  'td.title': 'DDL: {name}',
  'td.dialect': 'Hệ CSDL',
  'td.generic': 'SQL chuẩn',
  'td.copyDdl': 'Copy DDL',
  'td.copyJson': 'Copy JSON',
  'td.copyEr': 'Copy ER (Mermaid)',
  'td.close': 'Đóng (Esc)',
  'td.er': 'ER',
  'td.erTitle': 'Sơ đồ ER (Mermaid) của {n} bảng định nghĩa trong file này',
  'td.erHeading': 'Sơ đồ ER: {n} bảng',
  'td.copyMermaid': 'Copy Mermaid',
  'td.lblDdl': 'DDL {name}',
  'td.lblJson': 'JSON {name}',
  'td.lblEr': 'ER (Mermaid)',
}

type TdDict = Record<keyof typeof tableDefVi, string>

export const tableDefEn: TdDict = {
  'td.ddlTitle': 'Generate DDL / JSON / ER from this table definition',
  'td.title': 'DDL: {name}',
  'td.dialect': 'Database',
  'td.generic': 'Standard SQL',
  'td.copyDdl': 'Copy DDL',
  'td.copyJson': 'Copy JSON',
  'td.copyEr': 'Copy ER (Mermaid)',
  'td.close': 'Close (Esc)',
  'td.er': 'ER',
  'td.erTitle': 'ER diagram (Mermaid) of the {n} table definitions in this file',
  'td.erHeading': 'ER diagram: {n} tables',
  'td.copyMermaid': 'Copy Mermaid',
  'td.lblDdl': 'DDL {name}',
  'td.lblJson': 'JSON {name}',
  'td.lblEr': 'ER (Mermaid)',
}

export const tableDefJa: TdDict = {
  'td.ddlTitle': 'このテーブル定義から DDL / JSON / ER を生成',
  'td.title': 'DDL: {name}',
  'td.dialect': 'データベース',
  'td.generic': '標準 SQL',
  'td.copyDdl': 'DDL をコピー',
  'td.copyJson': 'JSON をコピー',
  'td.copyEr': 'ER (Mermaid) をコピー',
  'td.close': '閉じる (Esc)',
  'td.er': 'ER',
  'td.erTitle': 'このファイルのテーブル定義 {n} 件の ER 図 (Mermaid)',
  'td.erHeading': 'ER 図: {n} テーブル',
  'td.copyMermaid': 'Mermaid をコピー',
  'td.lblDdl': 'DDL {name}',
  'td.lblJson': 'JSON {name}',
  'td.lblEr': 'ER (Mermaid)',
}
