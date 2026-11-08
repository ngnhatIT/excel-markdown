import { describe, expect, it } from 'vitest'
import { detectLang, translate } from './index'
import { vi } from './vi'
import { en } from './en'
import { ja } from './ja'
import { compareEn, compareJa, compareVi } from './compare'
import { translateEn, translateJa, translateVi } from './translate'
import { tableDefEn, tableDefJa, tableDefVi } from './tableDef'

describe('i18n', () => {
  it('đủ khóa ở mọi ngôn ngữ, không chuỗi rỗng, cùng tham số {x}', () => {
    const params = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    const pairs: [Record<string, string>, Record<string, string>][] = [
      [vi, en],
      [vi, ja],
      [compareVi, compareEn],
      [compareVi, compareJa],
      [translateVi, translateEn],
      [translateVi, translateJa],
      [tableDefVi, tableDefEn],
      [tableDefVi, tableDefJa],
    ]
    for (const [base, d] of pairs) {
      expect(Object.keys(d).sort()).toEqual(Object.keys(base).sort())
      for (const k of Object.keys(base)) {
        expect(d[k].trim(), k).not.toBe('')
        expect(params(d[k]), k).toEqual(params(base[k]))
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
