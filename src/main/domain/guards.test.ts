import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import {
  imageMime,
  isExcelPath,
  isInsideDir,
  isMarkdownPath,
  isOpenableDirectory,
  isSafeExternalUrl,
  isTitleBarOnScreen,
  shouldAllowNavigation,
} from './guards'

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

describe('isMarkdownPath', () => {
  // Đường dẫn tuyệt đối theo hệ điều hành đang chạy test (CI chạy Linux, app chạy Windows)
  const abs = (name: string): string => join(tmpdir(), 'a', name)

  it('cho phép đường dẫn tuyệt đối đuôi .md/.markdown (không phân biệt hoa/thường)', () => {
    expect(isMarkdownPath(abs('b.md'))).toBe(true)
    expect(isMarkdownPath(abs('B.MARKDOWN'))).toBe(true)
  })

  it('chặn đường dẫn tương đối, đuôi khác, không phải string', () => {
    expect(isMarkdownPath('b.md')).toBe(false)
    expect(isMarkdownPath(abs('b.xlsx'))).toBe(false)
    expect(isMarkdownPath(1)).toBe(false)
  })
})

describe('isExcelPath', () => {
  const abs = (name: string): string => join(tmpdir(), 'a', name)

  it('cho phép đường dẫn tuyệt đối đuôi Excel', () => {
    for (const n of ['a.xlsx', 'a.XLSM', 'a.xls', 'a.xltx', 'a.xltm']) expect(isExcelPath(abs(n))).toBe(true)
  })

  it('chặn file khác (vd file text hệ thống), đường dẫn tương đối, không phải string', () => {
    expect(isExcelPath(abs('hosts'))).toBe(false)
    expect(isExcelPath(abs('a.txt'))).toBe(false)
    expect(isExcelPath('a.xlsx')).toBe(false)
    expect(isExcelPath(undefined)).toBe(false)
  })
})

describe('isInsideDir', () => {
  const root = join(tmpdir(), 'docs')

  it('file trong thư mục / thư mục con -> true', () => {
    expect(isInsideDir(root, join(root, 'a.png'))).toBe(true)
    expect(isInsideDir(root, join(root, 'img', 'sub', 'a.png'))).toBe(true)
  })

  it('chính thư mục, thoát ra bằng .., thư mục cùng tiền tố, đường dẫn tương đối -> false', () => {
    expect(isInsideDir(root, root)).toBe(false)
    expect(isInsideDir(root, join(root, '..', 'secret.png'))).toBe(false)
    expect(isInsideDir(root, root + '-other' + sep + 'a.png')).toBe(false)
    expect(isInsideDir(root, 'a.png')).toBe(false)
    expect(isInsideDir('docs', join(root, 'a.png'))).toBe(false)
  })
})

describe('imageMime', () => {
  it('ảnh theo đuôi (không phân biệt hoa thường)', () => {
    expect(imageMime('C:\a\b.PNG')).toBe('image/png')
    expect(imageMime('/a/b.jpeg')).toBe('image/jpeg')
    expect(imageMime('x.svg')).toBe('image/svg+xml')
  })

  it('không phải ảnh -> null', () => {
    for (const p of ['a.md', 'a.exe', 'a.png.lnk', 'noext', '.png.txt']) expect(imageMime(p)).toBeNull()
  })
})

describe('isTitleBarOnScreen', () => {
  const main = { x: 0, y: 0, width: 1920, height: 1040 }
  const win = { width: 1280, height: 820 }
  it('cửa sổ trên màn hình chính', () => {
    expect(isTitleBarOnScreen({ x: 100, y: 100, ...win }, [main])).toBe(true)
  })
  it('vị trí trên màn hình phụ đã rút -> không dùng', () => {
    expect(isTitleBarOnScreen({ x: 2200, y: 100, ...win }, [main])).toBe(false)
  })
  it('thanh tiêu đề ở trên mép màn hình -> không dùng', () => {
    expect(isTitleBarOnScreen({ x: 100, y: -500, ...win }, [main])).toBe(false)
  })
  it('chỉ lòi một mẩu nhỏ -> không dùng', () => {
    expect(isTitleBarOnScreen({ x: 1850, y: 100, ...win }, [main])).toBe(false)
  })
  it('màn hình phụ bên trái (tọa độ âm) vẫn dùng được', () => {
    expect(isTitleBarOnScreen({ x: -1500, y: 50, ...win }, [main, { x: -1920, y: 0, width: 1920, height: 1040 }])).toBe(true)
  })
})
