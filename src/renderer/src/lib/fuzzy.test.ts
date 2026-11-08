import { describe, expect, it } from 'vitest'
import { fuzzyRank, fuzzyScore } from './fuzzy'

const id = (s: string): string => s

describe('fuzzyScore', () => {
  it('không khớp -> null; query rỗng -> 0', () => {
    expect(fuzzyScore('xyz', 'README.md')).toBeNull()
    expect(fuzzyScore('  ', 'README.md')).toBe(0)
  })

  it('không phân biệt hoa thường, khớp ký tự theo thứ tự', () => {
    expect(fuzzyScore('rdm', 'README.md')).not.toBeNull()
    expect(fuzzyScore('mdr', 'README.md')).toBeNull()
  })

  it('NFKC: chữ toàn角 và カナ半角 khớp chữ thường', () => {
    expect(fuzzyScore('ＲＥＡＤ', 'readme.md')).not.toBeNull()
    expect(fuzzyScore('ｶﾞﾒﾝ', '画面項目_ガメン.md')).not.toBeNull()
    expect(fuzzyScore('画面', '基本設計/画面項目.md')).not.toBeNull()
  })

  it('chuỗi liền hơn khớp rời rạc, đầu từ hơn giữa từ', () => {
    expect(fuzzyScore('bmd', 'docs/b.md')!).toBeLessThan(fuzzyScore('b.md', 'docs/b.md')!)
    expect(fuzzyScore('item', 'docs/item.md')!).toBeGreaterThan(fuzzyScore('item', 'docs/xitem.md')!)
  })

  it('không tách đôi ký tự ngoài BMP', () => {
    expect(fuzzyScore('𠮷', 'a𠮷b')).not.toBeNull()
    expect(fuzzyScore('a𠮷', 'a-𠮷')).not.toBeNull()
  })
})

describe('fuzzyRank', () => {
  it('xếp theo điểm, bỏ không khớp, giữ thứ tự gốc khi bằng điểm', () => {
    const items = ['docs/zeta.md', 'alpha.md', 'docs/a.md', 'b.md', 'a.md', 'z.txt']
    expect(fuzzyRank('a.md', items, id)).toEqual(['a.md', 'docs/a.md', 'alpha.md', 'docs/zeta.md'])
    const loose = fuzzyRank('am', items, id)
    expect(loose[0]).toBe('a.md')
    expect([...loose].sort()).toEqual(['a.md', 'alpha.md', 'docs/a.md', 'docs/zeta.md'])
    expect(fuzzyRank('', items, id)).toEqual(items)
  })

  it('giới hạn số kết quả', () => {
    const items = Array.from({ length: 80 }, (_, i) => `f${i}.md`)
    expect(fuzzyRank('md', items, id)).toHaveLength(50)
    expect(fuzzyRank('md', items, id, 3)).toEqual(['f0.md', 'f1.md', 'f2.md'])
  })
})
