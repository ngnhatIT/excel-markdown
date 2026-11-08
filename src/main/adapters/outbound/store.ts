/* Cài đặt của app (userData/store.json) và log lỗi (userData/logs/error.log). */
import { app } from 'electron'
import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

function storePath(): string {
  return join(app.getPath('userData'), 'store.json')
}

export async function readStore(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(storePath(), 'utf-8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Ghi file tạm rồi đổi tên: tắt máy/crash giữa chừng không để lại store.json hỏng
 * (hỏng thì readStore trả {} và lần ghi sau xóa mất mọi cài đặt lẫn API key). */
async function writeStore(data: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(storePath()), { recursive: true })
  const tmp = storePath() + '.tmp'
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await rename(tmp, storePath())
}

// Chuỗi hóa mọi lần đọc-sửa-ghi store để hai lần ghi gần nhau không làm mất thay đổi của nhau.
let storeWriteChain: Promise<void> = Promise.resolve()

export function updateStore(mutate: (store: Record<string, unknown>) => void): Promise<void> {
  const task = storeWriteChain.then(async () => {
    const store = await readStore()
    mutate(store)
    await writeStore(store)
  })
  storeWriteChain = task.catch(() => undefined)
  return task
}

const LOG_MAX_BYTES = 512 * 1024

/** Ghi lỗi ra logs/error.log trong userData (xoay vòng khi > 512KB). Không bao giờ throw. */
export async function logError(scope: string, err: unknown): Promise<void> {
  try {
    const dir = join(app.getPath('userData'), 'logs')
    await mkdir(dir, { recursive: true })
    const p = join(dir, 'error.log')
    try {
      const st = await stat(p)
      if (st.size > LOG_MAX_BYTES) await writeFile(p, '', 'utf-8')
    } catch {
      /* chưa có file log */
    }
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
    await appendFile(p, '[' + new Date().toISOString() + '] [' + scope + '] ' + msg + '\n', 'utf-8')
  } catch {
    /* logging không được làm crash app */
  }
}
