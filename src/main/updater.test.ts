import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getVersion: () => '2.3.0' } }))

const { checkForUpdate, isNewer, RELEASES_URL } = await import('./updater')

describe('isNewer', () => {
  it('so major / minor / patch theo số, không theo chuỗi', () => {
    expect(isNewer('2.10.0', '2.9.9')).toBe(true)
    expect(isNewer('2.3.1', '2.3.0')).toBe(true)
    expect(isNewer('3.0.0', '2.99.99')).toBe(true)
    expect(isNewer('2.3.0', '2.3.0')).toBe(false)
    expect(isNewer('2.2.9', '2.3.0')).toBe(false)
  })

  it('chấp nhận tiền tố v; bản chính thức mới hơn pre-release cùng số', () => {
    expect(isNewer('v2.4.0', '2.3.0')).toBe(true)
    expect(isNewer('2.3.0', '2.3.0-beta.1')).toBe(true)
    expect(isNewer('2.3.0-beta.1', '2.3.0')).toBe(false)
  })

  it('chuỗi không phải semver -> false', () => {
    expect(isNewer('latest', '2.3.0')).toBe(false)
    expect(isNewer('2.4', '2.3.0')).toBe(false)
  })
})

describe('checkForUpdate', () => {
  afterEach(() => vi.unstubAllGlobals())

  const stub = (body: unknown, status = 200): void => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
  }

  it('có bản mới: trả version + trang release', async () => {
    stub({ tag_name: 'v2.4.0', html_url: `${RELEASES_URL}/tag/v2.4.0` })
    expect(await checkForUpdate()).toEqual({ latest: '2.4.0', url: `${RELEASES_URL}/tag/v2.4.0`, newer: true })
  })

  it('đang là bản mới nhất', async () => {
    stub({ tag_name: 'v2.3.0', html_url: `${RELEASES_URL}/tag/v2.3.0` })
    expect((await checkForUpdate()).newer).toBe(false)
  })

  it('link lạ (không thuộc repo) -> thay bằng trang releases', async () => {
    stub({ tag_name: 'v9.0.0', html_url: 'https://evil.example/x' })
    expect((await checkForUpdate()).url).toBe(RELEASES_URL)
  })

  it('HTTP lỗi hoặc tag hỏng -> throw', async () => {
    stub({}, 404)
    await expect(checkForUpdate()).rejects.toThrow('404')
    stub({ tag_name: 'nightly' })
    await expect(checkForUpdate()).rejects.toThrow()
  })
})
