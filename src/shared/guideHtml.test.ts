import { describe, expect, it } from 'vitest'
import { buildGuideHtml } from './guideHtml'

describe('buildGuideHtml', () => {
  it('id theo slug (Unicode ok, trùng thì thêm số), mục lục bỏ thẻ trong text', () => {
    const out = buildGuideHtml('T', '<h1>A</h1><h2>B <code>c</code></h2><h2>B c</h2><h2>画面 定義</h2>')
    expect(out).toContain('<h1 id="a">A<a class="a" href="#a"')
    expect(out).toContain('<a class="l2" href="#b-c">B c</a>')
    expect(out).toContain('id="b-c-2"')
    expect(out).toContain('id="画面-定義"')
  })
  it('dưới 2 tiêu đề: không có mục lục', () => {
    const out = buildGuideHtml('T', '<h1>A</h1><p>x</p>')
    expect(out).not.toContain('id="tocq"')
  })
  it('callout kiểu GitHub -> alert có nhãn; quote thường giữ nguyên', () => {
    const out = buildGuideHtml('T', '<blockquote><p>[!WARNING]\nđừng xóa</p></blockquote><blockquote><p>thường</p></blockquote>')
    expect(out).toContain('<blockquote class="alert alert-warning"><p class="alert-title">Cảnh báo</p><p>đừng xóa</p>')
    expect(out).toContain('<blockquote><p>thường</p>')
  })
  it('bảng được bọc để lọc/sắp xếp; chip đếm bảng', () => {
    const out = buildGuideHtml('T', '<table><thead><tr><th>a</th></tr></thead></table>')
    expect(out).toContain('<div class="tw"><div class="tw-scroll"><table>')
    expect(out).toContain('1 bảng')
  })
  it('escape title và ngày; CSP chặn mạng; đúng một script do app sinh', () => {
    const out = buildGuideHtml('<b>"x"</b>', '<p>hi</p>', { date: '<1>' })
    expect(out).toContain('<title>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</title>')
    expect(out).toContain('<span>&lt;1&gt;</span>')
    expect(out).toContain("default-src 'none'")
    expect(out.match(/<script/g)).toHaveLength(1)
  })
  it('script của trang cú pháp hợp lệ', () => {
    const js = /<script>([\s\S]*)<\/script>/.exec(buildGuideHtml('T', '<p>x</p>'))![1]
    expect(() => new Function(js)).not.toThrow()
  })
})
