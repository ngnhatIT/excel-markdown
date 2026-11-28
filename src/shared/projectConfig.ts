/* Cấu hình dự án `x2m.json` (đặt trong thư mục tài liệu, đưa vào Git): tùy chọn convert chung cho cả đội và
 * luật nhận diện cộng thêm (nhãn 画面ID / 遷移, chữ mơ hồ, động từ CRUD, cột khóa khi so sánh).
 * File đến từ thư mục người khác gửi: chỉ nhận chuỗi thường (không regex), sai thì bỏ phần sai + cảnh báo, không throw.
 */
import { DEFAULT_OPTIONS, type ConvertOptions } from './types'
import type { CrudOp, ItemColumnRules, ItemField } from './specCore'

export const PROJECT_CONFIG_FILE = 'x2m.json'
export const PROJECT_CONFIG_MAX_BYTES = 256 * 1024
const ITEM_MAX_CHARS = 40
const LIST_MAX = 200
/** Cảnh báo tối đa: file đầy khóa lạ không làm phình giao diện */
const WARNINGS_MAX = 20

export interface ProjectRules {
  ambiguousWords: string[]
  screenIdLabels: string[]
  transitionLabels: string[]
  crudVerbs: Record<CrudOp, string[]>
  diffKeyColumns: string[]
  /** Tên cột 項目定義 của dự án theo vai trò (item / required / length / type / kind / default / note / check) */
  itemColumns: ItemColumnRules
}

export interface ProjectConfig {
  convert: Partial<ConvertOptions>
  rules: ProjectRules
}

export interface FoundProjectConfig {
  /** Đường dẫn tuyệt đối tới x2m.json */
  path: string
  config: ProjectConfig
  warnings: string[]
}

const CRUD_OPS: readonly CrudOp[] = ['C', 'R', 'U', 'D']
const ITEM_KEYS: readonly ItemField[] = ['item', 'required', 'length', 'type', 'kind', 'default', 'note', 'check']
const emptyItemColumns = (): ItemColumnRules => ({ item: [], required: [], length: [], type: [], kind: [], default: [], note: [], check: [] })
const LIST_KEYS = ['ambiguousWords', 'screenIdLabels', 'transitionLabels', 'diffKeyColumns'] as const

export const EMPTY_RULES: ProjectRules = {
  ambiguousWords: [],
  screenIdLabels: [],
  transitionLabels: [],
  crudVerbs: { C: [], R: [], U: [], D: [] },
  diffKeyColumns: [],
  itemColumns: emptyItemColumns(),
}

/** Dạng so khớp của một mục luật (cũng là dạng lưu): NFKC + chữ thường + bỏ khoảng trắng hai đầu. */
export const normRule = (s: string): string => s.normalize('NFKC').toLowerCase().trim()

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Giá trị hợp lệ của từng khóa convert; `range` không cho phép (vùng ô là theo từng file). */
const CONVERT_CHECK: { [K in Exclude<keyof ConvertOptions, 'range'>]-?: (v: unknown) => boolean } = {
  includeSheetTitle: (v) => typeof v === 'boolean',
  skipDelSheets: (v) => typeof v === 'boolean',
  skipEmptySheets: (v) => typeof v === 'boolean',
  multiline: (v) => v === 'br' || v === 'space',
  detectTwoColTables: (v) => typeof v === 'boolean',
  escapeMarkdown: (v) => typeof v === 'boolean',
  showFormulas: (v) => typeof v === 'boolean',
  frontMatter: (v) => typeof v === 'boolean',
  chunkRows: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100_000,
  verticalMerge: (v) => v === 'repeat' || v === 'empty' || v === 'ditto',
  alignTables: (v) => typeof v === 'boolean',
}

function parseList(v: unknown, where: string, warnings: string[]): string[] {
  if (!Array.isArray(v)) {
    warnings.push(`${where}: phải là mảng chuỗi, bỏ qua`)
    return []
  }
  const out: string[] = []
  let capped = false
  v.forEach((item, i) => {
    const s = typeof item === 'string' ? normRule(item) : ''
    if (typeof item !== 'string') warnings.push(`${where}[${i}]: không phải chuỗi, bỏ qua`)
    else if (s === '') warnings.push(`${where}[${i}]: chuỗi rỗng, bỏ qua`)
    else if (s.length > ITEM_MAX_CHARS) warnings.push(`${where}[${i}]: quá ${ITEM_MAX_CHARS} ký tự, bỏ qua`)
    else if (out.includes(s)) return
    else if (out.length < LIST_MAX) out.push(s)
    else capped = true
  })
  if (capped) warnings.push(`${where}: quá ${LIST_MAX} mục, chỉ giữ ${LIST_MAX} mục đầu`)
  return out
}

/** Đọc nội dung x2m.json. Không bao giờ throw: phần sai bị bỏ, kèm cảnh báo tiếng Việt có tên khóa (tối đa WARNINGS_MAX). */
export function parseProjectConfig(text: string): { config: ProjectConfig; warnings: string[] } {
  const r = parseAll(text)
  if (r.warnings.length <= WARNINGS_MAX) return r
  const more = r.warnings.length - WARNINGS_MAX
  return { config: r.config, warnings: [...r.warnings.slice(0, WARNINGS_MAX), `…và ${more} cảnh báo khác`] }
}

function parseAll(text: string): { config: ProjectConfig; warnings: string[] } {
  const warnings: string[] = []
  const rules: ProjectRules = { ...EMPTY_RULES, crudVerbs: { C: [], R: [], U: [], D: [] }, itemColumns: emptyItemColumns() }
  const config: ProjectConfig = { convert: {}, rules }
  let data: unknown
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch {
    return { config, warnings: ['x2m.json không phải JSON hợp lệ, bỏ qua cả file'] }
  }
  if (!isObj(data)) return { config, warnings: ['x2m.json phải là một object JSON, bỏ qua cả file'] }

  for (const key of Object.keys(data)) if (key !== 'convert' && key !== 'rules') warnings.push(`${key}: khóa không dùng, bỏ qua`)

  if (data.convert !== undefined) {
    if (!isObj(data.convert)) warnings.push('convert: phải là object, bỏ qua')
    else {
      const convert: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(data.convert)) {
        if (k === 'range') warnings.push('convert.range: vùng ô theo từng file, không đặt trong cấu hình dự án')
        else if (!(k in CONVERT_CHECK)) warnings.push(`convert.${k}: khóa không dùng, bỏ qua`)
        else if (!CONVERT_CHECK[k as keyof typeof CONVERT_CHECK](v)) {
          warnings.push(`convert.${k}: giá trị không hợp lệ (mặc định ${JSON.stringify(DEFAULT_OPTIONS[k as keyof ConvertOptions])}), bỏ qua`)
        } else convert[k] = v
      }
      config.convert = convert as Partial<ConvertOptions>
    }
  }

  if (data.rules !== undefined) {
    if (!isObj(data.rules)) warnings.push('rules: phải là object, bỏ qua')
    else {
      for (const [k, v] of Object.entries(data.rules)) {
        if ((LIST_KEYS as readonly string[]).includes(k)) rules[k as (typeof LIST_KEYS)[number]] = parseList(v, `rules.${k}`, warnings)
        else if (k === 'crudVerbs') {
          if (!isObj(v)) warnings.push('rules.crudVerbs: phải là object { "C": [...], "R": [...], "U": [...], "D": [...] }, bỏ qua')
          else
            for (const [op, list] of Object.entries(v)) {
              if ((CRUD_OPS as readonly string[]).includes(op)) rules.crudVerbs[op as CrudOp] = parseList(list, `rules.crudVerbs.${op}`, warnings)
              else warnings.push(`rules.crudVerbs.${op}: chỉ nhận C / R / U / D, bỏ qua`)
            }
        } else if (k === 'itemColumns') {
          if (!isObj(v)) warnings.push('rules.itemColumns: phải là object { "item": [...], "required": [...], "length": [...], ... }, bỏ qua')
          else
            for (const [f, list] of Object.entries(v)) {
              if ((ITEM_KEYS as readonly string[]).includes(f)) rules.itemColumns[f as ItemField] = parseList(list, `rules.itemColumns.${f}`, warnings)
              else warnings.push(`rules.itemColumns.${f}: chỉ nhận ${ITEM_KEYS.join(' / ')}, bỏ qua`)
            }
        } else warnings.push(`rules.${k}: khóa không dùng, bỏ qua`)
      }
    }
  }
  return { config, warnings }
}
