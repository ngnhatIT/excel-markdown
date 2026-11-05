/* CLI headless: cùng engine với app. `node out/main/cli.js a.xlsx b.xlsx -o outDir [tuỳ chọn]` */
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { DEFAULT_OPTIONS, type ConvertOptions } from '../types'
import { convertWorkbook, listSheets } from './converter'
import { dedupeFileName, frontMatter, joinWorkbookMarkdown, safeFileName } from './output'

export const USAGE = `Dùng: cli <file.xlsx...> -o <thư mục> [--per-workbook] [--range A1:F40] [--formulas]
          [--front-matter] [--chunk N] [--keep-del] [--keep-empty] [--no-escape] [--no-title]`

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

/** Convert mọi sheet hiển thị của từng file. Trả về mã thoát (0 = ok, 1 = có file lỗi). */
export function runCli(argv: string[], log: (s: string) => void = console.log): number {
  const args = parseArgs(argv)
  mkdirSync(args.outDir, { recursive: true })
  const used = new Set<string>()
  let failed = 0
  for (const file of args.files) {
    const base = basename(file, extname(file))
    try {
      const names = listSheets(file, args.options.skipDelSheets).filter((s) => !s.hidden).map((s) => s.name)
      const sheets = convertWorkbook(file, names, args.options)
      const src = basename(file)
      const write = (name: string, text: string): void => {
        const out = dedupeFileName(safeFileName(name) + '.md', used)
        writeFileSync(join(args.outDir, out), text, 'utf-8')
        log(out)
      }
      if (args.perWorkbook) {
        if (sheets.length > 0) {
          const escape = args.options.escapeMarkdown !== false
          write(base, joinWorkbookMarkdown(base, sheets, escape, args.options.frontMatter ? src : undefined))
        }
      } else {
        for (const s of sheets) {
          const fm = args.options.frontMatter
            ? frontMatter({ source: src, sheet: s.sheet, title: s.title, meta: s.meta })
            : ''
          write(base + '__' + s.sheet, fm + s.markdown + '\n')
        }
      }
    } catch (err) {
      failed++
      log('LỖI ' + file + ': ' + (err instanceof Error ? err.message : String(err)))
    }
  }
  return failed > 0 ? 1 : 0
}
