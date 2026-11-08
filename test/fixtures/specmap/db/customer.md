# テーブル定義書

## TBL_CUSTOMER

- **テーブルID**: TBL\_CUSTOMER
- **テーブル名**: 顧客マスタ

### 【カラム定義】

| No | 論理名 | 物理名 | データ型 | 桁数 | PK | NOT NULL | 備考 |
|---|---|---|---|---|---|---|---|
| 1 | 顧客コード | CUST\_CD | VARCHAR | 10 | ○ | ○ |  |
| 2 | 顧客名 | CUST\_NAME | VARCHAR | 100 |  | ○ |  |
| 3 | 登録日 | REG\_DATE | DATE |  |  |  |  |

---

## TBL_ORDER

- **テーブルID**: TBL\_ORDER
- **テーブル名**: 受注

| No | 論理名 | 物理名 | データ型 | 桁数 | PK |
|---|---|---|---|---|---|
| 1 | 受注番号 | ORDER\_NO | VARCHAR | 20 | ○ |
| 2 | 顧客コード | CUST\_CD | VARCHAR | 10 |  |
