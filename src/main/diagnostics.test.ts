import { describe, expect, it } from 'vitest'
import { diagnosticsText, resetSettings } from './diagnostics'

describe('diagnosticsText', () => {
  it('có phiên bản, OS, ngôn ngữ, log; API Key trong log bị che', () => {
    const s = diagnosticsText({
      version: '1.2.3',
      versions: { electron: '44.0.0', chrome: '140', node: '22' },
      platform: 'win32',
      osRelease: '10.0.26100',
      arch: 'x64',
      locale: 'ja-JP',
      lang: 'vi',
      logTail: 'lỗi gọi https://x/?key=AIzaSyA1234567890abcdefghijk và sk-ant-api03-abcdefghijklmnop',
    })
    expect(s).toContain('ExcelToMarkdown 1.2.3')
    expect(s).toContain('win32 10.0.26100 (x64)')
    expect(s).toContain('lang: vi')
    expect(s).not.toContain('AIzaSyA1234567890')
    expect(s).not.toContain('abcdefghijklmnop')
  })
})

describe('resetSettings', () => {
  it('giữ API Key đã mã hóa và nhà cung cấp AI, xóa phần còn lại', () => {
    const store: Record<string, unknown> = {
      aiApiKeyEnc: 'enc:a',
      aiApiKeyEnc_claude: 'enc:b',
      aiProvider: 'claude',
      aiModel: 'm',
      lang: 'ja',
      theme: 'dark',
      windowBounds: { width: 1 },
    }
    resetSettings(store)
    expect(store).toEqual({ aiApiKeyEnc: 'enc:a', aiApiKeyEnc_claude: 'enc:b', aiProvider: 'claude' })
  })
})
