import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeMdFiles } from './mdOutput'

describe('writeMdFiles', () => {
  it('từ chối ảnh có đường dẫn thoát khỏi thư mục xuất, chưa ghi file .md', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'x2m-out-'))
    const out = join(dir, 'out')
    const files = [{ name: 'a.md', text: 'x', images: [{ path: 'a_images/../../evil.bat', data: new Uint8Array([1]) }] }]
    await expect(writeMdFiles(out, files, () => {})).rejects.toThrow('Tên ảnh không hợp lệ')
    expect(existsSync(join(dir, 'evil.bat'))).toBe(false)
    expect(existsSync(join(out, 'a.md'))).toBe(false)
  })
})
