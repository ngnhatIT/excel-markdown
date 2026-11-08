import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTableDefs, quoteIdent, SQL_DIALECTS, toDDL, toErMermaid, toJson, type TableDef } from './tableDef'

const root = join(__dirname, '../..')
const golden = readFileSync(join(root, 'test/golden/kihon-sekkei.xlsx.md'), 'utf8')
const fixture = readFileSync(join(root, 'test/fixtures/table-def.md'), 'utf8')

/** Mermaid thật (chạy được trong Node): sơ đồ sai ngữ pháp thì ném lỗi. */
const mermaidParses = async (src: string): Promise<void> => {
  const mermaid = (await import('mermaid')).default
  await mermaid.parse(src)
}

describe('parseTableDefs', () => {
  it('golden kihon-sekkei: TBL_CUSTOMER, bỏ qua bảng 項目定義 (không có cột 物理名)', () => {
    const defs = parseTableDefs(golden, 'kihon-sekkei.xlsx.md')
    expect(defs).toHaveLength(1)
    const d = defs[0]
    expect(d).toMatchObject({ source: 'kihon-sekkei.xlsx.md', tableName: 'TBL_CUSTOMER', logicalName: '顧客マスタ' })
    expect(golden.split('\n')[d.line - 1]).toMatch(/^\| 項番 \| 論理名 \| 物理名 \| 型 \|/)
    expect(d.columns.map((c) => [c.name, c.logical, c.type])).toEqual([
      ['cust_cd', '顧客コード', 'VARCHAR(10)'],
      ['reg_date', '登録日', 'DATE'],
      ['disc_rate', '割引率', 'NUMERIC(5,2)'],
      ['total', '合計', 'NUMERIC'],
    ])
    // 既定値 "N/A" = không có
    expect(d.columns[0].default).toBe('')
    expect(d.columns[3].default).toBe('1,234,567.89')
    expect(d.columns[0].line).toBe(d.line + 2)
  })

  it('fixture: alias header Nhật / Anh, escape Markdown, 桁/小数, PK ghép, Nullable đảo nghĩa, bỏ hàng không có 物理名', () => {
    const [cust, order] = parseTableDefs(fixture)
    expect(parseTableDefs(fixture)).toHaveLength(2)
    expect(cust.tableName).toBe('M_CUSTOMER')
    expect(cust.columns[0]).toMatchObject({ name: 'customer_id', logical: '顧客ID', type: '数値', length: '10', pk: true, notNull: true, comment: '採番' })
    expect(cust.columns[2]).toMatchObject({ name: 'credit_limit', type: 'NUMBER', length: '12', scale: '2', pk: false, notNull: false, default: '0' })
    expect(cust.columns[4]).toMatchObject({ name: 'created_at', default: 'CURRENT_TIMESTAMP' })
    expect(order).toMatchObject({ tableName: 'T_ORDER', logicalName: '受注明細' })
    expect(order.columns.map((c) => c.name)).toEqual(['order_no', 'line_no', 'customer_id', 'note'])
    expect(order.columns.filter((c) => c.pk).map((c) => c.name)).toEqual(['order_no', 'line_no'])
    expect(order.columns.map((c) => c.notNull)).toEqual([true, true, true, false])
    expect(order.columns[2]).toMatchObject({ logical: '顧客ID', comment: 'FK → M_CUSTOMER' })
  })

  it('header toàn角 / hoa thường, dấu ✓ / Y / 1, NULL許可 đảo nghĩa, 桁数 "10,2"', () => {
    const md = [
      '### テーブル: ITEM（商品）',
      '',
      '| ＮＯ | カラム名 | 項目名 | ＤＡＴＡＴＹＰＥ | 桁数 | 主キー | NULL許可 | 初期値 |',
      '|---|---|---|---|---|---|---|---|',
      '| 1 | item_cd | 商品コード | varchar | 8 | ✓ |  |  |',
      '| 2 | price | 単価 | decimal | 10,2 |  | Y |  |',
      '| 3 | ｓｔｏｃｋ | 在庫 | int |  |  | 〇 | 0 |',
    ].join('\n')
    const [d] = parseTableDefs(md)
    expect(d.tableName).toBe('ITEM')
    expect(d.logicalName).toBe('商品')
    expect(d.columns.map((c) => [c.name, c.pk, c.notNull, c.length, c.scale])).toEqual([
      ['item_cd', true, true, '8', ''],
      ['price', false, false, '10', '2'],
      ['stock', false, false, '', ''],
    ])
  })

  it('không meta: lấy heading gần nhất (bỏ heading chung chung như 【カラム定義】); bỏ bảng trong khối code', () => {
    const md = ['## 社員マスタ EMPLOYEE', '### 【カラム定義】', '| 物理名 | 型 |', '|---|---|', '| emp_no | INT |', '', '```', '| 物理名 | 型 |', '|---|---|', '| x | INT |', '```'].join('\n')
    const defs = parseTableDefs(md)
    expect(defs).toHaveLength(1)
    expect(defs[0]).toMatchObject({ tableName: 'EMPLOYEE', logicalName: '社員マスタ', line: 3 })
  })

  it('meta của bảng trước không dính sang sheet sau (## / ---); không có gì thì table_n', () => {
    const md = ['- **テーブルID**: A_TBL', '', '---', '', '| 物理名 | 型 |', '|---|---|', '| a | INT |'].join('\n')
    expect(parseTableDefs(md)[0].tableName).toBe('table_1')
  })

  it('Markdown bất kỳ: không ném, không bảng định nghĩa thì []', () => {
    for (const md of ['', '|', '| a |\n|---|', '# x\n\n| 物理名 | 型 |\n|---|---|\n', '- **テーブルID**:\n', '```\n| 物理名 |']) {
      expect(() => parseTableDefs(md)).not.toThrow()
    }
    expect(parseTableDefs('| No | 項目名 | 型 |\n|---|---|---|\n| 1 | a | b |')).toEqual([])
  })
})

describe('toDDL', () => {
  const defs = parseTableDefs(fixture, 'table-def.md')

  it('postgres: kiểu Nhật → SQL, NUMERIC(p,s), DEFAULT, NOT NULL, PK ghép, COMMENT ON (escape nháy)', () => {
    const sql = toDDL(defs, 'postgres')
    expect(sql).toContain('-- 顧客マスタ / table-def.md\nCREATE TABLE M_CUSTOMER (\n')
    expect(sql).toContain('  customer_id NUMERIC(10) NOT NULL,\n')
    expect(sql).toContain('  customer_name VARCHAR(100) NOT NULL,\n')
    expect(sql).toContain('  credit_limit NUMERIC(12,2) DEFAULT 0,\n')
    expect(sql).toContain("  kbn CHAR(1) DEFAULT '01' NOT NULL,\n")
    expect(sql).toContain('  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,\n')
    expect(sql).toContain('  PRIMARY KEY (customer_id)\n);')
    expect(sql).toContain('  PRIMARY KEY (order_no, line_no)\n);')
    expect(sql).toContain("  note TEXT DEFAULT 'O''Brien',\n")
    expect(sql).toContain("COMMENT ON TABLE M_CUSTOMER IS '顧客マスタ';")
    expect(sql).toContain("COMMENT ON COLUMN M_CUSTOMER.customer_name IS '顧客名';")
    expect(sql).toContain('  order_no VARCHAR(20) NOT NULL,\n')
  })

  it('mysql: DECIMAL, DATETIME, COMMENT inline + COMMENT= bảng', () => {
    const sql = toDDL(defs, 'mysql')
    expect(sql).toContain("  customer_id DECIMAL(10) NOT NULL COMMENT '顧客ID',\n")
    expect(sql).toContain("  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL COMMENT '登録日時',\n")
    expect(sql).toContain(") COMMENT='顧客マスタ';")
    expect(sql).not.toContain('COMMENT ON')
  })

  it('oracle: VARCHAR2, NUMBER(10) cho INTEGER, CLOB, COMMENT ON', () => {
    const sql = toDDL(defs, 'oracle')
    expect(sql).toContain('  customer_name VARCHAR2(100) NOT NULL,')
    expect(sql).toContain('  line_no NUMBER(10) NOT NULL,')
    expect(sql).toContain("  note CLOB DEFAULT 'O''Brien',")
    expect(sql).toContain("COMMENT ON COLUMN T_ORDER.order_no IS '受注番号';")
  })

  it('sqlserver: DATETIME2, NVARCHAR(MAX) cho TEXT, không COMMENT', () => {
    const sql = toDDL(defs, 'sqlserver')
    expect(sql).toContain('  created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP NOT NULL,')
    expect(sql).toContain('  note NVARCHAR(MAX)')
    expect(sql).not.toMatch(/COMMENT/)
  })

  it('generic: golden TBL_CUSTOMER giữ (n) có sẵn, số có dấu phẩy nghìn', () => {
    const sql = toDDL(parseTableDefs(golden), 'generic')
    expect(sql).toBe(
      [
        '-- 顧客マスタ',
        'CREATE TABLE TBL_CUSTOMER (',
        '  cust_cd VARCHAR(10),',
        '  reg_date DATE,',
        '  disc_rate NUMERIC(5,2),',
        '  total NUMERIC DEFAULT 1234567.89',
        ');',
        '',
      ].join('\n')
    )
  })

  it('đầu vào lạ: định danh bọc theo dialect, escape nháy/`\\`/`*/`, kiểu không phải SQL thành VARCHAR + chú thích, bỏ cột trống / trùng', () => {
    const col = (o: Partial<TableDef['columns'][number]>) => ({ name: 'c', logical: '', type: 'INT', length: '', scale: '', pk: false, notNull: false, default: '', comment: '', line: 1, ...o })
    const def: TableDef = {
      source: '',
      tableName: 'order detail',
      logicalName: "it's\nx",
      line: 1,
      columns: [
        col({ name: 'order', pk: true }),
        col({ name: '顧客"名', type: '時刻', length: '8', logical: 'a\\b' }),
        col({ name: '', type: 'INT' }),
        col({ name: 'ORDER', type: 'INT' }),
        col({ name: 'x', type: 'VARCHAR2(10 BYTE)' }),
        col({ name: 'y', type: "INT); DROP TABLE t; --" }),
        col({ name: 'z', type: 'UUID', default: 'gen_random_uuid()' }),
        col({ name: 'w', type: '*/ evil /*' }),
      ],
    }
    const pg = toDDL([def], 'postgres')
    expect(pg).toContain('CREATE TABLE "order detail" (')
    expect(pg).toContain('  "order" INTEGER NOT NULL,')
    expect(pg).toContain('  "顧客""名" VARCHAR(8) /* 時刻 */,')
    expect(pg).toContain('  x VARCHAR(10),')
    expect(pg).toContain('  y VARCHAR(255) /* INT); DROP TABLE t; -- */,')
    expect(pg).toContain('  z UUID DEFAULT gen_random_uuid(),')
    expect(pg).toContain('  w VARCHAR(255) /* * / evil / * */,')
    expect(pg).toContain(`COMMENT ON TABLE "order detail" IS 'it''s x';`)
    expect(pg.match(/"order"|ORDER/g)).toHaveLength(2) // cột trùng "ORDER" bị bỏ
    const my = toDDL([def], 'mysql')
    expect(my).toContain('CREATE TABLE `order detail` (')
    expect(my).toContain("COMMENT 'a\\\\b'")
    expect(toDDL([def], 'sqlserver')).toContain('CREATE TABLE [order detail] (')
    expect(toDDL([def], 'oracle')).toContain('  x VARCHAR2(10 BYTE),')
    expect(toDDL([{ ...def, columns: [col({ name: ' ' })] }], 'generic')).toBe('')
  })

  it('quoteIdent chỉ bọc khi cần; schema.table an toàn giữ nguyên', () => {
    expect(quoteIdent('dbo.TBL_A', 'sqlserver')).toBe('dbo.TBL_A')
    expect(quoteIdent('user', 'postgres')).toBe('"user"')
    expect(quoteIdent('1col', 'mysql')).toBe('`1col`')
    expect(quoteIdent('a]b', 'sqlserver')).toBe('[a]]b]')
  })

  it('mọi dialect đều sinh CREATE TABLE cho cả 2 bảng', () => {
    for (const d of SQL_DIALECTS) expect(toDDL(defs, d).match(/^CREATE TABLE /gm), d).toHaveLength(2)
  })
})

describe('toErMermaid', () => {
  it('fixture: thực thể, thuộc tính PK/FK + tên logic, quan hệ FK suy ra; mermaid parse được', async () => {
    const er = toErMermaid(parseTableDefs(fixture))
    expect(er).toMatch(/^erDiagram\n/)
    expect(er).toContain('  M_CUSTOMER["M_CUSTOMER (顧客マスタ)"] {\n')
    expect(er).toContain('    NUMERIC(10) customer_id PK "顧客ID"\n')
    expect(er).toContain('    NUMERIC(12,2) credit_limit "与信額"\n')
    expect(er).toContain('    VARCHAR(20) order_no PK "受注番号"\n')
    expect(er).toContain('    NUMERIC(10) customer_id FK "顧客ID"\n')
    expect(er).toContain('  T_ORDER }o--|| M_CUSTOMER : "customer_id"\n')
    expect(er.match(/}o--\|\|/g)).toHaveLength(1)
    await mermaidParses(er)
  })

  it('tên tiếng Nhật / từ khóa / ký tự lạ thành định danh ASCII, sơ đồ vẫn hợp lệ', async () => {
    const md = [
      '### 社員マスタ',
      '| 物理名 | 論理名 | 型 | PK |',
      '|---|---|---|---|',
      '| 社員番号 | 社員"番号%\\ | 文字列 | ○ |',
      '| pk | x | 時刻 |  |',
      '| 1st-col | y | INT |  |',
      '| one | z | VARCHAR2(10 BYTE) |  |',
    ].join('\n')
    const er = toErMermaid(parseTableDefs(md))
    expect(er).toContain('  T_1["社員マスタ"] {')
    expect(er).toContain('    VARCHAR col_1 PK "社員 番号 / 社員番号"')
    expect(er).toContain('    unknown col_pk "x / pk"')
    expect(er).toContain('    INTEGER col_1st_col "y / 1st-col"')
    await mermaidParses(er)
  })

  it('FK theo tên <BẢNG>_ID (bỏ tiền tố M_), không nối PK đơn với PK đơn cùng tên', async () => {
    const md = [
      '## M_DEPT', '| 物理名 | 型 | PK |', '|---|---|---|', '| id | INT | ○ |',
      '## M_EMP', '| 物理名 | 型 | PK |', '|---|---|---|', '| id | INT | ○ |', '| dept_id | INT |  |',
    ].join('\n')
    const er = toErMermaid(parseTableDefs(md))
    expect(er.split('\n').filter((l) => l.includes('}o--||'))).toEqual(['  M_EMP }o--|| M_DEPT : "dept_id"'])
    await mermaidParses(er)
  })

  it('không bảng nào: chỉ "erDiagram"', () => {
    expect(toErMermaid([])).toBe('erDiagram\n')
  })
})

describe('toJson', () => {
  it('JSON đọc lại được, giữ đủ trường', () => {
    const defs = parseTableDefs(fixture, 'f.md')
    expect(JSON.parse(toJson(defs))).toEqual(defs)
  })
})
