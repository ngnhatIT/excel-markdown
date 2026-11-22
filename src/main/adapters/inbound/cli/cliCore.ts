/* CLI headless: cùng engine với app.
 * `node out/main/cli.js a.xlsx thuMuc/ -o outDir [tuỳ chọn]`  (Excel → Markdown)
 * `node out/main/cli.js md2xlsx a.md thuMuc/ -o Book.xlsx [--overwrite]`  (Markdown → Excel) */
import { existsSync, mkdirSync } from 'node:fs'
import { stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { DEFAULT_OPTIONS, type ConvertOptions } from '../../../../shared/types'
import { parseTableDefs, SQL_DIALECTS, toAlterSql, toDDL, toErMermaid, toJson, type SqlDialect, type TableDef } from '../../../../shared/tableDef'
import { readWorkbook } from '../../outbound/xlsxFiles'
import { writeMdFiles } from '../../outbound/mdOutput'
import { workbookMarkdownForDiff } from '../../outbound/workbookText'
import { listMarkdownFiles, readMarkdownFile, readMarkdownFolder, walkFiles } from '../../outbound/mdFolder'
import { buildSpecIndex, crudMatrix, crudText, impactOf, type ImpactResult, type SpecIndex, type SpecIssue } from '../../../../shared/specIndex'
import { handleMdRequest } from '../worker/mdHandler'
import { buildMockScreens, mockPageHtml } from '../../../../shared/mockScreen'
import { buildQaRows, QA_LANGS, qaLang, qaTable, type QaLang } from '../../../../shared/qaSheet'
import { tableText } from '../../../../shared/specIndex'
import { convertSheetsInWorkbook, listSheetsInWorkbook } from '../../../domain/excel/converter'
import { workbookMdFiles } from '../../../domain/excel/output'
import { EXCEL_EXT_RE, isInsideDir, isOpenableDirectory } from '../../../domain/guards'
import { friendlyError } from '../../../domain/errors'
import { findProjectConfig } from '../../outbound/projectConfigFile'
import type { FoundProjectConfig } from '../../../../shared/projectConfig'
import pkg from '../../../../../package.json'

export const USAGE = `Dùng: cli <file.xlsx|thư mục...> -o <thư mục> [--per-workbook] [--range A1:F40] [--formulas]
          [--front-matter] [--chunk N] [--keep-del] [--keep-empty] [--no-escape] [--no-title] [--no-clobber]
          [--no-config]   (mặc định dùng x2m.json tìm từ thư mục -o lên trên; cờ dòng lệnh áp lên trên nó)
     cli md2xlsx <file.md|thư mục...> -o <file.xlsx> [--overwrite]
     cli textconv <file.xlsx>   (in Markdown ra stdout, dùng làm git diff driver)
     cli ddl <file.md|thư mục|file.xlsx...> [--dialect generic|postgres|mysql|oracle|sqlserver]
          [--format sql|json|mermaid] [-o out.sql]   (テーブル定義書 → DDL / JSON / ER; không -o thì in ra stdout)
     cli migrate <bản cũ> <bản mới> [--dialect ...] [-o out.sql]   (ALTER TABLE từ テーブル定義 cũ → mới; mỗi bản là
          file .md / Excel / thư mục; dòng "-- 要確認" cần người quyết)
     cli mock <file.md|thư mục|file.xlsx...> -o mock.html [--title ...]   (mock màn hình HTML từ 項目定義;
          mở bằng trình duyệt, không cần app)
     cli qa <thư mục> [--lang ja|vi|en] [--format tsv|md] [--spec-only] [-o out.tsv]   (質問票: câu hỏi gửi khách
          từ 整合性チェック, ô CRUD ?, màn hình không có 項目定義; không -o thì in ra stdout)
     cli impact <thư mục> <bảng|TBL.COL|cột|画面ID|画面名>   (影響調査: tài liệu / màn hình bị ảnh hưởng)
     cli lint <thư mục>   (整合性チェック: 画面ID / bảng trùng, 遷移 treo, TBL.COL không có; lỗi -> mã thoát 1;
          cảnh báo: cách viết mơ hồ など/TBD/未定..., cột cùng tên khác kiểu / 桁数)
     cli crud <thư mục> [--format md|tsv]   (CRUD図 画面 × テーブル, in ra stdout)
     cli --help | --version
  Mặc định file .md đã có bị ghi đè; --no-clobber: bỏ qua workbook có file .md / thư mục ảnh đầu ra đã tồn tại.`

/** Quá số file Excel này trong một thư mục thì từ chối (chọn nhầm ổ đĩa không chạy mãi). */
export const EXCEL_DIR_LIMIT = 2000

/** Mở rộng đối số đầu vào: thư mục → mọi file Excel bên trong (walkFiles: đệ quy, không theo symlink, bỏ .git / .vscode...,
 * node_modules, thư mục con không đọc được; ở đây bỏ thêm `~$*`), sắp theo đường dẫn. `relDir` là thư mục con (phân cách
 * `/`) để giữ cấu trúc ở đầu ra. Đối số không phải thư mục giữ nguyên (lỗi đọc báo theo từng file như trước). */
export async function expandExcelInputs(inputs: string[]): Promise<{ file: string; relDir: string }[]> {
  const out: { file: string; relDir: string }[] = []
  for (const input of inputs) {
    const isDir = await stat(input).then((s) => s.isDirectory(), () => false)
    if (!isDir) {
      out.push({ file: input, relDir: '' })
      continue
    }
    const { files: found, truncated } = await walkFiles(input, (name) => EXCEL_EXT_RE.test(name) && !name.startsWith('~$'), EXCEL_DIR_LIMIT)
    if (truncated) throw new Error(`Thư mục có quá ${EXCEL_DIR_LIMIT} file Excel: ${input}`)
    // So sánh theo mã ký tự (không theo locale) để thứ tự giống nhau trên mọi máy
    found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    for (const rel of found) {
      const i = rel.lastIndexOf('/')
      out.push({ file: join(input, rel), relDir: i < 0 ? '' : rel.slice(0, i) })
    }
  }
  return out
}

export interface CliArgs {
  files: string[]
  outDir: string
  perWorkbook: boolean
  /** Bỏ qua workbook có đầu ra đã tồn tại (mặc định ghi đè, giữ tương thích) */
  noClobber: boolean
  /** Bỏ qua x2m.json */
  noConfig: boolean
  options: ConvertOptions
}

/** Ném Error (thông báo tiếng Việt) khi đối số sai. `base`: tùy chọn xuất phát (mặc định + x2m.json); cờ áp lên trên. */
export function parseArgs(argv: string[], base: ConvertOptions = DEFAULT_OPTIONS): CliArgs {
  const options: ConvertOptions = { ...base }
  const files: string[] = []
  let outDir = ''
  let perWorkbook = false
  let noClobber = false
  let noConfig = false
  const value = (i: number, flag: string): string => {
    if (i + 1 >= argv.length) throw new Error('Thiếu giá trị cho ' + flag)
    return argv[i + 1]
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '-o': case '--out': outDir = value(i++, a); break
      case '--per-workbook': perWorkbook = true; break
      case '--no-clobber': noClobber = true; break
      case '--no-config': noConfig = true; break
      case '--range': options.range = value(i++, a); break
      case '--formulas': options.showFormulas = true; break
      case '--front-matter': options.frontMatter = true; break
      case '--chunk': {
        const n = Number(value(i++, a))
        if (!Number.isInteger(n) || n < 0) throw new Error('--chunk phải là số nguyên >= 0')
        options.chunkRows = n
        break
      }
      case '--keep-del': options.skipDelSheets = false; break
      case '--keep-empty': options.skipEmptySheets = false; break
      case '--no-escape': options.escapeMarkdown = false; break
      case '--no-title': options.includeSheetTitle = false; break
      default:
        if (a.startsWith('-')) throw new Error('Tuỳ chọn không hợp lệ: ' + a)
        files.push(a)
    }
  }
  if (files.length === 0) throw new Error('Chưa có file Excel nào')
  if (!outDir) throw new Error('Thiếu -o <thư mục>')
  return { files, outDir, perWorkbook, noClobber, noConfig, options }
}

/** Markdown → Excel: gộp các file .md (thư mục → mọi .md bên trong, sắp theo đường dẫn) thành một .xlsx.
 * File đích đã có thì từ chối nếu không có `overwrite`. Ném Error tiếng Việt khi lỗi; chưa ghi gì nếu đọc lỗi. */
export async function buildExcel(inputs: string[], outPath: string, overwrite: boolean): Promise<{ outPath: string; sheets: string[] }> {
  const files: string[] = []
  for (const input of inputs) {
    const abs = resolve(input)
    if (await stat(abs).then((s) => s.isDirectory(), () => false)) {
      const { files: rel, truncated } = await listMarkdownFiles(abs)
      if (truncated) throw new Error('Thư mục có quá nhiều file Markdown: ' + input)
      files.push(...rel.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((r) => join(abs, r)))
    } else files.push(abs)
  }
  if (files.length === 0) throw new Error('Không có file Markdown nào để gộp')
  const out = resolve(outPath)
  if (!overwrite && existsSync(out)) throw new Error('File đã tồn tại (dùng --overwrite / overwrite: true để ghi đè): ' + out)
  // mdHandler kiểm đuôi .md/.xlsx, ghi `.partial` rồi đổi tên; exceljs chỉ nạp động bên trong
  const res = await handleMdRequest({ id: 0, type: 'mdToXlsx', files, outPath: out })
  if (!res.ok) throw new Error(res.error)
  return res.data as { outPath: string; sheets: string[] }
}

export type TableDefFormat = 'sql' | 'json' | 'mermaid'
export const TABLE_DEF_FORMATS: readonly TableDefFormat[] = ['sql', 'json', 'mermaid']

/** Mọi テーブル定義 trong các đầu vào: file .md, thư mục (mọi .md bên trong, theo thứ tự đường dẫn), file Excel
 * (convert trong bộ nhớ như textconv). `source` là tên file (đường dẫn tương đối với thư mục). */
export async function collectTableDefs(inputs: string[]): Promise<TableDef[]> {
  const defs: TableDef[] = []
  for (const input of inputs) {
    const abs = resolve(input)
    if (await stat(abs).then((s) => s.isDirectory(), () => false)) {
      const { files, truncated } = await listMarkdownFiles(abs)
      if (truncated) throw new Error('Thư mục có quá nhiều file Markdown: ' + input)
      for (const rel of files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) defs.push(...parseTableDefs(await readMarkdownFile(join(abs, rel)), rel))
    } else if (EXCEL_EXT_RE.test(abs)) defs.push(...parseTableDefs(workbookMarkdownForDiff(abs), basename(abs)))
    else if (/\.(md|markdown)$/i.test(abs)) defs.push(...parseTableDefs(await readMarkdownFile(abs), basename(abs)))
    else throw new Error('Chỉ nhận file .md / Excel hoặc thư mục: ' + input)
  }
  return defs
}

/** Kết quả theo định dạng: sql (DDL theo dialect), json, mermaid (erDiagram). */
export function renderTableDefs(defs: TableDef[], format: TableDefFormat, dialect: SqlDialect): string {
  return format === 'json' ? toJson(defs) : format === 'mermaid' ? toErMermaid(defs) : toDDL(defs, dialect)
}

/** ALTER TABLE từ テーブル定義 của bản cũ sang bản mới; không có thay đổi thì in chú thích, mã 0. */
async function runMigrate(argv: string[], log: (s: string) => void): Promise<number> {
  const inputs: string[] = []
  let dialect: SqlDialect = 'generic'
  let outPath = ''
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = (): string => {
      if (i + 1 >= argv.length) throw new Error('Thiếu giá trị cho ' + a)
      return argv[++i]
    }
    if (a === '-o' || a === '--out') outPath = value()
    else if (a === '--dialect') {
      const v = value() as SqlDialect
      if (!SQL_DIALECTS.includes(v)) throw new Error(`--dialect phải là một trong: ${SQL_DIALECTS.join(', ')}`)
      dialect = v
    } else if (a.startsWith('-')) throw new Error('Tuỳ chọn không hợp lệ: ' + a)
    else inputs.push(a)
  }
  if (inputs.length !== 2) throw new Error('Dùng: cli migrate <bản cũ> <bản mới> [--dialect ...] [-o out.sql]')
  let oldDefs: TableDef[]
  let newDefs: TableDef[]
  try {
    ;[oldDefs, newDefs] = await Promise.all([collectTableDefs([inputs[0]]), collectTableDefs([inputs[1]])])
  } catch (err) {
    process.stderr.write('LỖI: ' + friendlyError(err) + '\n')
    return 1
  }
  if (oldDefs.length + newDefs.length === 0) {
    process.stderr.write('Không tìm thấy テーブル定義 nào ở cả hai bản (cần bảng có cột 物理名 và 型)\n')
    return 1
  }
  const text = toAlterSql(oldDefs, newDefs, dialect) || '-- テーブル定義に変更なし\n'
  if (!outPath) {
    process.stdout.write(text)
    return 0
  }
  await writeFile(resolve(outPath), text, 'utf-8')
  log(`${resolve(outPath)} (bản cũ ${oldDefs.length} bảng, bản mới ${newDefs.length} bảng)`)
  return 0
}

/** Mock màn hình: mọi tài liệu đầu vào thành một trang HTML đứng riêng. */
async function runMock(argv: string[], log: (s: string) => void): Promise<number> {
  const inputs: string[] = []
  let outPath = ''
  let title = ''
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = (): string => {
      if (i + 1 >= argv.length) throw new Error('Thiếu giá trị cho ' + a)
      return argv[++i]
    }
    if (a === '-o' || a === '--out') outPath = value()
    else if (a === '--title') title = value()
    else if (a.startsWith('-')) throw new Error('Tuỳ chọn không hợp lệ: ' + a)
    else inputs.push(a)
  }
  if (inputs.length === 0 || !outPath) throw new Error('Dùng: cli mock <file.md|thư mục|file.xlsx...> -o mock.html [--title ...]')
  const docs: { rel: string; text: string }[] = []
  try {
    for (const input of inputs) {
      const abs = resolve(input)
      if (await stat(abs).then((s) => s.isDirectory(), () => false)) {
        const { files } = await listMarkdownFiles(abs)
        docs.push(...((await readMarkdownFolder(abs, files)) ?? []))
      } else if (EXCEL_EXT_RE.test(abs)) docs.push({ rel: basename(abs), text: workbookMarkdownForDiff(abs) })
      else if (/\.(md|markdown)$/i.test(abs)) docs.push({ rel: basename(abs), text: await readMarkdownFile(abs) })
      else throw new Error('Chỉ nhận file .md / Excel hoặc thư mục: ' + input)
    }
  } catch (err) {
    process.stderr.write('LỖI: ' + friendlyError(err) + '\n')
    return 1
  }
  const screens = buildMockScreens(docs)
  if (screens.length === 0) {
    process.stderr.write('Không tìm thấy màn hình nào (cần dòng meta 画面ID)\n')
    return 1
  }
  await writeFile(resolve(outPath), mockPageHtml(screens, title || basename(resolve(inputs[0])).replace(/\.[^.]+$/, '')), 'utf-8')
  log(`${resolve(outPath)} (${screens.length} màn hình)`)
  return 0
}

/** 質問票 của thư mục: TSV (dán vào mẫu Excel) hoặc Markdown. */
async function runQa(argv: string[], log: (s: string) => void): Promise<number> {
  const inputs: string[] = []
  let lang: QaLang | '' = ''
  let format: 'tsv' | 'md' = 'tsv'
  let specOnly = false
  let outPath = ''
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = (): string => {
      if (i + 1 >= argv.length) throw new Error('Thiếu giá trị cho ' + a)
      return argv[++i]
    }
    if (a === '-o' || a === '--out') outPath = value()
    else if (a === '--lang') {
      const v = value() as QaLang
      if (!QA_LANGS.includes(v)) throw new Error(`--lang phải là một trong: ${QA_LANGS.join(', ')}`)
      lang = v
    } else if (a === '--format') {
      const v = value()
      if (v !== 'tsv' && v !== 'md') throw new Error('--format phải là tsv hoặc md')
      format = v
    } else if (a === '--spec-only') specOnly = true
    else if (a.startsWith('-')) throw new Error('Tuỳ chọn không hợp lệ: ' + a)
    else inputs.push(a)
  }
  if (inputs.length !== 1) throw new Error('Dùng: cli qa <thư mục> [--lang ja|vi|en] [--format tsv|md] [--spec-only] [-o out]')
  let index: SpecIndex
  try {
    index = await loadSpecIndex(resolve(inputs[0]))
  } catch (err) {
    process.stderr.write('LỖI: ' + friendlyError(err) + '\n')
    return 1
  }
  const l = lang || qaLang(index)
  const rows = buildQaRows(index, l).filter((r) => !specOnly || r.category === 'spec').map((r, k) => ({ ...r, no: k + 1 }))
  const text = tableText(qaTable(rows, l), format)
  if (!outPath) {
    process.stdout.write(text)
    return 0
  }
  await writeFile(resolve(outPath), format === 'tsv' ? '\uFEFF' + text : text, 'utf-8')
  log(`${resolve(outPath)} (${rows.length} câu hỏi)`)
  return 0
}

async function runDdl(argv: string[], log: (s: string) => void): Promise<number> {
  const inputs: string[] = []
  let dialect: SqlDialect = 'generic'
  let format: TableDefFormat = 'sql'
  let outPath = ''
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = (): string => {
      if (i + 1 >= argv.length) throw new Error('Thiếu giá trị cho ' + a)
      return argv[++i]
    }
    if (a === '-o' || a === '--out') outPath = value()
    else if (a === '--dialect') {
      const v = value() as SqlDialect
      if (!SQL_DIALECTS.includes(v)) throw new Error(`--dialect phải là một trong: ${SQL_DIALECTS.join(', ')}`)
      dialect = v
    } else if (a === '--format') {
      const v = value() as TableDefFormat
      if (!TABLE_DEF_FORMATS.includes(v)) throw new Error(`--format phải là một trong: ${TABLE_DEF_FORMATS.join(', ')}`)
      format = v
    } else if (a.startsWith('-')) throw new Error('Tuỳ chọn không hợp lệ: ' + a)
    else inputs.push(a)
  }
  if (inputs.length === 0) throw new Error('Chưa có file .md / Excel / thư mục nào')
  let defs: TableDef[]
  try {
    defs = await collectTableDefs(inputs)
  } catch (err) {
    process.stderr.write('LỖI: ' + friendlyError(err) + '\n')
    return 1
  }
  if (defs.length === 0) {
    process.stderr.write('Không tìm thấy テーブル定義 nào (cần bảng có cột 物理名 và 型)\n')
    return 1
  }
  const text = renderTableDefs(defs, format, dialect)
  if (!outPath) {
    // stdout chỉ chứa kết quả (dùng được với `>` / pipe)
    process.stdout.write(text)
    return 0
  }
  await writeFile(resolve(outPath), text, 'utf-8')
  log(`${resolve(outPath)} (${defs.length} bảng)`)
  return 0
}

/** Dòng báo cấu hình dự án đang áp dụng (CLI + MCP): `CẤU HÌNH <đường dẫn>` + mỗi cảnh báo một dòng. */
export function configNote(found: Pick<FoundProjectConfig, 'path' | 'warnings'> | null | undefined): string[] {
  return found ? [`${CONFIG_PREFIX}${found.path}`, ...found.warnings.map((w) => `${CONFIG_PREFIX}⚠ ${w}`)] : []
}
export const CONFIG_PREFIX = 'CẤU HÌNH '

/** Chỉ mục 影響調査 của thư mục (mọi .md bên trong, thứ tự như Đọc Markdown), kèm luật của x2m.json nếu có. */
export async function loadSpecIndex(root: string): Promise<SpecIndex> {
  if (!(await isOpenableDirectory(root))) throw new Error('Không phải thư mục đang tồn tại: ' + root)
  const { files } = await listMarkdownFiles(root)
  const found = await findProjectConfig(root)
  const project = found ? { path: found.path, warnings: found.warnings, rules: found.config.rules } : undefined
  return buildSpecIndex((await readMarkdownFolder(root, files)) ?? [], project)
}

const REASON: Record<string, string> = { definition: 'định nghĩa', reference: 'tham chiếu', transition: '遷移', related: 'liên quan' }

/** Báo cáo 影響調査 dạng chữ (CLI + MCP). */
export function formatImpact(query: string, r: ImpactResult): string {
  if (r.kind === 'none') return `Không tìm thấy bảng / cột / màn hình nào khớp "${query}".`
  const out = [`影響調査: ${r.targets.join(', ')} (${r.kind === 'table' ? 'bảng' : r.kind === 'column' ? 'cột' : 'màn hình'})`]
  if (r.screens.length > 0) {
    out.push('', 'Màn hình:')
    for (const s of r.screens) out.push(`  ${s.relation === 'direct' ? '*' : '~'} ${s.id}${s.name ? ' ' + s.name : ''}${s.relation === 'related' ? ' (liên quan qua 画面遷移)' : ''}`)
  }
  for (const g of r.groups) {
    out.push('', g.rel)
    for (const h of g.hits) out.push(`  ${h.line}: [${REASON[h.reason]}] ${h.snippet}`)
  }
  return out.join('\n') + '\n'
}

const ISSUE_TEXT: Record<SpecIssue['code'], (i: SpecIssue) => string> = {
  'duplicate-screen': (i) => `画面ID trùng: ${i.subject} (đã định nghĩa ở ${i.other?.rel}:${i.other?.line})`,
  'duplicate-table': (i) => `Bảng trùng: ${i.subject} (đã định nghĩa ở ${i.other?.rel}:${i.other?.line})`,
  'unknown-column': (i) => `Cột không có trong テーブル定義: ${i.subject}`,
  'dangling-transition': (i) => `画面遷移 tới màn hình chưa định nghĩa: ${i.subject}`,
  'ambiguous-term': (i) => `Cách viết mơ hồ cần chốt: 「${i.subject}」`,
  'column-mismatch': (i) => `Cột cùng tên khác kiểu / 桁数: ${i.subject} ${i.detail ?? ''} (đã định nghĩa ở ${i.other?.rel}:${i.other?.line})`,
  'item-length': (i) => `Hạng mục màn hình dài hơn cột DB: ${i.subject} 桁数 ${i.detail ?? ''} (cột ở ${i.other?.rel}:${i.other?.line})`,
}

/** Một dòng mỗi lỗi: `file:dòng: error|warning: nội dung` (dạng trình biên dịch, CI đọc được). */
export const formatIssues = (issues: SpecIssue[]): string[] => issues.map((i) => `${i.rel}:${i.line}: ${i.severity}: ${ISSUE_TEXT[i.code](i)}`)

async function runSpec(cmd: 'impact' | 'lint', argv: string[], log: (s: string) => void): Promise<number> {
  const bad = argv.find((a) => a.startsWith('-'))
  if (bad) throw new Error('Tuỳ chọn không hợp lệ: ' + bad)
  if (cmd === 'impact' ? argv.length !== 2 : argv.length !== 1) throw new Error(cmd === 'impact' ? 'Dùng: cli impact <thư mục> <truy vấn>' : 'Dùng: cli lint <thư mục>')
  if (cmd === 'impact' && (argv[1].trim() === '' || argv[1].length > 200)) throw new Error('Truy vấn phải có 1–200 ký tự')
  let index: SpecIndex
  try {
    index = await loadSpecIndex(resolve(argv[0]))
  } catch (err) {
    process.stderr.write('LỖI: ' + friendlyError(err) + '\n')
    return 1
  }
  for (const line of configNote(index.project)) process.stderr.write(line + '\n')
  if (cmd === 'impact') {
    const r = impactOf(index, argv[1])
    process.stdout.write(formatImpact(argv[1], r))
    return r.kind === 'none' ? 1 : 0
  }
  for (const line of formatIssues(index.issues)) log(line)
  const errors = index.issues.filter((i) => i.severity === 'error').length
  log(`${index.docCount} file, ${index.screens.length} màn hình, ${index.tables.length} bảng: ${errors} lỗi, ${index.issues.length - errors} cảnh báo`)
  return errors > 0 ? 1 : 0
}

export const CRUD_FORMATS = ['md', 'tsv'] as const
export type CrudFormat = (typeof CRUD_FORMATS)[number]

/** CRUD図 của thư mục: Markdown / TSV ra stdout (không có màn hình nào -> mã 1). */
async function runCrud(argv: string[]): Promise<number> {
  let format: CrudFormat = 'md'
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--format') {
      const v = argv[++i] as CrudFormat
      if (!CRUD_FORMATS.includes(v)) throw new Error(`--format phải là một trong: ${CRUD_FORMATS.join(', ')}`)
      format = v
    } else if (argv[i].startsWith('-')) throw new Error('Tuỳ chọn không hợp lệ: ' + argv[i])
    else rest.push(argv[i])
  }
  if (rest.length !== 1) throw new Error('Dùng: cli crud <thư mục> [--format md|tsv]')
  let index: SpecIndex
  try {
    index = await loadSpecIndex(resolve(rest[0]))
  } catch (err) {
    process.stderr.write('LỖI: ' + friendlyError(err) + '\n')
    return 1
  }
  for (const line of configNote(index.project)) process.stderr.write(line + '\n')
  if (index.screens.length === 0) {
    process.stderr.write('Không tìm thấy màn hình nào (cần meta 画面ID)\n')
    return 1
  }
  process.stdout.write(crudText(crudMatrix(index), format))
  return 0
}

async function runMd2Xlsx(argv: string[], log: (s: string) => void): Promise<number> {
  const inputs: string[] = []
  let outPath = ''
  let overwrite = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-o' || a === '--out') {
      if (i + 1 >= argv.length) throw new Error('Thiếu giá trị cho ' + a)
      outPath = argv[++i]
    } else if (a === '--overwrite') overwrite = true
    else if (a.startsWith('-')) throw new Error('Tuỳ chọn không hợp lệ: ' + a)
    else inputs.push(a)
  }
  if (inputs.length === 0) throw new Error('Chưa có file Markdown nào')
  if (!outPath) throw new Error('Thiếu -o <file.xlsx>')
  try {
    const res = await buildExcel(inputs, outPath, overwrite)
    log(`${res.outPath} (${res.sheets.length} sheet: ${res.sheets.join(', ')})`)
    return 0
  } catch (err) {
    log('LỖI: ' + friendlyError(err))
    return 1
  }
}

/** Tên file .md + thư mục ảnh (tương đối thư mục xuất) của một workbook. */
const outputNames = (md: { name: string; images?: { path: string }[] }[]): string[] => [
  ...new Set(md.flatMap((f) => [f.name, ...(f.images ?? []).map((i) => i.path.split('/')[0])])),
]

/** Convert mọi sheet hiển thị của từng file (thư mục → mọi file Excel bên trong, giữ cấu trúc thư mục con).
 * `md2xlsx` ở đầu là chiều ngược lại. Trả về mã thoát (0 = ok, 1 = có file lỗi). */
/** `note`: dòng báo x2m.json đang áp dụng (CLI: stderr, để stdout chỉ là danh sách file; MCP gom vào kết quả). */
export async function runCli(
  argv: string[],
  log: (s: string) => void = console.log,
  note: (s: string) => void = (s) => void process.stderr.write(s + '\n')
): Promise<number> {
  if (argv[0] === '--help' || argv[0] === '-h') {
    log(USAGE)
    return 0
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    log(pkg.version)
    return 0
  }
  if (argv[0] === 'md2xlsx') return runMd2Xlsx(argv.slice(1), log)
  if (argv[0] === 'ddl') return runDdl(argv.slice(1), log)
  if (argv[0] === 'migrate') return runMigrate(argv.slice(1), log)
  if (argv[0] === 'mock') return runMock(argv.slice(1), log)
  if (argv[0] === 'qa') return runQa(argv.slice(1), log)
  if (argv[0] === 'impact' || argv[0] === 'lint') return runSpec(argv[0], argv.slice(1), log)
  if (argv[0] === 'crud') return runCrud(argv.slice(1))
  if (argv[0] === 'textconv') {
    if (argv.length !== 2) throw new Error('Dùng: cli textconv <file.xlsx>')
    // stdout là nội dung diff: lỗi chỉ ra stderr, mã thoát khác 0
    let text: string
    try {
      text = workbookMarkdownForDiff(argv[1])
    } catch (err) {
      process.stderr.write('LỖI ' + argv[1] + ': ' + friendlyError(err) + '\n')
      return 1
    }
    process.stdout.write(text)
    return 0
  }
  // Parse lần đầu để biết -o, rồi parse lại từ tùy chọn của x2m.json (cờ dòng lệnh áp lên trên)
  const first = parseArgs(argv)
  const found = first.noConfig ? null : await findProjectConfig(resolve(first.outDir))
  const args = found ? parseArgs(argv, { ...DEFAULT_OPTIONS, ...found.config.convert }) : first
  for (const line of configNote(found)) note(line)
  const inputs = await expandExcelInputs(args.files)
  if (inputs.length === 0) throw new Error('Không có file Excel nào trong thư mục đầu vào')
  const root = resolve(args.outDir)
  mkdirSync(root, { recursive: true })
  // Khử trùng tên theo từng thư mục đầu ra
  const usedByDir = new Map<string, Set<string>>()
  let failed = 0
  for (const { file, relDir } of inputs) {
    const base = basename(file, extname(file))
    try {
      const outDir = relDir ? join(root, relDir) : root
      // relDir lấy từ tên thư mục trên đĩa, vẫn kiểm để chắc chắn không ghi ra ngoài -o
      if (relDir && !isInsideDir(root, outDir)) throw new Error('Thư mục con không hợp lệ: ' + relDir)
      if (!usedByDir.has(outDir)) usedByDir.set(outDir, new Set())
      // Đọc file một lần cho cả liệt kê sheet lẫn convert
      const wb = readWorkbook(file)
      const names = listSheetsInWorkbook(wb, args.options.skipDelSheets).filter((s) => !s.hidden).map((s) => s.name)
      const sheets = convertSheetsInWorkbook(wb, names, args.options)
      const md = workbookMdFiles(base, basename(file), sheets, args.options, args.perWorkbook, usedByDir.get(outDir) as Set<string>)
      if (args.noClobber) {
        const existing = outputNames(md).filter((n) => existsSync(join(outDir, n)))
        if (existing.length > 0) {
          log(`BỎ QUA ${file}: đã có ${existing.map((n) => (relDir ? `${relDir}/${n}` : n)).join(', ')}`)
          continue
        }
      }
      mkdirSync(outDir, { recursive: true })
      await writeMdFiles(outDir, md, (name) => log(relDir ? `${relDir}/${name}` : name))
    } catch (err) {
      failed++
      log('LỖI ' + file + ': ' + friendlyError(err))
    }
  }
  return failed > 0 ? 1 : 0
}
