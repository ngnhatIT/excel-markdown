/* Cấu hình trợ lý AI trong store.json: tên khóa lưu, chuẩn hóa giá trị, mã hóa API Key.
 * Thuần (safeStorage được truyền vào) để test được không cần Electron.
 */
import {
  AI_CONTEXT_LEVELS,
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  type AiConfigInfo,
  type AiModelId,
  type AiProvider,
} from '../../../../shared/types'
import { maskApiKey } from './shared'

/** Phần của Electron `safeStorage` mà app dùng. */
export interface SecretCipher {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

const KEY_PREFIX = 'aiApiKeyEnc'

// Gemini giữ khóa lưu cũ để key người dùng đã nhập vẫn dùng được sau khi nâng cấp
export const keyField = (p: AiProvider): string => (p === 'gemini' ? KEY_PREFIX : `${KEY_PREFIX}_${p}`)
export const modelField = (p: AiProvider): string => (p === 'gemini' ? 'aiModel' : `aiModel_${p}`)

/** Khóa store chứa API Key: renderer không được đọc/ghi qua `store:get` / `store:set`. */
export function isSecretStoreKey(key: unknown): boolean {
  return typeof key !== 'string' || key.startsWith(KEY_PREFIX)
}

export function encryptApiKey(rawKey: string, cipher: SecretCipher): string {
  const k = rawKey.trim()
  if (!k) return ''
  try {
    if (cipher.isEncryptionAvailable()) return 'enc:' + cipher.encryptString(k).toString('base64')
  } catch {
    /* fallback base64 khi OS không có keyring */
  }
  return 'b64:' + Buffer.from(k, 'utf-8').toString('base64')
}

export function decryptApiKey(stored: unknown, cipher: SecretCipher): string {
  if (typeof stored !== 'string' || !stored) return ''
  try {
    if (stored.startsWith('enc:') && cipher.isEncryptionAvailable()) {
      return cipher.decryptString(Buffer.from(stored.slice(4), 'base64'))
    }
    if (stored.startsWith('b64:')) return Buffer.from(stored.slice(4), 'base64').toString('utf-8')
  } catch {
    /* key lỗi hoặc khác máy -> coi như chưa có */
  }
  return ''
}

const MODEL_RE: Record<AiProvider, RegExp> = {
  gemini: /^gemini-[\w.-]{1,60}$/,
  claude: /^claude-[\w.-]{1,60}$/,
  openai: /^[\w.:-]{1,80}$/,
}

export function normalizeProvider(p: unknown): AiProvider {
  return AI_PROVIDER_IDS.includes(p as AiProvider) ? (p as AiProvider) : DEFAULT_AI_PROVIDER
}

export function normalizeAiModel(provider: AiProvider, m: unknown): AiModelId {
  return typeof m === 'string' && MODEL_RE[provider].test(m) ? m : AI_PROVIDERS[provider].defaultModel
}

export function normalizeContextTokens(n: unknown): number {
  return AI_CONTEXT_LEVELS.includes(n as (typeof AI_CONTEXT_LEVELS)[number]) ? (n as number) : AI_CONTEXT_LEVELS[0]
}

/** Thông tin cấu hình gửi renderer: key chỉ ở dạng đã che. */
export function aiConfigInfo(store: Record<string, unknown>, cipher: SecretCipher): AiConfigInfo {
  const provider = normalizeProvider(store['aiProvider'])
  const keys = Object.fromEntries(
    AI_PROVIDER_IDS.map((p) => [p, maskApiKey(decryptApiKey(store[keyField(p)], cipher))])
  ) as Record<AiProvider, string>
  return {
    provider,
    hasKey: keys[provider] !== '',
    maskedKey: keys[provider],
    model: normalizeAiModel(provider, store[modelField(provider)]),
    contextTokens: normalizeContextTokens(store['aiContextTokens']),
    keys,
  }
}
