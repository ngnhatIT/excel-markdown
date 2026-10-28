/* Dựng trang HTML đứng riêng (dạng ghi chú hướng dẫn) từ HTML đã render + sanitize của Markdown.
 * Thuần, không phụ thuộc DOM/Node: dùng được ở renderer và test.
 * Trang có một script inline cố định (mục lục scrollspy, copy code, lọc/sắp xếp bảng, đổi giao diện);
 * `bodyHtml` đã sanitize nên không chứa script nào khác. */

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '')

/** Không mạng, không ảnh ngoài; script/style chỉ inline do chính app sinh ra. */
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"

/** Kiểu callout GitHub: `> [!NOTE]`. Nhãn tiếng Việt. */
const ALERTS: Record<string, string> = {
  NOTE: 'Ghi chú',
  TIP: 'Mẹo',
  IMPORTANT: 'Quan trọng',
  WARNING: 'Cảnh báo',
  CAUTION: 'Nguy hiểm',
}

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')

const CSS = `
:root{--bg:#fbfbfd;--surface:#fff;--text:#1d2433;--dim:#5b6577;--border:#e1e5ee;--accent:#4f46e5;--accent-soft:#eef0ff;--code:#f3f4f8;--th:#f3f4f8;--zebra:#fafbfd;--shadow:0 1px 2px rgba(16,24,40,.06),0 4px 16px rgba(16,24,40,.05)}
:root[data-theme=dark]{--bg:#0e1117;--surface:#151a23;--text:#e6e9f0;--dim:#98a2b3;--border:#2a3140;--accent:#8b93ff;--accent-soft:#1c2142;--code:#1b2130;--th:#1b2130;--zebra:#12171f;--shadow:0 1px 2px rgba(0,0,0,.4)}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0e1117;--surface:#151a23;--text:#e6e9f0;--dim:#98a2b3;--border:#2a3140;--accent:#8b93ff;--accent-soft:#1c2142;--code:#1b2130;--th:#1b2130;--zebra:#12171f;--shadow:0 1px 2px rgba(0,0,0,.4)}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.8 system-ui,"Segoe UI","Yu Gothic UI","Meiryo","Noto Sans JP",sans-serif}
#bar{position:fixed;inset:0 0 auto 0;height:3px;width:0;background:var(--accent);z-index:20}
header.hero{border-bottom:1px solid var(--border);background:linear-gradient(135deg,var(--accent-soft),transparent 70%)}
.hero-in{max-width:1180px;margin:0 auto;padding:36px 24px 28px;display:flex;gap:16px;align-items:flex-start;justify-content:space-between}
.hero h1{margin:0 0 10px;font-size:2rem;line-height:1.25}
.meta{display:flex;flex-wrap:wrap;gap:8px}
.meta span{padding:2px 10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--dim);font-size:13px}
button{font:inherit;cursor:pointer}
.tbtn{padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px}
.tbtn:hover{border-color:var(--accent);color:var(--accent)}
.layout{display:flex;gap:44px;max-width:1180px;margin:0 auto;padding:28px 24px 80px}
nav{flex:0 0 250px;position:sticky;top:20px;align-self:flex-start;max-height:calc(100vh - 40px);overflow:auto;font-size:14px}
nav b{display:block;margin-bottom:8px;color:var(--dim);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
nav input{width:100%;margin-bottom:10px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;font-size:13px}
nav a{display:block;padding:3px 10px;border-left:2px solid var(--border);color:var(--dim);text-decoration:none}
nav a:hover{color:var(--accent)}
nav a.on{border-left-color:var(--accent);color:var(--accent);background:var(--accent-soft);font-weight:600}
nav a.l2{padding-left:22px}nav a.l3{padding-left:34px}
main{flex:1;min-width:0}
main>h1:first-child{display:none}
h1,h2,h3,h4{line-height:1.3;scroll-margin-top:20px}
h2{margin-top:2.2em;padding-bottom:.35em;border-bottom:1px solid var(--border)}
h1 .a,h2 .a,h3 .a{margin-left:.4em;color:var(--border);text-decoration:none;opacity:0}
h1:hover .a,h2:hover .a,h3:hover .a{opacity:1;color:var(--accent)}
a{color:var(--accent)}
blockquote{margin:1.2em 0;padding:.7em 1.1em;background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--dim);border-radius:0 10px 10px 0;box-shadow:var(--shadow)}
blockquote>:first-child{margin-top:0}blockquote>:last-child{margin-bottom:0}
.alert{--c:var(--accent);border-left-color:var(--c);background:color-mix(in srgb,var(--c) 9%,var(--surface))}
.alert-title{margin:0 0 .3em;color:var(--c);font-weight:700}
.alert-title::before{content:"● "}
.alert-tip{--c:#16a34a}.alert-important{--c:#9333ea}.alert-warning{--c:#d97706}.alert-caution{--c:#dc2626}
.tw{margin:1.2em 0;border:1px solid var(--border);border-radius:10px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
.tw-bar{padding:6px 10px;border-bottom:1px solid var(--border)}
.tw-bar input{width:min(100%,260px);padding:4px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font:inherit;font-size:13px}
.tw-scroll{overflow:auto;max-height:70vh}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:14.5px}
th,td{padding:8px 14px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
th{position:sticky;top:0;background:var(--th);font-weight:600;white-space:nowrap}
th.s{cursor:pointer;user-select:none}th.s:hover{color:var(--accent)}
th[data-d=asc]::after{content:" ▲";font-size:10px}th[data-d=desc]::after{content:" ▼";font-size:10px}
tbody tr:nth-child(even){background:var(--zebra)}
tbody tr:hover{background:var(--accent-soft)}
code{padding:.15em .4em;background:var(--code);border-radius:5px;font:.88em ui-monospace,"Cascadia Mono",Consolas,monospace}
.pw{position:relative;margin:1.2em 0}
pre{margin:0;padding:14px 18px;overflow:auto;background:var(--code);border:1px solid var(--border);border-radius:10px}
pre code{padding:0;background:none}
.cp{position:absolute;top:8px;right:8px;padding:2px 10px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--dim);opacity:0}
.pw:hover .cp,.cp:focus{opacity:1}
hr{border:0;border-top:1px solid var(--border);margin:2.4em 0}
#top{position:fixed;right:20px;bottom:20px;display:none;width:40px;height:40px;border:1px solid var(--border);border-radius:50%;background:var(--surface);color:var(--text);box-shadow:var(--shadow)}
@media (max-width:900px){.layout{display:block}nav{position:static;max-height:none;margin-bottom:24px}.hero-in{flex-direction:column}}
@media print{#bar,#top,nav,.tbtn,.cp,.tw-bar,.a{display:none!important}.layout{display:block;padding:0}.tw{box-shadow:none}.tw-scroll{max-height:none;overflow:visible}tr{break-inside:avoid}}
`

/** Chạy trong trang xuất (không dùng cú pháp cần build). Mọi truy cập storage bọc try/catch. */
const JS = `(function(){
var d=document,R=d.documentElement,$=function(s,c){return Array.prototype.slice.call((c||d).querySelectorAll(s))};
function store(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}}
var t=store('x2m-theme');if(t)R.setAttribute('data-theme',t);
var tb=d.getElementById('theme');if(tb)tb.onclick=function(){var dark=R.getAttribute('data-theme')==='dark'||(!R.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme:dark)').matches);var n=dark?'light':'dark';R.setAttribute('data-theme',n);store('x2m-theme',n)};
var bar=d.getElementById('bar'),top=d.getElementById('top'),links=$('nav a[href^="#"]'),heads=links.map(function(a){return d.getElementById(a.getAttribute('href').slice(1))});
function spy(){var h=d.body.scrollHeight-innerHeight,y=scrollY;bar.style.width=(h>0?y/h*100:0)+'%';top.style.display=y>600?'block':'none';var cur=-1;for(var i=0;i<heads.length;i++){if(heads[i]&&heads[i].getBoundingClientRect().top<=80)cur=i}links.forEach(function(a,i){a.classList.toggle('on',i===cur)})}
addEventListener('scroll',spy,{passive:true});spy();top.onclick=function(){scrollTo(0,0)};
var q=d.getElementById('tocq');if(q)q.oninput=function(){var v=q.value.toLowerCase();links.forEach(function(a){a.style.display=a.textContent.toLowerCase().indexOf(v)<0?'none':''})};
$('pre').forEach(function(p){var w=d.createElement('div');w.className='pw';p.parentNode.insertBefore(w,p);w.appendChild(p);var b=d.createElement('button');b.className='cp';b.textContent='Copy';b.onclick=function(){var s=p.innerText;(navigator.clipboard?navigator.clipboard.writeText(s):Promise.reject()).then(function(){b.textContent='Đã copy'},function(){var r=d.createRange();r.selectNodeContents(p);var g=getSelection();g.removeAllRanges();g.addRange(r);b.textContent='Đã chọn'});setTimeout(function(){b.textContent='Copy'},1500)};w.appendChild(b)});
$('.tw').forEach(function(w){var tbl=w.querySelector('table'),body=tbl.tBodies[0];if(!body)return;var rows=$('tr',body);
if(rows.length>8){var bb=d.createElement('div');bb.className='tw-bar';var i=d.createElement('input');i.placeholder='Lọc '+rows.length+' dòng...';i.oninput=function(){var v=i.value.toLowerCase();rows.forEach(function(r){r.style.display=r.textContent.toLowerCase().indexOf(v)<0?'none':''})};bb.appendChild(i);w.insertBefore(bb,w.firstChild)}
$('th',tbl).forEach(function(th,c){th.classList.add('s');th.onclick=function(){var asc=th.getAttribute('data-d')!=='asc';$('th',tbl).forEach(function(x){x.removeAttribute('data-d')});th.setAttribute('data-d',asc?'asc':'desc');
var k=function(r){return r.cells[c]?r.cells[c].textContent.trim():''};rows.sort(function(a,b){var x=k(a),y=k(b),nx=parseFloat(x.replace(/,/g,'')),ny=parseFloat(y.replace(/,/g,''));var r=(!isNaN(nx)&&!isNaN(ny))?nx-ny:x.localeCompare(y,undefined,{numeric:true});return asc?r:-r});rows.forEach(function(r){body.appendChild(r)})}})});
})();`

export interface GuideMeta {
  /** Ngày xuất (hiển thị nguyên văn). Không truyền thì không hiện. */
  date?: string
}

/** `bodyHtml` PHẢI là HTML đã sanitize. */
export function buildGuideHtml(title: string, bodyHtml: string, meta: GuideMeta = {}): string {
  const toc: { level: number; id: string; text: string }[] = []
  const seen = new Map<string, number>()
  let body = bodyHtml.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_m, lv: string, inner: string) => {
    const text = stripTags(inner).trim()
    const base = slugify(text) || 's'
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    const id = n === 0 ? base : `${base}-${n + 1}`
    toc.push({ level: Number(lv), id, text })
    return `<h${lv} id="${escapeHtml(id)}">${inner}<a class="a" href="#${escapeHtml(id)}" aria-label="Liên kết tới mục này">#</a></h${lv}>`
  })
  body = body.replace(/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:<br>|\n)?\s*/gi, (_m, k: string) => {
    const key = k.toUpperCase()
    return `<blockquote class="alert alert-${key.toLowerCase()}"><p class="alert-title">${ALERTS[key]}</p><p>`
  })
  body = body.replace(/<table>/g, '<div class="tw"><div class="tw-scroll"><table>').replace(/<\/table>/g, '</table></div></div>')

  const text = stripTags(body)
  const tables = (body.match(/<table>/g) ?? []).length
  const minutes = Math.max(1, Math.round(text.length / 500))
  const chips = [`~${minutes} phút đọc`, `${toc.length} mục`]
  if (tables > 0) chips.push(`${tables} bảng`)
  if (meta.date) chips.push(escapeHtml(meta.date))

  const nav =
    toc.length >= 2
      ? '<nav><b>Mục lục</b><input id="tocq" type="search" placeholder="Tìm mục..." aria-label="Tìm mục">' +
        toc.map((t) => `<a class="l${t.level}" href="#${escapeHtml(t.id)}">${escapeHtml(t.text)}</a>`).join('') +
        '</nav>'
      : '<nav hidden></nav>'
  return (
    '<!doctype html>\n<html lang="vi"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light dark">' +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<title>${escapeHtml(title)}</title><style>${CSS}</style></head><body>` +
    '<div id="bar"></div>' +
    `<header class="hero"><div class="hero-in"><div><h1>${escapeHtml(title)}</h1>` +
    `<div class="meta">${chips.map((c) => `<span>${c}</span>`).join('')}</div></div>` +
    '<button class="tbtn" id="theme" type="button">Sáng / Tối</button></div></header>' +
    `<div class="layout">${nav}<main>${body}</main></div>` +
    '<button id="top" type="button" aria-label="Lên đầu trang">↑</button>' +
    `<script>${JS}</script></body></html>\n`
  )
}
