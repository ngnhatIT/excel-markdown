import { describe, expect, it } from 'vitest'
import { EMPTY_NAV, NAV_LIMIT, navReducer, type NavAction, type NavHistory } from './navHistory'

const run = (actions: NavAction[], s: NavHistory = EMPTY_NAV): NavHistory => actions.reduce(navReducer, s)
const push = (path: string, heading?: string): NavAction => ({ type: 'push', entry: { path, heading } })

describe('navReducer', () => {
  it('push nối thêm, back/forward đi lại', () => {
    const s = run([push('a'), push('b'), push('c'), { type: 'back' }, { type: 'back' }])
    expect(s.stack[s.index].path).toBe('a')
    const f = navReducer(s, { type: 'forward' })
    expect(f.stack[f.index].path).toBe('b')
  })

  it('back ở đầu / forward ở cuối trả lại đúng object cũ', () => {
    const s = run([push('a')])
    expect(navReducer(s, { type: 'back' })).toBe(s)
    expect(navReducer(s, { type: 'forward' })).toBe(s)
    expect(navReducer(EMPTY_NAV, { type: 'back' })).toBe(EMPTY_NAV)
  })

  it('push sau khi lùi bỏ nhánh Tiến', () => {
    const s = run([push('a'), push('b'), { type: 'back' }, push('c')])
    expect(s.stack.map((e) => e.path)).toEqual(['a', 'c'])
    expect(navReducer(s, { type: 'forward' })).toBe(s)
  })

  it('push trùng mục hiện tại thì bỏ qua; khác anchor thì thêm', () => {
    const s = run([push('a'), push('a')])
    expect(s.stack).toHaveLength(1)
    const t = run([push('a', 'muc-1'), push('a', 'muc-1'), push('a')], s)
    expect(t.stack.map((e) => e.heading)).toEqual([undefined, 'muc-1', undefined])
  })

  it('giữ tối đa NAV_LIMIT mục', () => {
    const s = run(Array.from({ length: NAV_LIMIT + 5 }, (_, i) => push(String(i))))
    expect(s.stack).toHaveLength(NAV_LIMIT)
    expect(s.stack[0].path).toBe('5')
    expect(s.index).toBe(NAV_LIMIT - 1)
  })
})
