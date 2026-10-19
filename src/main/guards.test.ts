import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isOpenableDirectory, isSafeExternalUrl, shouldAllowNavigation } from './guards'

describe('isSafeExternalUrl', () => {
  it('cho phép http/https/mailto', () => {
    expect(isSafeExternalUrl('https://example.com/a?b=1')).toBe(true)
    expect(isSafeExternalUrl('http://example.com')).toBe(true)
    expect(isSafeExternalUrl('mailto:a@example.com')).toBe(true)
  })

  it('chặn file:, javascript:, data:, scheme lạ và chuỗi không phải URL', () => {
    expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isSafeExternalUrl('file://server/share/仕様書.xlsx')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('data:text/html,<script>1</script>')).toBe(false)
    expect(isSafeExternalUrl('search-ms:query=x')).toBe(false)
    expect(isSafeExternalUrl('仕様書.xlsx')).toBe(false)
    expect(isSafeExternalUrl('')).toBe(false)
  })
})

describe('shouldAllowNavigation', () => {
  const prod = 'file:///C:/Program%20Files/ExcelToMarkdown/resources/app.asar/out/renderer/index.html'
  const dev = 'http://localhost:5173/'

  it('cho phép reload đúng trang hiện tại (bỏ qua hash)', () => {
    expect(shouldAllowNavigation(prod, prod)).toBe(true)
    expect(shouldAllowNavigation(prod + '#x', prod)).toBe(true)
    expect(shouldAllowNavigation(dev, dev)).toBe(true)
  })

  it('chặn link tương đối đã resolve, file:// khác, link ngoài', () => {
    expect(
      shouldAllowNavigation(
        'file:///C:/Program%20Files/ExcelToMarkdown/resources/app.asar/out/renderer/%E4%BB%95.xlsx',
        prod
      )
    ).toBe(false)
    expect(shouldAllowNavigation('file:///C:/Users/x/evil.html', prod)).toBe(false)
    expect(shouldAllowNavigation('http://localhost:5173/other.html', dev)).toBe(false)
    expect(shouldAllowNavigation('https://example.com', prod)).toBe(false)
  })

  it('chặn khi chưa biết URL hiện tại', () => {
    expect(shouldAllowNavigation('', '')).toBe(false)
  })
})

describe('isOpenableDirectory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'x2m-guard-'))
  const file = join(dir, 'run.bat')
  writeFileSync(file, 'echo hi')

  it('cho phép thư mục tồn tại', async () => {
    expect(await isOpenableDirectory(dir)).toBe(true)
  })

  it('chặn file (kể cả file thực thi), đường dẫn tương đối, không tồn tại, không phải string', async () => {
    expect(await isOpenableDirectory(file)).toBe(false)
    expect(await isOpenableDirectory('relative/dir')).toBe(false)
    expect(await isOpenableDirectory(join(dir, 'missing'))).toBe(false)
    expect(await isOpenableDirectory('')).toBe(false)
    expect(await isOpenableDirectory(42)).toBe(false)
  })
})
