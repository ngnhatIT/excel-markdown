/* Cache workbook đã parse theo đường dẫn, kiểm tra lại mtime + size mỗi lần lấy.
 * Đổi sheet trong preview / convert ngay sau preview không phải parse lại cả file.
 * Generic + inject load/stat để test không cần file thật.
 */
import { statSync } from 'node:fs'
import { resolve } from 'node:path'

export interface CacheDeps<T> {
  load: (path: string) => T
  stat: (path: string) => { mtimeMs: number; size: number }
}

export class WorkbookCache<T> {
  private readonly entries = new Map<string, { version: string; value: T }>()

  constructor(
    private readonly max: number,
    private readonly deps: CacheDeps<T>
  ) {}

  /** Lấy workbook; parse lại nếu file đã đổi (mtime/size) hoặc chưa có trong cache.
   * Ném lỗi của stat/load (vd ENOENT) như đọc trực tiếp. */
  get(path: string): T {
    const key = resolve(path)
    const st = this.deps.stat(key)
    const version = st.mtimeMs + ':' + st.size
    const hit = this.entries.get(key)
    this.entries.delete(key)
    if (hit && hit.version === version) {
      this.entries.set(key, hit) // đưa lên cuối = dùng gần nhất
      return hit.value
    }
    const value = this.deps.load(key)
    this.entries.set(key, { version, value })
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    return value
  }

  get size(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }
}

/** Cache dùng stat thật của file system. */
export function createWorkbookCache<T>(max: number, load: (path: string) => T): WorkbookCache<T> {
  return new WorkbookCache(max, { load, stat: (p) => statSync(p) })
}
