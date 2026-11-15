import { describe, expect, it } from 'vitest'
import { EMPTY_RULES, parseProjectConfig } from './projectConfig'

describe('parseProjectConfig', () => {
  it('{} -> config rỗng, không cảnh báo', () => {
    const r = parseProjectConfig('{}')
    expect(r.config).toEqual({ convert: {}, rules: EMPTY_RULES })
    expect(r.warnings).toEqual([])
  })

  it('nhận BOM và tùy chọn convert hợp lệ', () => {
    const r = parseProjectConfig('﻿{"convert":{"frontMatter":true,"chunkRows":50,"verticalMerge":"ditto","multiline":"space"}}')
    expect(r.config.convert).toEqual({ frontMatter: true, chunkRows: 50, verticalMerge: 'ditto', multiline: 'space' })
    expect(r.warnings).toEqual([])
  })

  it('bỏ range, giá trị sai kiểu và khóa lạ trong convert', () => {
    const r = parseProjectConfig('{"convert":{"range":"A1:B2","chunkRows":-1,"multiline":"x","foo":1}}')
    expect(r.config.convert).toEqual({})
    expect(r.warnings).toHaveLength(4)
  })

  it.each(['not json', '[]', 'null', '"x"'])('nội dung không phải object (%s) -> rỗng, 1 cảnh báo', (text) => {
    const r = parseProjectConfig(text)
    expect(r.config).toEqual({ convert: {}, rules: EMPTY_RULES })
    expect(r.warnings).toHaveLength(1)
  })

  it('khóa lạ ở gốc và trong rules -> cảnh báo', () => {
    const r = parseProjectConfig('{"rule":{},"rules":{"foo":[]}}')
    expect(r.warnings).toHaveLength(2)
  })

  it('lọc mục rỗng, quá dài, sai kiểu', () => {
    const r = parseProjectConfig(JSON.stringify({ rules: { screenIdLabels: ['画面コード', '', 'x'.repeat(41), 5] } }))
    expect(r.config.rules.screenIdLabels).toEqual(['画面コード'])
    expect(r.warnings).toHaveLength(3)
  })

  it('quá 200 mục -> giữ 200, 1 cảnh báo', () => {
    const words = Array.from({ length: 201 }, (_, i) => 'w' + i)
    const r = parseProjectConfig(JSON.stringify({ rules: { ambiguousWords: words } }))
    expect(r.config.rules.ambiguousWords).toHaveLength(200)
    expect(r.warnings).toHaveLength(1)
  })

  it('crudVerbs: op lạ bị bỏ, op thiếu là []', () => {
    const r = parseProjectConfig('{"rules":{"crudVerbs":{"C":["起票"],"X":["a"]}}}')
    expect(r.config.rules.crudVerbs).toEqual({ C: ['起票'], R: [], U: [], D: [] })
    expect(r.warnings).toHaveLength(1)
  })

  it('crudVerbs là mảng -> cảnh báo, rỗng', () => {
    const r = parseProjectConfig('{"rules":{"crudVerbs":["a"]}}')
    expect(r.config.rules.crudVerbs).toEqual(EMPTY_RULES.crudVerbs)
    expect(r.warnings).toHaveLength(1)
  })

  it('chuẩn hóa NFKC + chữ thường + trim', () => {
    const r = parseProjectConfig(JSON.stringify({ rules: { diffKeyColumns: [' ＡＢＣ '] } }))
    expect(r.config.rules.diffKeyColumns).toEqual(['abc'])
  })

  it('cảnh báo tối đa 20 dòng + một dòng tổng', () => {
    const keys = Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['k' + i, 1]))
    const r = parseProjectConfig(JSON.stringify(keys))
    expect(r.warnings).toHaveLength(21)
    expect(r.warnings[20]).toBe('…và 30 cảnh báo khác')
  })
})
