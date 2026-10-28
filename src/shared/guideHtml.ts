/* Dựng trang HTML đứng riêng (dạng ghi chú hướng dẫn) từ HTML đã render + sanitize của Markdown.
 * Thuần, không phụ thuộc DOM/Node: dùng được ở renderer và test. */

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '')

/** Chỉ inline CSS, không script, ảnh chỉ data: — file mở offline và không gọi mạng. */
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:"

const CSS = `
:root{--bg:#fff;--text:#1f2328;--dim:#59636e;--border:#d1d9e0;--accent:#0969da;--note:#ddf4ff;--code:#f6f8fa;--th:#f6f8fa}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--text:#e6edf3;--dim:#9198a1;--border:#3d444d;--accent:#4493f8;--note:#102a43;--code:#161b22;--th:#161b22}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.75 system-ui,"Segoe UI","Yu Gothic UI","Meiryo",sans-serif}
.layout{display:flex;gap:40px;max-width:1160px;margin:0 auto;padding:32px 20px}
nav{flex:0 0 240px;position:sticky;top:24px;align-self:flex-start;max-height:calc(100vh - 48px);overflow:auto;font-size:14px}
nav b{display:block;margin-bottom:8px;color:var(--dim);font-size:12px;letter-spacing:.06em;text-transform:uppercase}
nav a{display:block;padding:3px 0;color:var(--dim);text-decoration:none}
nav a:hover{color:var(--accent)}
nav a.l2{padding-left:14px}nav a.l3{padding-left:28px}
main{flex:1;min-width:0}
h1,h2,h3,h4{line-height:1.3;scroll-margin-top:16px}
h2{margin-top:2em;padding-bottom:.3em;border-bottom:1px solid var(--border)}
a{color:var(--accent)}
blockquote{margin:1em 0;padding:.6em 1em;background:var(--note);border-left:4px solid var(--accent);border-radius:0 6px 6px 0}
blockquote>:first-child{margin-top:0}blockquote>:last-child{margin-bottom:0}
table{border-collapse:collapse;display:block;overflow-x:auto;margin:1em 0}
th,td{border:1px solid var(--border);padding:6px 12px;text-align:left;vertical-align:top}
th{background:var(--th)}
code{padding:.15em .4em;background:var(--code);border-radius:4px;font:.9em ui-monospace,"Cascadia Mono",Consolas,monospace}
pre{padding:12px 16px;overflow:auto;background:var(--code);border-radius:6px}
pre code{padding:0;background:none}
hr{border:0;border-top:1px solid var(--border)}
@media (max-width:860px){.layout{display:block}nav{position:static;max-height:none;margin-bottom:24px}}
@media print{nav{display:none}.layout{display:block;padding:0}tr{break-inside:avoid}}
`

/** `bodyHtml` PHẢI là HTML đã sanitize. Thêm id cho h1-h3 và mục lục (khi có từ 2 tiêu đề). */
export function buildGuideHtml(title: string, bodyHtml: string): string {
  const toc: { level: number; id: string; text: string }[] = []
  const body = bodyHtml.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_m, lv: string, inner: string) => {
    const id = 's' + (toc.length + 1)
    toc.push({ level: Number(lv), id, text: stripTags(inner).trim() })
    return `<h${lv} id="${id}">${inner}</h${lv}>`
  })
  const nav =
    toc.length >= 2
      ? '<nav><b>Mục lục</b>' +
        toc.map((t) => `<a class="l${t.level}" href="#${t.id}">${t.text}</a>`).join('') +
        '</nav>'
      : ''
  return (
    '<!doctype html>\n<html lang="vi"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<title>${escapeHtml(title)}</title><style>${CSS}</style></head>` +
    `<body><div class="layout">${nav}<main>${body}</main></div></body></html>\n`
  )
}
