import { describe, expect, it } from 'vitest'
import { AI_PROVIDER_IDS } from '../../../../shared/types'
import { aiConfigInfo, decryptApiKey, encryptApiKey, isSecretStoreKey, keyField, type SecretCipher } from './aiConfig'

// "Mã hóa" giả: đảo chuỗi, đủ để kiểm đường đi enc:
const fakeCipher: SecretCipher = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from([...s].reverse().join(''), 'utf-8'),
  decryptString: (b) => [...b.toString('utf-8')].reverse().join(''),
}
const noKeyring: SecretCipher = { ...fakeCipher, isEncryptionAvailable: () => false }

describe('isSecretStoreKey', () => {
  it('chặn khóa API Key của mọi nhà cung cấp', () => {
    for (const p of AI_PROVIDER_IDS) expect(isSecretStoreKey(keyField(p))).toBe(true)
  })
  it('chặn khóa không phải chuỗi, cho khóa thường', () => {
    expect(isSecretStoreKey(undefined)).toBe(true)
    expect(isSecretStoreKey('theme')).toBe(false)
    expect(isSecretStoreKey('aiProvider')).toBe(false)
  })
})

describe('encryptApiKey / decryptApiKey', () => {
  it('round-trip qua keyring', () => {
    const enc = encryptApiKey('  sk-ant-abc123  ', fakeCipher)
    expect(enc.startsWith('enc:')).toBe(true)
    expect(decryptApiKey(enc, fakeCipher)).toBe('sk-ant-abc123')
  })
  it('không có keyring thì dùng b64', () => {
    const enc = encryptApiKey('key-1', noKeyring)
    expect(enc.startsWith('b64:')).toBe(true)
    expect(decryptApiKey(enc, noKeyring)).toBe('key-1')
  })
  it('key rỗng / giá trị lạ -> rỗng', () => {
    expect(encryptApiKey('   ', fakeCipher)).toBe('')
    expect(decryptApiKey(42, fakeCipher)).toBe('')
    expect(decryptApiKey('enc:xx', noKeyring)).toBe('')
  })
})

describe('aiConfigInfo', () => {
  it('chỉ trả key đã che, đúng nhà cung cấp', () => {
    const store = { aiProvider: 'claude', [keyField('claude')]: encryptApiKey('sk-ant-0123456789', fakeCipher) }
    const info = aiConfigInfo(store, fakeCipher)
    expect(info.provider).toBe('claude')
    expect(info.hasKey).toBe(true)
    expect(info.maskedKey).toBe('sk-a••••6789')
    expect(JSON.stringify(info)).not.toContain('0123456789')
  })
})
