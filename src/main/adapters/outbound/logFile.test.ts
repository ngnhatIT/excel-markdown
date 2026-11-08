import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appendLog, previousLogPath, readLogTail } from './logFile'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'x2m-log-'))

describe('appendLog', () => {
  it('tạo thư mục + file, ghi nối tiếp', async () => {
    const f = join(tmp(), 'logs', 'error.log')
    await appendLog(f, 'a\n', 100)
    await appendLog(f, 'b\n', 100)
    expect(readFileSync(f, 'utf-8')).toBe('a\nb\n')
  })

  it('quá giới hạn: đổi tên thành error.1.log (thay bản cũ hơn), file mới chỉ có dòng mới', async () => {
    const dir = tmp()
    const f = join(dir, 'error.log')
    expect(previousLogPath(f)).toBe(join(dir, 'error.1.log'))
    writeFileSync(previousLogPath(f), 'rất cũ\n')
    writeFileSync(f, 'x'.repeat(200))
    await appendLog(f, 'mới\n', 100)
    expect(readFileSync(f, 'utf-8')).toBe('mới\n')
    expect(readFileSync(previousLogPath(f), 'utf-8')).toBe('x'.repeat(200))
  })

  it('chưa quá giới hạn: không xoay vòng', async () => {
    const f = join(tmp(), 'error.log')
    writeFileSync(f, 'x'.repeat(100))
    await appendLog(f, 'y', 100)
    expect(existsSync(previousLogPath(f))).toBe(false)
    expect(readFileSync(f, 'utf-8')).toBe('x'.repeat(100) + 'y')
  })
})

describe('readLogTail', () => {
  it('n dòng cuối; chưa có file -> rỗng', async () => {
    const f = join(tmp(), 'error.log')
    expect(await readLogTail(f, 2)).toBe('')
    writeFileSync(f, '1\n2\n3\n')
    expect(await readLogTail(f, 2)).toBe('2\n3')
  })
})
