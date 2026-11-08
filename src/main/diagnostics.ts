/* Phần thuần của menu Trợ giúp (test được không cần Electron): thông tin chẩn đoán, đặt lại cài đặt. */
import { isSecretStoreKey } from './adapters/outbound/llm/aiConfig'
import { redactApiKey } from './adapters/outbound/llm/shared'

export interface DiagnosticsInfo {
  version: string
  versions: { electron?: string; chrome?: string; node?: string }
  platform: string
  osRelease: string
  arch: string
  locale: string
  lang: unknown
  logTail: string
}

/** Văn bản dán vào báo lỗi; mọi API Key (cả trong log) bị che. */
export function diagnosticsText(d: DiagnosticsInfo): string {
  return redactApiKey(
    [
      `ExcelToMarkdown ${d.version}`,
      `Electron ${d.versions.electron ?? '?'} · Chrome ${d.versions.chrome ?? '?'} · Node ${d.versions.node ?? '?'}`,
      `OS: ${d.platform} ${d.osRelease} (${d.arch})`,
      `Locale: ${d.locale} · lang: ${typeof d.lang === 'string' ? d.lang : '(auto)'}`,
      '',
      '--- error.log (50 dòng cuối) ---',
      d.logTail || '(trống)',
    ].join('\n')
  )
}

/** Đặt lại cài đặt: xóa mọi khóa trừ API Key đã mã hóa và nhà cung cấp AI. */
export function resetSettings(store: Record<string, unknown>): void {
  for (const k of Object.keys(store)) {
    if (!isSecretStoreKey(k) && k !== 'aiProvider') delete store[k]
  }
}
