/* Cài đặt của app (userData/store.json) và log lỗi (userData/logs/error.log). */
import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { appendLog } from './logFile'

function storePath(): string {
  return join(app.getPath('userData'), 'store.json')
}

/** Chưa có store -> {}; JSON hỏng -> {} (lần ghi sau thay file hỏng). Lỗi đọc khác (EBUSY/EPERM khi
 * antivirus giữ file) thì throw: ghi đè lúc đó sẽ xóa mất mọi cài đặt lẫn API key. */
async function readStoreStrict(): Promise<Record<string, unknown>> {
  let raw: string
  try {
    raw = await readFile(storePath(), 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
  try {
    const data: unknown = JSON.parse(raw)
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export async function readStore(): Promise<Record<string, unknown>> {
  return readStoreStrict().catch(() => ({}))
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
    const store = await readStoreStrict()
    mutate(store)
    await writeStore(store)
  })
  storeWriteChain = task.catch(() => undefined)
  return task
}

const LOG_MAX_BYTES = 512 * 1024

/** Thư mục log (userData/logs). */
export const logsDir = (): string => join(app.getPath('userData'), 'logs')

/** File log lỗi hiện tại. */
export const errorLogPath = (): string => join(logsDir(), 'error.log')

/** Ghi lỗi ra logs/error.log trong userData (quá 512KB thì chuyển sang error.1.log). Không bao giờ throw. */
export async function logError(scope: string, err: unknown): Promise<void> {
  try {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
    await appendLog(errorLogPath(), '[' + new Date().toISOString() + '] [' + scope + '] ' + msg + '\n', LOG_MAX_BYTES)
  } catch {
    /* logging không được làm crash app */
  }
}
