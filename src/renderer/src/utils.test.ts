import { describe, expect, it } from 'vitest'
import { moveItem } from './utils'

describe('moveItem', () => {
  it('đổi chỗ với phần tử phía trước', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
  })

  it('đổi chỗ với phần tử phía sau', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
  })

  it('ngoài biên đầu -> bản sao không đổi', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
  })

  it('ngoài biên cuối -> bản sao không đổi', () => {
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })

  it('không sửa mảng gốc, luôn trả mảng mới', () => {
    const list = ['a', 'b', 'c']
    const moved = moveItem(list, 1, 1)
    expect(list).toEqual(['a', 'b', 'c'])
    expect(moved).not.toBe(list)
    const same = moveItem(list, 5, 1)
    expect(same).toEqual(list)
    expect(same).not.toBe(list)
  })
})
