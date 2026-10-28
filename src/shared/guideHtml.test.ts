import { describe, expect, it } from 'vitest'
import { buildGuideHtml } from './guideHtml'

describe('buildGuideHtml', () => {
  it('thêm id + mục lục từ h1-h3, bỏ thẻ trong text mục lục', () => {
    const out = buildGuideHtml('T', '<h1>A</h1><p>x</p><h2>B <code>c</code></h2><h4>D</h4>')
    expect(out).toContain('<h1 id="s1">A</h1>')
    expect(out).toContain('<h2 id="s2">B <code>c</code></h2>')
    expect(out).toContain('<a class="l2" href="#s2">B c</a>')
    expect(out).not.toContain('id="s3"')
  })
  it('dưới 2 tiêu đề: không có mục lục', () => {
    expect(buildGuideHtml('T', '<h1>A</h1><p>x</p>')).not.toContain('<nav>')
  })
  it('escape title, có CSP, không script', () => {
    const out = buildGuideHtml('<b>"x"</b>', '<p>hi</p>')
    expect(out).toContain('<title>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</title>')
    expect(out).toContain("default-src 'none'")
    expect(out).not.toContain('<script')
  })
})
