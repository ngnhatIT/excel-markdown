/* Cache workbook đã parse theo đường dẫn, kiểm tra lại mtime + size mỗi lần lấy.
 * Đổi sheet trong preview / convert ngay sau preview không phải parse lại cả file.
 * Giới hạn theo số workbook VÀ tổng dung lượng file nguồn (workbook đã parse chiếm RAM gấp nhiều lần file);
 * workbook vừa dùng luôn được giữ dù một mình nó vượt ngân sách.
 * Generic + inject load/stat để test không cần file thật.
 */
import { statSync } from 'node:fs'
import { resolve } from 'node:path'

export interface CacheDeps<T> {
  load: (path: string) => T
  stat: (path: string) => { mtimeMs: number; size: number }
}

export class WorkbookCache<T> {
  private readonly entries = new Map<string, { version: string; value: T; bytes: number }>()
  private bytes = 0

  constructor(
    private readonly max: number,
    private readonly deps: CacheDeps<T>,
    /** Tổng dung lượng file nguồn tối đa (byte) */
    private readonly maxBytes = Infinity
  ) {}

  /** Lấy workbook; parse lại nếu file đã đổi (mtime/size) hoặc chưa có trong cache.
   * Ném lỗi của stat/load (vd ENOENT) như đọc trực tiếp. */
  get(path: string): T {
    const key = resolve(path)
    const st = this.deps.stat(key)
    const version = st.mtimeMs + ':' + st.size
    const hit = this.entries.get(key)
    if (hit) this.drop(key)
    if (hit && hit.version === version) {
      this.add(key, hit) // đưa lên cuối = dùng gần nhất
      return hit.value
    }
    const value = this.deps.load(key)
    this.add(key, { version, value, bytes: st.size })
    while (this.entries.size > this.max || (this.bytes > this.maxBytes && this.entries.size > 1)) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.drop(oldest)
    }
    return value
  }

  private add(key: string, e: { version: string; value: T; bytes: number }): void {
    this.entries.set(key, e)
    this.bytes += e.bytes
  }

  private drop(key: string): void {
    this.bytes -= this.entries.get(key)?.bytes ?? 0
    this.entries.delete(key)
  }

  get size(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
    this.bytes = 0
  }
}

/** Cache dùng stat thật của file system. */
export function createWorkbookCache<T>(max: number, load: (path: string) => T, maxBytes = Infinity): WorkbookCache<T> {
  return new WorkbookCache(max, { load, stat: (p) => statSync(p) }, maxBytes)
}
