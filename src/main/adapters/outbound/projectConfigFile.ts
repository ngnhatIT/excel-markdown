/* Tìm và đọc x2m.json: đi từ thư mục bắt đầu lên thư mục cha, dừng ở thư mục đầu tiên có x2m.json,
 * ở gốc repo (có `.git`) hoặc ở gốc ổ đĩa. Thuần Node để test bằng vitest. */
import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import {
  EMPTY_RULES,
  parseProjectConfig,
  PROJECT_CONFIG_FILE,
  PROJECT_CONFIG_MAX_BYTES,
  type FoundProjectConfig,
} from '../../../shared/projectConfig'

const exists = (p: string): Promise<boolean> => stat(p).then(() => true, () => false)
const isFile = (p: string): Promise<boolean> => stat(p).then((s) => s.isFile(), () => false)

const empty = (path: string, warning: string): FoundProjectConfig => ({
  path,
  config: { convert: {}, rules: EMPTY_RULES },
  warnings: [warning],
})

/** null nếu không có cấu hình (hoặc `startDir` không phải đường dẫn tuyệt đối). Không throw. */
export async function findProjectConfig(startDir: string): Promise<FoundProjectConfig | null> {
  if (typeof startDir !== 'string' || !isAbsolute(startDir)) return null
  for (let dir = startDir; ; dir = dirname(dir)) {
    const path = join(dir, PROJECT_CONFIG_FILE)
    if (await isFile(path)) {
      try {
        const st = await stat(path)
        if (st.size > PROJECT_CONFIG_MAX_BYTES) return empty(path, `x2m.json quá lớn (${st.size} byte, tối đa ${PROJECT_CONFIG_MAX_BYTES}), bỏ qua cả file`)
        return { path, ...parseProjectConfig(await readFile(path, 'utf-8')) }
      } catch (err) {
        return empty(path, `Không đọc được x2m.json (${(err as NodeJS.ErrnoException).code ?? 'lỗi'}), bỏ qua`)
      }
    }
    if ((await exists(join(dir, '.git'))) || dirname(dir) === dir) return null
  }
}
