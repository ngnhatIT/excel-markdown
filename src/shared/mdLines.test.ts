import { describe, expect, it } from 'vitest'
import { atxHeading, fenceAfter, isDelimRow } from './mdLines'
import { buildSpecIndex } from './specIndex'
import { parseTableDefs } from './tableDef'
import { buildTestDesign } from './testDesign'

describe('mdLines', () => {
  it('atxHeading: cấp, chữ, dãy # đóng', () => {
    expect(atxHeading('## A b ##')).toEqual({ level: 2, text: 'A b' })
    expect(atxHeading('# C#')).toEqual({ level: 1, text: 'C#' })
    expect(atxHeading('###')).toEqual({ level: 3, text: '' })
    expect(atxHeading('#tag')).toBeNull()
    expect(atxHeading('####### x')).toBeNull()
  })

  it('fenceAfter: mở, đóng, dòng thường', () => {
    expect(fenceAfter('', '```bash')).toBe('```')
    expect(fenceAfter('```', '~~~')).toBe('```')
    expect(fenceAfter('```', '````')).toBe('')
    expect(fenceAfter('```', '# x')).toBeUndefined()
  })

  it('isDelimRow', () => {
    expect(isDelimRow('|---|:--:|')).toBe(true)
    expect(isDelimRow(' --- | --- ')).toBe(true)
    expect(isDelimRow('| a | b |')).toBe(false)
    expect(isDelimRow('| |')).toBe(false)
  })

  it('dòng có hàng chục nghìn khoảng trắng không làm treo (trước đây regex quay lui bậc ba)', () => {
    const pad = ' '.repeat(20_000)
    const md = `# a${pad}b\n\n| a |\n|-|${pad}x\n`
    const t0 = Date.now()
    parseTableDefs(md)
    buildSpecIndex([{ rel: 'a.md', text: md }])
    buildTestDesign(md)
    expect(Date.now() - t0).toBeLessThan(2000)
  })
})
