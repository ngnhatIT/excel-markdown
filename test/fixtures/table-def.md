# テーブル定義書

## M_CUSTOMER

- **テーブルID**: M_CUSTOMER
- **テーブル名**: 顧客マスタ

### 【カラム定義】

| No | 論理名 | 物理名 | データ型 | 桁数 | 小数桁 | PK | NOT NULL | 既定値 | 備考 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 顧客ID | customer\_id | 数値 | 10 |  | ○ | ○ |  | 採番 |
| 2 | 顧客名 | customer\_name | 文字列 | 100 |  |  | ○ |  | It's "VIP" |
| 3 | 与信額 | credit\_limit | NUMBER | 12 | 2 |  |  | 0 |  |
| 4 | 区分 | kbn | CHAR | 1 |  |  | ○ | 01 |  |
| 5 | 登録日時 | created\_at | 日時 |  |  |  | ○ | CURRENT\_TIMESTAMP |  |

---

## T_ORDER

- **テーブルID**: T_ORDER
- **テーブル名**: 受注明細

| No | Column | Name | Type | Length | Key | Nullable | Default | Comment |
|---|---|---|---|---|---|---|---|---|
| 1 | order\_no | 受注番号 | VARCHAR(20) |  | PK |  |  |  |
| 2 | line\_no | 明細番号 | INTEGER |  | PK |  |  |  |
| 3 | customer\_id | 顧客ID | NUMERIC | 10 |  |  |  | FK → M\_CUSTOMER |
| 4 | note | メモ | TEXT |  |  | ○ | O'Brien |  |
| 5 |  | (空行) |  |  |  |  |  |  |

### 画面項目定義

| No | 項目名 | 型 | 桁数 |
|---|---|---|---|
| 1 | 顧客名 | 文字列 | 100 |
