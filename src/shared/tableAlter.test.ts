import { describe, expect, it } from 'vitest'
import { parseTableDefs, toAlterSql } from './tableDef'

const table = (rows: string[], name = 'TBL_CUSTOMER'): string =>
  [`## ${name}`, '', `- **テーブルID**: ${name}`, '', '| 論理名 | 物理名 | 型 | 桁数 | PK | NOT NULL | 既定値 |', '|---|---|---|---|---|---|---|', ...rows, ''].join('\n')
const OLD = table(['| 顧客コード | CUST_CD | VARCHAR | 10 | ○ | ○ | |', '| 顧客名 | CUST_NAME | VARCHAR | 40 | | ○ | |', '| 備考 | NOTE | VARCHAR | 200 | | | |', '| 区分 | KBN | CHAR | 1 | | | 0 |'])
const NEW = table([
  '| 顧客コード | CUST_CD | VARCHAR | 10 | ○ | ○ | |',
  '| 顧客名 | CUST_NAME | VARCHAR | 100 | | ○ | |', // 40 -> 100
  '| 区分 | KBN | CHAR | 1 | | ○ | 1 |', // NULL -> NOT NULL, default 0 -> 1
  '| メール | MAIL | VARCHAR | 255 | | | |', // thêm
])
const alter = (o: string, n: string, d: Parameters<typeof toAlterSql>[2] = 'postgres'): string => toAlterSql(parseTableDefs(o), parseTableDefs(n), d)

describe('toAlterSql', () => {
  it('giống nhau -> rỗng', () => {
    expect(alter(OLD, OLD)).toBe('')
  })

  it('PostgreSQL: thêm / bỏ cột, đổi kiểu, NOT NULL, 既定値; cảnh báo mất dữ liệu', () => {
    const sql = alter(OLD, NEW)
    expect(sql).toContain('ALTER TABLE TBL_CUSTOMER ADD COLUMN MAIL VARCHAR(255);')
    expect(sql).toContain('-- 要確認: NOTE のデータは削除される\nALTER TABLE TBL_CUSTOMER DROP COLUMN NOTE;')
    expect(sql).toContain('ALTER TABLE TBL_CUSTOMER ALTER COLUMN CUST_NAME TYPE VARCHAR(100);')
    expect(sql).toContain('ALTER TABLE TBL_CUSTOMER ALTER COLUMN KBN SET NOT NULL;')
    expect(sql).toContain('ALTER TABLE TBL_CUSTOMER ALTER COLUMN KBN SET DEFAULT 1;')
    expect(sql).not.toContain('CUST_CD')
  })

  it('MySQL: MODIFY ghi đủ định nghĩa; Oracle: MODIFY (...) và ADD (...); SQL Server: ALTER COLUMN + nhắc 既定値', () => {
    expect(alter(OLD, NEW, 'mysql')).toContain('ALTER TABLE TBL_CUSTOMER MODIFY COLUMN KBN CHAR(1) DEFAULT 1 NOT NULL;')
    const ora = alter(OLD, NEW, 'oracle')
    expect(ora).toContain('ALTER TABLE TBL_CUSTOMER MODIFY (CUST_NAME VARCHAR2(100));')
    expect(ora).toContain('ALTER TABLE TBL_CUSTOMER MODIFY (KBN DEFAULT 1 NOT NULL);')
    expect(ora).toContain('ALTER TABLE TBL_CUSTOMER ADD (MAIL VARCHAR2(255));')
    const ms = alter(OLD, NEW, 'sqlserver')
    expect(ms).toContain('ALTER TABLE TBL_CUSTOMER ALTER COLUMN KBN CHAR(1) NOT NULL;')
    expect(ms).toContain('ALTER TABLE TBL_CUSTOMER ADD MAIL VARCHAR(255);')
    expect(ms).toMatch(/-- 要確認: SQL Server の既定値/)
  })

  it('bảng mới -> CREATE TABLE; bảng bị bỏ -> DROP TABLE kèm cảnh báo', () => {
    const order = table(['| 受注番号 | ORDER_NO | VARCHAR | 20 | ○ | ○ | |'], 'TBL_ORDER')
    const sql = alter(OLD + '\n---\n' + order, NEW + '\n---\n' + table(['| ID | ID | INTEGER | | ○ | ○ | |'], 'TBL_LOG'))
    expect(sql).toMatch(/-- 新規テーブル: TBL_LOG\n(?:--[^\n]*\n)?CREATE TABLE TBL_LOG \(/)
    expect(sql).toContain('-- 要確認: テーブル TBL_ORDER が新しい設計書にない（データは削除される）\nDROP TABLE TBL_ORDER;')
  })

  it('cùng 論理名 khác 物理名: nhắc có thể là đổi tên; NOT NULL không default: nhắc dữ liệu cũ; đổi PK chỉ chú thích', () => {
    const o = table(['| 顧客コード | CUST_CD | VARCHAR | 10 | ○ | ○ | |'])
    const n = table(['| 顧客コード | CUSTOMER_CD | VARCHAR | 10 | ○ | ○ | |'])
    const sql = alter(o, n)
    expect(sql).toContain('列名変更 CUST_CD → CUSTOMER_CD')
    expect(sql).toContain('CUSTOMER_CD は NOT NULL で既定値なし')
    expect(sql).toContain('-- 要確認: 主キー変更 (CUST_CD) → (CUSTOMER_CD)')
  })
})
