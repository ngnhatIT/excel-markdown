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

  it('chặn javascript: viết bằng entity hoặc chèn ký tự điều khiển', () => {
    for (const href of ['javascript&#58;alert(1)', '&#106;avascript:alert(1)', 'javascript&#x3A;alert(1)', 'java&#9;script:alert(1)', 'javascript&#58alert(1)']) {
      expect(sanitizeHtml(`<a href="${href}">x</a>`)).toBe('<a>x</a>')
    }
  })

  it('entity không giải mã được thì escape lại, trình duyệt không đọc ra scheme', () => {
    expect(sanitizeHtml('<a href="javascript&colon;alert(1)">x</a>')).toBe('<a href="javascript&amp;colon;alert(1)">x</a>')
  })

  it('giữ nguyên & trong query của link', () => {
    expect(sanitizeHtml('<a href="https://x.com/?a=1&amp;b=2">x</a>')).toBe('<a href="https://x.com/?a=1&amp;b=2">x</a>')
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

describe('sanitizeHtml + resolveImage (chế độ Đọc Markdown)', () => {
  const resolveImage = (src: string): string | null => (src.startsWith('img/') ? 'x2m-img://f/' + encodeURIComponent(src) : null)

  it('ảnh được resolve: chỉ giữ src (đã đổi) và alt, bỏ attribute khác', () => {
    const out = sanitizeHtml('<p><img src="img/a b&amp;c.png" alt="Sơ đồ &quot;A&quot;" onerror="alert(1)" title="t"></p>', { resolveImage })
    expect(out).toBe('<p><img src="x2m-img://f/img%2Fa%20b%26c.png" alt="Sơ đồ &quot;A&quot;"></p>')
  })

  it('resolveImage trả null -> bỏ ảnh', () => {
    expect(sanitizeHtml('<img src="https://evil/x.png" alt="x">', { resolveImage })).toBe('')
    expect(sanitizeHtml('<img alt="không src">', { resolveImage })).toBe('')
  })

  it('không truyền resolveImage -> bỏ mọi ảnh (như cũ)', () => {
    expect(sanitizeHtml('<img src="img/a.png" alt="x">')).toBe('')
  })

  it('giữ class language-* của khối code, bỏ class khác', () => {
    expect(sanitizeHtml('<pre><code class="language-mermaid">A--&gt;B</code></pre>')).toBe(
      '<pre><code class="language-mermaid">A--&gt;B</code></pre>'
    )
    expect(sanitizeHtml('<code class="x" onclick="a()">y</code>')).toBe('<code>y</code>')
    expect(sanitizeHtml('<code class="language-a&quot; onclick=&quot;x">y</code>')).toBe('<code>y</code>')
  })
})
