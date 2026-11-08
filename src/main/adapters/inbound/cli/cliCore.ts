/* CLI headless: cùng engine với app.
 * `node out/main/cli.js a.xlsx thuMuc/ -o outDir [tuỳ chọn]`  (Excel → Markdown)
 * `node out/main/cli.js md2xlsx a.md thuMuc/ -o Book.xlsx [--overwrite]`  (Markdown → Excel) */
import { existsSync, mkdirSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { DEFAULT_OPTIONS, type ConvertOptions } from '../../../../shared/types'
import { readWorkbook } from '../../outbound/xlsxFiles'
import { writeMdFiles } from '../../outbound/mdOutput'
import { listMarkdownFiles } from '../../outbound/mdFolder'
import { handleMdRequest } from '../worker/mdHandler'
import { convertSheetsInWorkbook, listSheetsInWorkbook } from '../../../domain/excel/converter'
import { workbookMdFiles } from '../../../domain/excel/output'
import { EXCEL_EXT_RE, isInsideDir } from '../../../domain/guards'

export const USAGE = `Dùng: cli <file.xlsx|thư mục...> -o <thư mục> [--per-workbook] [--range A1:F40] [--formulas]
          [--front-matter] [--chunk N] [--keep-del] [--keep-empty] [--no-escape] [--no-title]
     cli md2xlsx <file.md|thư mục...> -o <file.xlsx> [--overwrite]`

/** Quá số file Excel này trong một thư mục thì từ chối (chọn nhầm ổ đĩa không chạy mãi). */
export const EXCEL_DIR_LIMIT = 2000

/** Thư mục không quét khi mở rộng thư mục đầu vào (giống mdFolder: thư mục ẩn cũng bỏ). */
const SKIP_DIRS = new Set(['node_modules', 'bower_components', '$RECYCLE.BIN', 'System Volume Information'])

/** Mở rộng đối số đầu vào: thư mục → mọi file Excel bên trong (đệ quy, không theo symlink, bỏ `~$*`,
 * thư mục ẩn, node_modules), sắp theo đường dẫn. `relDir` là thư mục con (phân cách `/`) để giữ cấu trúc
 * ở đầu ra. Đối số không phải thư mục giữ nguyên (lỗi đọc báo theo từng file như trước). */
export async function expandExcelInputs(inputs: string[]): Promise<{ file: string; relDir: string }[]> {
  const out: { file: string; relDir: string }[] = []
  for (const input of inputs) {
    const isDir = await stat(input).then((s) => s.isDirectory(), () => false)
    if (!isDir) {
      out.push({ file: input, relDir: '' })
      continue
    }
    const found: string[] = []
    const queue = ['']
    while (queue.length > 0) {
      const rel = queue.shift() as string
      // Dirent của symlink không phải isDirectory/isFile -> không bao giờ theo symlink
      for (const e of await readdir(rel ? join(input, rel) : input, { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) {
          if (!e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) queue.push(childRel)
        } else if (e.isFile() && EXCEL_EXT_RE.test(e.name) && !e.name.startsWith('~$')) {
          if (found.length >= EXCEL_DIR_LIMIT) throw new Error(`Thư mục có quá ${EXCEL_DIR_LIMIT} file Excel: ${input}`)
          found.push(childRel)
        }
      }
    }
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
  options: ConvertOptions
}

/** Ném Error (thông báo tiếng Việt) khi đối số sai. */
export function parseArgs(argv: string[]): CliArgs {
  const options: ConvertOptions = { ...DEFAULT_OPTIONS }
  const files: string[] = []
  let outDir = ''
  let perWorkbook = false
  const value = (i: number, flag: string): string => {
    if (i + 1 >= argv.length) throw new Error('Thiếu giá trị cho ' + flag)
    return argv[i + 1]
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '-o': case '--out': outDir = value(i++, a); break
      case '--per-workbook': perWorkbook = true; break
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
  return { files, outDir, perWorkbook, options }
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
    log('LỖI: ' + (err instanceof Error ? err.message : String(err)))
    return 1
  }
}

/** Convert mọi sheet hiển thị của từng file (thư mục → mọi file Excel bên trong, giữ cấu trúc thư mục con).
 * `md2xlsx` ở đầu là chiều ngược lại. Trả về mã thoát (0 = ok, 1 = có file lỗi). */
export async function runCli(argv: string[], log: (s: string) => void = console.log): Promise<number> {
  if (argv[0] === 'md2xlsx') return runMd2Xlsx(argv.slice(1), log)
  const args = parseArgs(argv)
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
      mkdirSync(outDir, { recursive: true })
      await writeMdFiles(outDir, md, (name) => log(relDir ? `${relDir}/${name}` : name))
    } catch (err) {
      failed++
      log('LỖI ' + file + ': ' + (err instanceof Error ? err.message : String(err)))
    }
  }
  return failed > 0 ? 1 : 0
}
