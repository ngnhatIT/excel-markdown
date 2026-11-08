import { describe, expect, it } from 'vitest'
import { toCellValue } from './cellValue'

describe('toCellValue', () => {
  it.each([
    ['10', 10, undefined],
    ['-3', -3, undefined],
    ['0', 0, undefined],
    ['99999999999', 99999999999, undefined],
    ['1.0', 1, '0.0'],
    ['1.10', 1.1, '0.00'],
    ['0.5', 0.5, '0.0'],
    ['-2.25', -2.25, '0.00'],
    ['1,234', 1234, '#,##0'],
    ['1,234,567.89', 1234567.89, '#,##0.00'],
    ['50%', 0.5, '0%'],
    ['12.50%', 0.125, '0.00%'],
  ])('%s -> số', (text, value, numFmt) => {
    expect(toCellValue(text)).toEqual(numFmt ? { value, numFmt } : { value })
  })

  it.each(['0001', '123456789012', '03-xxxx', '2026/10/01', '#N/A', 'TRUE', '1.2.3', '１２', '1e5', '', '1,23', '.5', '5.', '-0', '-0.0', '-0%', '0.12345678901234567', '1,234,567,890,123,456', '12345678901234.56%'])(
    '%s -> text',
    (text) => {
      expect(toCellValue(text)).toEqual({ value: text })
    }
  )
})
