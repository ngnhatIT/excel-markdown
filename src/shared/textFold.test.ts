import { describe, expect, it } from 'vitest'
import { foldText } from './textFold'

describe('foldText', () => {
  it('hiragana -> katakana, chữ hoa -> thường, giữ độ dài', () => {
    expect(foldText('てーぶる定義')).toBe(foldText('テーブル定義'))
    expect(foldText('SCR001 ぁゖ')).toBe('scr001 ァヶ')
    const s = 'あいうABC'
    expect(foldText(s)).toHaveLength(s.length)
  })
})
