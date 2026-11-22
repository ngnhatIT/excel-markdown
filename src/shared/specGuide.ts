/* Hướng dẫn viết tài liệu cho Bản đồ thiết kế: tài liệu mẫu (đủ mọi thứ bản đồ đọc được) + mức nhận diện từng file.
 * Mẫu được test bằng chính buildSpecIndex nên hướng dẫn không lệch với luật nhận diện thật. */
import type { SpecIndex } from './specIndex'

/** Một file Markdown mẫu: 2 màn hình (画面ID, 画面遷移, 項目定義, xử lý có động từ CRUD) + 1 テーブル定義.
 * Cố ý có 2 chỗ để 整合性チェック báo: 顧客名 桁数 50 > VARCHAR(40), và màn hình メニュー chưa định nghĩa. */
export const SPEC_SAMPLE = `# 顧客管理 基本設計（サンプル）

## 顧客検索

- **画面ID**: SCR010
- **画面名**: 顧客検索画面
- **画面遷移**: メニュー → 顧客検索 → 顧客詳細

### 【項目定義】

| No | 項目名 | 区分 | 型 | 桁数 | 必須 |
|---|---|---|---|---|---|
| 1 | 顧客コード | 入力 | 文字列 | 10 | ○ |
| 2 | 顧客名 | 入力 | 文字列 | 50 |  |

### 【処理概要】

- 検索: TBL_CUSTOMER.CUST_CD で前方一致検索し、結果を一覧に表示する。

---

## 顧客詳細

- **画面ID**: SCR011
- **画面名**: 顧客詳細画面
- **画面遷移**: 顧客詳細 → 顧客検索（戻る）

### 【処理概要】

- 「保存」押下: TBL_CUSTOMER の顧客名を更新する。
- 「削除」押下: TBL_CUSTOMER を論理削除する。

---

## TBL_CUSTOMER

- **テーブルID**: TBL_CUSTOMER
- **テーブル名**: 顧客マスタ

| No | 論理名 | 物理名 | 型 | 桁数 | PK | NOT NULL |
|---|---|---|---|---|---|---|
| 1 | 顧客コード | CUST_CD | VARCHAR | 10 | ○ | ○ |
| 2 | 顧客名 | CUST_NAME | VARCHAR | 40 |  | ○ |
`

export interface FileCoverage {
  rel: string
  screens: number
  transitions: number
  tables: number
  refs: number
}

/** Mỗi tài liệu nhận ra được bao nhiêu màn hình / 遷移 / bảng / tham chiếu. File không có gì đứng cuối. */
export function specCoverage(index: SpecIndex): FileCoverage[] {
  const by = new Map<string, FileCoverage>(index.rels.map((rel) => [rel, { rel, screens: 0, transitions: 0, tables: 0, refs: 0 }]))
  const bump = (rel: string, k: 'screens' | 'transitions' | 'tables' | 'refs'): void => {
    const c = by.get(rel)
    if (c) c[k]++
  }
  for (const s of index.screens) bump(s.rel, 'screens')
  for (const t of index.transitions) bump(t.rel, 'transitions')
  for (const t of index.tables) bump(t.source, 'tables')
  for (const r of index.refs) bump(r.rel, 'refs')
  const empty = (c: FileCoverage): boolean => c.screens + c.transitions + c.tables + c.refs === 0
  return [...by.values()].sort((a, b) => Number(empty(a)) - Number(empty(b)))
}
