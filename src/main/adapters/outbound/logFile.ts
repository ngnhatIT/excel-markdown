/* Ghi / đọc file log (thuần Node, không cần Electron để test). store.ts quyết định thư mục log. */
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

/** error.log -> error.1.log (bản trước đó). */
export const previousLogPath = (file: string): string => file.replace(/(\.log)?$/, '.1.log')

/** Thêm `text` vào cuối `file`; file đã quá `maxBytes` thì đổi tên thành `.1.log` (ghi đè bản cũ hơn)
 * rồi bắt đầu file mới — giữ được log ngay trước lúc xoay vòng thay vì xóa trắng. */
export async function appendLog(file: string, text: string, maxBytes: number): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  try {
    if ((await stat(file)).size > maxBytes) await rename(file, previousLogPath(file))
  } catch {
    /* chưa có file log, hoặc đổi tên lỗi (file đang bị giữ): ghi tiếp vào file cũ */
  }
  await appendFile(file, text, 'utf-8')
}

/** `n` dòng cuối của file log (chưa có file -> ''). */
export async function readLogTail(file: string, n: number): Promise<string> {
  try {
    const lines = (await readFile(file, 'utf-8')).split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    return lines.slice(-n).join('\n')
  } catch {
    return ''
  }
}
