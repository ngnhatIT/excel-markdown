import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '../renderer/src/sanitize'

describe('sanitizeHtml', () => {
  it('giữ thẻ marked + br', () => {
    const html = '<h3>T</h3><table><tr><td>a<br>b</td></tr></table><blockquote>q</blockquote>'
    expect(sanitizeHtml(html)).toBe(html)
  })

  it('loại bỏ script', () => {
    expect(sanitizeHtml('<p>x</p><script>alert(1)</script>')).toBe('<p>x</p>alert(1)')
  })

  it('loại bỏ event handler', () => {
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).toBe('')
  })

  it('chặn javascript: trong href', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
  })

  it('giữ href http', () => {
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com">x</a>'
    )
  })

  it('payload thực tế từ cell Excel', () => {
    const md = '<p><img src=x onerror=alert(document.domain)></p>'
    const out = sanitizeHtml(md)
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('<img')
    expect(out).toContain('<p>')
  })

  it('loại bỏ svg/onload', () => {
    expect(sanitizeHtml('<svg onload="alert(1)"><circle/>')).toBe('')
  })
})
