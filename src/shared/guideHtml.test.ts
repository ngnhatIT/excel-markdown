import { describe, expect, it } from 'vitest'
import { buildGuideHtml, guideFileStem } from './guideHtml'

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
  it('có nút rộng/đọc, mục lục, cỡ chữ; mặc định full width', () => {
    const out = buildGuideHtml('T', '<p>x</p>')
    for (const id of ['wide', 'tocb', 'fsm', 'fsp', 'theme']) expect(out).toContain(`id="${id}"`)
    expect(out).toContain("store('x2m-w')||'full'")
    expect(out).not.toMatch(/\.layout\{[^}]*max-width/)
  })
  it('script của trang cú pháp hợp lệ', () => {
    const js = /<script>([\s\S]*)<\/script>/.exec(buildGuideHtml('T', '<p>x</p>'))![1]
    expect(() => new Function(js)).not.toThrow()
  })
  it('bố cục tài liệu: thanh trên, ngăn mục lục cho màn hẹp, % đã đọc, đếm sơ đồ, footer', () => {
    const out = buildGuideHtml('T', '<h2>a</h2><h2>b</h2><figure class="mmd"><svg></svg></figure>', { date: '1/1/2026' })
    for (const id of ['menu', 'np', 'tocq', 'print', 'top']) expect(out).toContain(`id="${id}"`)
    expect(out).toContain('<span>1 sơ đồ</span>')
    expect(out).toContain('<article class="doc">')
    expect(out).toContain('Xuất từ ExcelToMarkdown · 1/1/2026')
  })
  it('thời gian đọc: chữ Nhật đếm theo ký tự, chữ Việt theo từ', () => {
    expect(buildGuideHtml('T', `<p>${'エラー時は必須です。'.repeat(1000)}</p>`)).toContain('~20 phút đọc')
    expect(buildGuideHtml('T', `<p>${'một '.repeat(1800)}</p>`)).toContain('~10 phút đọc')
  })
})

describe('guideFileStem', () => {
  it('bỏ đuôi file, đổi / thành " - ", giữ dấu chấm trong tên', () => {
    expect(guideFileStem('book.xlsx / Rev.3')).toBe('book - Rev.3')
    expect(guideFileStem('docs\\spec.v2/SC001.md')).toBe('docs - spec.v2 - SC001')
    expect(guideFileStem('release-1.2.MD')).toBe('release-1.2')
    expect(guideFileStem(null)).toBe('ghi-chu')
    expect(guideFileStem('.md')).toBe('ghi-chu')
  })
})

describe('buildGuideHtml: mục lục', () => {
  it('chữ có & " < không bị escape hai lần, id sạch', () => {
    const out = buildGuideHtml('T', '<h2>A &amp; B</h2><h2>C &quot;q&quot; &lt;x&gt;</h2>')
    expect(out).toContain('>A &amp; B</a>')
    expect(out).toContain('>C &quot;q&quot; &lt;x&gt;</a>')
    expect(out).not.toContain('&amp;amp;')
    expect(out).not.toMatch(/id="[^"]*(amp|quot)/)
  })
})
