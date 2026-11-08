import { describe, expect, it } from 'vitest'
import { detectLang, translate } from './index'
import { vi } from './vi'
import { en } from './en'
import { ja } from './ja'

describe('i18n', () => {
  it('đủ khóa ở mọi ngôn ngữ, không chuỗi rỗng, cùng tham số {x}', () => {
    const params = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const d of [en, ja]) {
      expect(Object.keys(d).sort()).toEqual(Object.keys(vi).sort())
      for (const k of Object.keys(vi) as (keyof typeof vi)[]) {
        expect(d[k].trim(), k).not.toBe('')
        expect(params(d[k]), k).toEqual(params(vi[k]))
      }
    }
  })

  it('thay tham số, giữ nguyên tham số không truyền', () => {
    expect(translate('en', 'lang.label')).toBe('Language')
    expect(translate('ja', 'lang.label')).toBe('言語')
  })

  it('ngôn ngữ mặc định theo locale hệ điều hành', () => {
    expect(detectLang('ja-JP')).toBe('ja')
    expect(detectLang('en-US')).toBe('en')
    expect(detectLang('vi')).toBe('vi')
    expect(detectLang('fr-FR')).toBe('vi')
  })
})
