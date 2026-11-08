import { afterEach, describe, expect, it } from 'vitest'
import { MAIN_DICTS, mErr, mt, setMainLang } from './i18nMain'

describe('i18nMain', () => {
  afterEach(() => setMainLang('vi'))

  it('đủ khóa ở mọi ngôn ngữ, không chuỗi rỗng, cùng tham số {x}', () => {
    const params = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const d of [MAIN_DICTS.en, MAIN_DICTS.ja]) {
      expect(Object.keys(d).sort()).toEqual(Object.keys(MAIN_DICTS.vi).sort())
      for (const [k, v] of Object.entries(MAIN_DICTS.vi)) {
        expect(d[k as keyof typeof d].trim(), k).not.toBe('')
        expect(params(d[k as keyof typeof d]), k).toEqual(params(v))
      }
    }
  })

  it('theo lang của store; chưa có / sai thì theo locale', () => {
    setMainLang('ja')
    expect(mt('overwrite.yes')).toBe('上書き')
    setMainLang(undefined, 'en-US')
    expect(mt('overwrite.one', { name: 'a.md' })).toBe('a.md already exists. Overwrite?')
    setMainLang('fr', 'fr-FR')
    expect(mt('overwrite.yes')).toBe('Ghi đè')
  })

  it('mErr dịch lỗi theo ngôn ngữ hiện tại', () => {
    setMainLang('en')
    expect(mErr(new Error('ENOENT: x'))).toBe('File not found. It may have been moved, renamed or deleted.')
  })
})
