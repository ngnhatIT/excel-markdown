import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findProjectConfig } from './projectConfigFile'

let tmp: string
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'x2m-cfg-'))
})
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true })
})

describe('findProjectConfig', () => {
  it('tìm ở thư mục cha', async () => {
    const repo = join(tmp, 'repo')
    await mkdir(join(repo, '.git'), { recursive: true })
    await mkdir(join(repo, 'a', 'b'), { recursive: true })
    await writeFile(join(repo, 'x2m.json'), '{"convert":{"frontMatter":true}}')
    const found = await findProjectConfig(join(repo, 'a', 'b'))
    expect(found?.path).toBe(join(repo, 'x2m.json'))
    expect(found?.config.convert).toEqual({ frontMatter: true })
    expect(found?.warnings).toEqual([])
  })

  it('dừng ở gốc repo (.git), không nhặt x2m.json bên ngoài repo', async () => {
    await writeFile(join(tmp, 'x2m.json'), '{}')
    const repo = join(tmp, 'repo')
    await mkdir(join(repo, 'docs'), { recursive: true })
    await writeFile(join(repo, '.git'), 'gitdir: ../elsewhere') // worktree: .git là file
    expect(await findProjectConfig(join(repo, 'docs'))).toBeNull()
  })

  it('x2m.json là thư mục thì bỏ qua và đi tiếp lên trên', async () => {
    const repo = join(tmp, 'repo')
    await mkdir(join(repo, '.git'), { recursive: true })
    await mkdir(join(repo, 'docs', 'x2m.json'), { recursive: true })
    await writeFile(join(repo, 'x2m.json'), '{}')
    expect((await findProjectConfig(join(repo, 'docs')))?.path).toBe(join(repo, 'x2m.json'))
  })

  it('file quá lớn -> cấu hình rỗng + cảnh báo', async () => {
    await mkdir(join(tmp, '.git'))
    await writeFile(join(tmp, 'x2m.json'), ' '.repeat(300 * 1024))
    const found = await findProjectConfig(tmp)
    expect(found?.config.convert).toEqual({})
    expect(found?.warnings).toHaveLength(1)
  })

  it.skipIf(process.platform === 'win32')('x2m.json là symlink -> không tính (không mở được file đích qua "Mở x2m.json")', async () => {
    await mkdir(join(tmp, '.git'))
    await writeFile(join(tmp, 'target.command'), '{}')
    await symlink(join(tmp, 'target.command'), join(tmp, 'x2m.json'))
    expect(await findProjectConfig(tmp)).toBeNull()
  })

  it('đường dẫn tương đối -> null', async () => {
    expect(await findProjectConfig('docs')).toBeNull()
  })
})
