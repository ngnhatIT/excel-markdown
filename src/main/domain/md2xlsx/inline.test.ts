import { describe, expect, it } from 'vitest'
import { marked, type Tokens } from 'marked'
import { escapeMarkdownInline } from '../excel/output'
import { INLINE_CASES, UNTOUCHED } from '../excel/escapeCases'
import { inlineCell } from './inline'

const cellOf = (src: string) => inlineCell((marked.lexer(`| A |\n|---|\n| ${src} |`)[0] as Tokens.Table).rows[0][0].tokens)

describe('inlineCell', () => {
  // Đảo chiều Excel -> Markdown: mọi case escape quay về đúng chữ gốc
  it.each([...INLINE_CASES, ...UNTOUCHED])('round-trip %s', (s) => {
    expect(cellOf(escapeMarkdownInline(s).replace(/\|/g, '\\|')).text).toBe(s)
  })

  it('<br> thành xuống dòng', () => {
    expect(cellOf('a<br>　b').text).toBe('a\n　b')
    expect(cellOf('a<br/>b').text).toBe('a\nb')
    expect(cellOf('a<br />b').text).toBe('a\nb')
  })

  it('bỏ định dạng, giữ chữ', () => {
    expect(cellOf('**b** *i* ~~d~~ `c`').text).toBe('b i d c')
  })

  it('giải mã entity HTML', () => {
    expect(cellOf('a &amp; b &lt;x&gt; &#x41;&#66;&nbsp;').text).toBe('a & b <x> AB\u00a0')
  })

  it('entity đã escape không bị giải mã hai lần', () => {
    expect(cellOf('\\&amp; &amp;lt;').text).toBe('&amp; &lt;')
  })

  it('trong code không giải mã entity; HTML khác giữ nguyên chữ', () => {
    expect(cellOf('`&amp; <b>`').text).toBe('&amp; <b>')
    expect(cellOf('<null> と <span>x</span>').text).toBe('<null> と <span>x</span>')
  })

  it('mã entity không hợp lệ giữ nguyên chữ', () => {
    expect(cellOf('&#0; &#xD800; &#1114112; &copy;').text).toBe('&#0; &#xD800; &#1114112; &copy;')
  })

  it('link: cả ô là một link http/https/mailto, hoặc link nội bộ chờ giải (#slug, x.md); scheme khác -> chữ', () => {
    expect(cellOf('[Spec](https://x.example/a)')).toEqual({ text: 'Spec', link: 'https://x.example/a' })
    expect(cellOf('[M](mailto:a@x.example)').link).toBe('mailto:a@x.example')
    expect(cellOf('[x](file:///C:/a)')).toEqual({ text: 'x' })
    expect(cellOf('[x](javascript:a.md)')).toEqual({ text: 'x' })
    expect(cellOf('[参照](#テーブル定義)')).toEqual({ text: '参照', link: '#テーブル定義' })
    expect(cellOf('[参照](kihon__テーブル定義.md)')).toEqual({ text: '参照', link: 'kihon__テーブル定義.md' })
    expect(cellOf('[参照](a.txt)')).toEqual({ text: '参照' })
  })

  it('link giữa câu: đúng một link -> cả ô là hyperlink; nhiều link -> thêm (url) sau chữ, không mất URL', () => {
    expect(cellOf('詳細は[仕様](https://example.com)を参照')).toEqual({ text: '詳細は仕様を参照', link: 'https://example.com' })
    expect(cellOf('[A](https://a.example) と [B](mailto:b@x.example)')).toEqual({
      text: 'A (https://a.example) と B (mailto:b@x.example)'
    })
    // <url> chữ đã là URL: không lặp; link nội bộ giữa câu chỉ giữ chữ
    expect(cellOf('<https://a.example> と [B](https://b.example)').text).toBe('https://a.example と B (https://b.example)')
    expect(cellOf('see [x](#s)')).toEqual({ text: 'see x' })
  })

  it('định dạng inline -> runs (đậm/nghiêng/gạch/code); không có định dạng thì không có runs', () => {
    expect(cellOf('a **b** *i* ~~d~~ `c`').runs).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'i', italic: true },
      { text: ' ' },
      { text: 'd', strike: true },
      { text: ' ' },
      { text: 'c', code: true }
    ])
    expect(cellOf('***x***').runs).toEqual([{ text: 'x', bold: true, italic: true }])
    expect(cellOf('plain \\*x\\*')).toEqual({ text: 'plain *x*' })
  })

  it('URL trần do GFM tự nhận không thành hyperlink', () => {
    expect(cellOf('https://x.example')).toEqual({ text: 'https://x.example' })
    expect(cellOf('a@x.example')).toEqual({ text: 'a@x.example' })
  })

  it('autolink <url> là cú pháp link tường minh -> hyperlink', () => {
    expect(cellOf('<https://x.example>')).toEqual({ text: 'https://x.example', link: 'https://x.example' })
    expect(cellOf('<mailto:a@x.example>')).toEqual({ text: 'mailto:a@x.example', link: 'mailto:a@x.example' })
    expect(cellOf('<ftp://x.example>')).toEqual({ text: 'ftp://x.example' })
  })

  it('<url> đã bị escaper thêm `\\` đứng đầu (chiều Excel -> Markdown) vẫn là chữ thuần', () => {
    expect(cellOf('\\<https://x.example>')).toEqual({ text: '<https://x.example>' })
  })

  it('ảnh -> chữ alt', () => {
    expect(cellOf('![図](a.png)').text).toBe('図')
  })

  it('không có token -> ô rỗng', () => {
    expect(inlineCell(undefined)).toEqual({ text: '' })
  })
})
