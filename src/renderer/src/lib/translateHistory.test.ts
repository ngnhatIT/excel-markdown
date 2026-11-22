import { describe, expect, it } from 'vitest'
import { addTranslation, clearTranslations, getTranslations, TRANSLATE_HISTORY_MAX } from './translateHistory'

const base = { kind: 'selection' as const, label: '', from: 'ja' as const, terms: [] }

describe('translateHistory', () => {
  it('mới nhất lên đầu; cùng nguồn + đích thì thay bản cũ; khác đích là mục riêng; xóa hết', () => {
    clearTranslations()
    addTranslation({ ...base, source: 'A', to: 'vi', text: '1' })
    addTranslation({ ...base, source: 'B', to: 'vi', text: '2' })
    addTranslation({ ...base, source: 'A', to: 'vi', text: '3' })
    addTranslation({ ...base, source: 'A', to: 'en', text: '4' })
    expect(getTranslations().map((e) => `${e.source}>${e.to}:${e.text}`)).toEqual(['A>en:4', 'A>vi:3', 'B>vi:2'])
    clearTranslations()
    expect(getTranslations()).toEqual([])
  })

  it(`giữ tối đa ${TRANSLATE_HISTORY_MAX} mục`, () => {
    clearTranslations()
    for (let i = 0; i < TRANSLATE_HISTORY_MAX + 5; i++) addTranslation({ ...base, source: `s${i}`, to: 'vi', text: '' })
    expect(getTranslations()).toHaveLength(TRANSLATE_HISTORY_MAX)
    expect(getTranslations()[0].source).toBe(`s${TRANSLATE_HISTORY_MAX + 4}`)
  })
})
