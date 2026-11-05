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
:root{--bg:#f8fafc;--surface:#ffffff;--text:#0f172a;--dim:#475569;--border:#e2e8f0;--accent:#4f46e5;--accent-hover:#4338ca;--accent-soft:#eef2ff;--code-bg:#0f172a;--code-text:#e2e8f0;--code-inline:#f1f5f9;--th:#f8fafc;--zebra:#fafbfd;--shadow:0 1px 3px 0 rgba(0,0,0,.05),0 1px 2px -1px rgba(0,0,0,.05);--shadow-md:0 4px 6px -1px rgba(0,0,0,.07),0 2px 4px -2px rgba(0,0,0,.05);--shadow-lg:0 10px 15px -3px rgba(0,0,0,.08),0 4px 6px -4px rgba(0,0,0,.04)}
:root[data-theme=dark]{--bg:#0b0f19;--surface:#111827;--text:#f1f5f9;--dim:#94a3b8;--border:#1e293b;--accent:#818cf8;--accent-hover:#a5b4fc;--accent-soft:#1e1e38;--code-bg:#0d1117;--code-text:#e6edf3;--code-inline:#172033;--th:#161f30;--zebra:#0d1424;--shadow:0 4px 6px -1px rgba(0,0,0,.3);--shadow-md:0 10px 20px -3px rgba(0,0,0,.45);--shadow-lg:0 20px 25px -5px rgba(0,0,0,.5)}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0b0f19;--surface:#111827;--text:#f1f5f9;--dim:#94a3b8;--border:#1e293b;--accent:#818cf8;--accent-hover:#a5b4fc;--accent-soft:#1e1e38;--code-bg:#0d1117;--code-text:#e6edf3;--code-inline:#172033;--th:#161f30;--zebra:#0d1424;--shadow:0 4px 6px -1px rgba(0,0,0,.3);--shadow-md:0 10px 20px -3px rgba(0,0,0,.45);--shadow-lg:0 20px 25px -5px rgba(0,0,0,.5)}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:var(--fs,16px)/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans",Ubuntu,sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:-.011em}
#bar{position:fixed;inset:0 0 auto 0;height:3px;width:0;background:linear-gradient(90deg,var(--accent),#a855f7);z-index:40;transition:width .08s ease}
header.hero{border-bottom:1px solid var(--border);background:linear-gradient(180deg,var(--accent-soft) 0%,var(--surface) 100%)}
.hero-in{padding:36px 36px 28px;display:flex;gap:20px;align-items:flex-start;justify-content:space-between}
.hero h1{margin:0 0 12px;font-size:2.05rem;font-weight:800;letter-spacing:-.025em;line-height:1.25}
.meta{display:flex;flex-wrap:wrap;gap:8px}
.meta span{padding:4px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--dim);font-size:12.5px;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.03);display:inline-flex;align-items:center}
button{font:inherit;cursor:pointer}
.tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.tbtn{padding:7px 13px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:all .15s ease;display:inline-flex;align-items:center;gap:5px}
.tbtn:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-1px);box-shadow:var(--shadow-md)}
.layout{display:flex;gap:44px;padding:36px 36px 80px}
:root[data-w=read] .layout,:root[data-w=read] .hero-in{max-width:1200px;margin:0 auto}
:root[data-w=read] main{max-width:880px}
main>p,main>ul,main>ol,main>blockquote,main>h1,main>h2,main>h3,main>h4{max-width:100ch}
:root[data-w=read] main>*{max-width:none}
:root[data-toc=off] nav{display:none}
nav{flex:0 0 270px;position:sticky;top:24px;align-self:flex-start;max-height:calc(100vh - 48px);overflow:auto;font-size:13.5px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:var(--shadow)}
nav b{display:block;margin-bottom:10px;color:var(--dim);font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
nav input{width:100%;margin-bottom:12px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font:inherit;font-size:13px;outline:none;transition:border-color .15s}
nav input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 15%,transparent)}
nav a{display:block;padding:5px 10px;border-left:2.5px solid transparent;border-radius:0 6px 6px 0;color:var(--dim);text-decoration:none;transition:all .12s ease;margin-bottom:2px;line-height:1.45}
nav a:hover{color:var(--text);background:var(--accent-soft)}
nav a.on{border-left-color:var(--accent);color:var(--accent);background:var(--accent-soft);font-weight:600}
nav a.l2{padding-left:18px;font-size:13px}nav a.l3{padding-left:28px;font-size:12.5px;opacity:.9}
main{flex:1;min-width:0}
main>h1:first-child{display:none}
h1,h2,h3,h4{line-height:1.3;scroll-margin-top:24px;letter-spacing:-.02em;font-weight:700}
h1{font-size:1.85rem;margin:1.8em 0 .8em}
h2{font-size:1.5rem;margin-top:2.2em;padding-bottom:.4em;border-bottom:1px solid var(--border)}
h3{font-size:1.25rem;margin-top:1.8em}
h4{font-size:1.05rem;margin-top:1.4em}
h1 .a,h2 .a,h3 .a{margin-left:.4em;color:var(--dim);text-decoration:none;opacity:0;font-weight:400;transition:opacity .15s;font-size:.85em}
h1:hover .a,h2:hover .a,h3:hover .a{opacity:1;color:var(--accent)}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
p{margin:1em 0}
ul,ol{padding-left:1.5em;margin:1em 0}
li{margin:.35em 0}
li::marker{color:var(--dim)}
blockquote{margin:1.4em 0;padding:.8em 1.2em;background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--dim);border-radius:0 10px 10px 0;box-shadow:var(--shadow)}
blockquote>:first-child{margin-top:0}blockquote>:last-child{margin-bottom:0}
.alert{--c:var(--accent);border-left:4px solid var(--c);background:color-mix(in srgb,var(--c) 8%,var(--surface));box-shadow:var(--shadow)}
.alert-title{display:flex;align-items:center;gap:6px;margin:0 0 .35em;color:var(--c);font-weight:700;font-size:14px}
.alert-tip{--c:#16a34a}.alert-important{--c:#9333ea}.alert-warning{--c:#d97706}.alert-caution{--c:#dc2626}
.alert-note .alert-title::before{content:"ℹ️ "}
.alert-tip .alert-title::before{content:"💡 "}
.alert-important .alert-title::before{content:"📌 "}
.alert-warning .alert-title::before{content:"⚠️ "}
.alert-caution .alert-title::before{content:"🚨 "}
.tw{margin:1.6em 0;border:1px solid var(--border);border-radius:10px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
.tw-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--surface)}
.tw-bar input{width:min(100%,280px);padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font:inherit;font-size:13px;outline:none;transition:border-color .15s}
.tw-bar input:focus{border-color:var(--accent)}
.tw-scroll{overflow:auto;max-height:70vh}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:14px}
th,td{padding:10px 16px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
th{position:sticky;top:0;background:var(--th);font-weight:650;font-size:12.5px;letter-spacing:.03em;color:var(--dim);text-transform:uppercase}
th.s{cursor:pointer;user-select:none;transition:color .15s}th.s:hover{color:var(--accent)}
th[data-d=asc]::after{content:" ▲";font-size:10px;color:var(--accent)}th[data-d=desc]::after{content:" ▼";font-size:10px;color:var(--accent)}
tbody tr:nth-child(even){background:var(--zebra)}
tbody tr{transition:background-color .1s}
tbody tr:hover{background:var(--accent-soft)}
tbody tr:last-child td{border-bottom:none}
code{padding:.18em .45em;background:var(--code-inline);border:1px solid var(--border);border-radius:5px;font:.88em ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.pw{position:relative;margin:1.4em 0}
pre{margin:0;padding:16px 20px;overflow:auto;background:var(--code-bg);color:var(--code-text);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow);font-size:13.5px;line-height:1.65}
pre code{padding:0;background:none;border:none;color:inherit;font-size:inherit}
.cp{position:absolute;top:9px;right:9px;padding:4px 10px;font-size:12px;font-weight:500;border:1px solid rgba(255,255,255,.2);border-radius:6px;background:rgba(255,255,255,.12);backdrop-filter:blur(4px);color:#e2e8f0;opacity:0;transition:all .15s ease}
.pw:hover .cp,.cp:focus{opacity:1}
.cp:hover{background:rgba(255,255,255,.25);color:#fff}
hr{border:0;border-top:1px solid var(--border);margin:2.5em 0}
#toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:#0f172a;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:var(--shadow-lg);opacity:0;transition:all .2s ease;pointer-events:none;z-index:50}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
#top{position:fixed;right:24px;bottom:24px;display:none;width:42px;height:42px;border:1px solid var(--border);border-radius:50%;background:var(--surface);color:var(--text);box-shadow:var(--shadow-md);align-items:center;justify-content:center;font-size:18px;font-weight:700;transition:all .15s ease}
#top:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-2px)}
@media (max-width:900px){.layout{display:block;padding:20px}nav{position:static;max-height:none;margin-bottom:24px}.hero-in{flex-direction:column}}
@media print{.tools{display:none!important}#bar,#top,nav,.tbtn,.cp,.tw-bar,.a,#toast{display:none!important}.layout{display:block;padding:0}.tw{box-shadow:none;border-color:#ccc}.tw-scroll{max-height:none;overflow:visible}tr,blockquote,.pw{break-inside:avoid}}
`

/** Chạy trong trang xuất (không dùng cú pháp cần build). Mọi truy cập storage bọc try/catch. */
const JS = `(function(){
var d=document,R=d.documentElement,$=function(s,c){return Array.prototype.slice.call((c||d).querySelectorAll(s))};
function store(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}}
var t=store('x2m-theme');if(t)R.setAttribute('data-theme',t);
R.setAttribute('data-w',store('x2m-w')||'full');if(store('x2m-toc')==='off')R.setAttribute('data-toc','off');var fs=parseInt(store('x2m-fs'))||16;function setFs(n){fs=Math.max(12,Math.min(24,n));R.style.setProperty('--fs',fs+'px');store('x2m-fs',String(fs))}setFs(fs);
function on(id,f){var e=d.getElementById(id);if(e)e.onclick=f}
on('wide',function(){var n=R.getAttribute('data-w')==='full'?'read':'full';R.setAttribute('data-w',n);store('x2m-w',n)});
on('tocb',function(){var off=R.getAttribute('data-toc')==='off';if(off)R.removeAttribute('data-toc');else R.setAttribute('data-toc','off');store('x2m-toc',off?'on':'off')});
on('print',function(){window.print()});
on('fsm',function(){setFs(fs-1)});on('fsp',function(){setFs(fs+1)});
function toast(m){var t=d.getElementById('toast');if(!t)return;t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},1800)}
var tb=d.getElementById('theme');if(tb)tb.onclick=function(){var dark=R.getAttribute('data-theme')==='dark'||(!R.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme:dark)').matches);var n=dark?'light':'dark';R.setAttribute('data-theme',n);store('x2m-theme',n)};
var bar=d.getElementById('bar'),top=d.getElementById('top'),links=$('nav a[href^="#"]'),heads=links.map(function(a){return d.getElementById(a.getAttribute('href').slice(1))});
function spy(){var h=d.body.scrollHeight-innerHeight,y=scrollY;bar.style.width=(h>0?y/h*100:0)+'%';top.style.display=y>600?'flex':'none';var cur=-1;for(var i=0;i<heads.length;i++){if(heads[i]&&heads[i].getBoundingClientRect().top<=90)cur=i}links.forEach(function(a,i){var on=i===cur;a.classList.toggle('on',on);if(on&&a.scrollIntoView){a.scrollIntoView({block:'nearest'})}})}
addEventListener('scroll',spy,{passive:true});spy();top.onclick=function(){scrollTo({top:0,behavior:'smooth'})};
var q=d.getElementById('tocq');if(q)q.oninput=function(){var v=q.value.toLowerCase();links.forEach(function(a){a.style.display=a.textContent.toLowerCase().indexOf(v)<0?'none':''})};
d.addEventListener('keydown',function(e){if(e.key==='/'&&d.activeElement!==q&&!/^(input|textarea)$/i.test(d.activeElement.tagName)){e.preventDefault();if(q){q.focus();q.select()}}else if(e.key==='Escape'&&d.activeElement===q){q.value='';q.dispatchEvent(new Event('input'));q.blur()}});
$('h1 .a,h2 .a,h3 .a').forEach(function(a){a.onclick=function(e){if(navigator.clipboard){navigator.clipboard.writeText(location.origin+location.pathname+a.getAttribute('href')).then(function(){toast('✓ Đã copy liên kết mục này')})}}});
$('pre').forEach(function(p){var w=d.createElement('div');w.className='pw';p.parentNode.insertBefore(w,p);w.appendChild(p);var b=d.createElement('button');b.className='cp';b.textContent='Copy';b.onclick=function(){var s=p.innerText;(navigator.clipboard?navigator.clipboard.writeText(s):Promise.reject()).then(function(){b.textContent='✓ Đã chép'},function(){var r=d.createRange();r.selectNodeContents(p);var g=getSelection();g.removeAllRanges();g.addRange(r);b.textContent='Đã chọn'});setTimeout(function(){b.textContent='Copy'},1500)};w.appendChild(b)});
$('.tw').forEach(function(w){var tbl=w.querySelector('table'),body=tbl.tBodies[0];if(!body)return;var rows=$('tr',body);
if(rows.length>8){var bb=d.createElement('div');bb.className='tw-bar';var i=d.createElement('input');i.placeholder='🔍 Lọc '+rows.length+' dòng...';i.oninput=function(){var v=i.value.toLowerCase();rows.forEach(function(r){r.style.display=r.textContent.toLowerCase().indexOf(v)<0?'none':''})};bb.appendChild(i);w.insertBefore(bb,w.firstChild)}
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
  let body = bodyHtml.replace(/<h([1-3])(\s+[^>]*)?>([\s\S]*?)<\/h\1>/gi, (_m, lv: string, _attrs: string, inner: string) => {
    const cleanInner = inner.replace(/<a class="a"[^>]*>#<\/a>/gi, '')
    const text = stripTags(cleanInner).trim()
    const base = slugify(text) || 's'
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    const id = n === 0 ? base : `${base}-${n + 1}`
    toc.push({ level: Number(lv), id, text })
    return `<h${lv} id="${escapeHtml(id)}">${cleanInner}<a class="a" href="#${escapeHtml(id)}" aria-label="Liên kết tới mục này">#</a></h${lv}>`
  })
  body = body.replace(/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:<br>|\n)?\s*/gi, (_m, k: string) => {
    const key = k.toUpperCase()
    return `<blockquote class="alert alert-${key.toLowerCase()}"><p class="alert-title">${ALERTS[key]}</p><p>`
  })
  body = body.replace(/<table>/g, '<div class="tw"><div class="tw-scroll"><table>').replace(/<\/table>/g, '</table></div></div>')

  const proseText = stripTags(body.replace(/<pre[\s\S]*?<\/pre>/gi, ''))
  const words = proseText.trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.round(words / 180))
  const timeLabel = minutes >= 60 ? `~${Math.round(minutes / 60)} giờ đọc` : `~${minutes} phút đọc`
  const tables = (body.match(/<table>/g) ?? []).length
  const chips = [timeLabel, `${toc.length} mục`]
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
    '<div class="tools">' +
    '<button class="tbtn" id="wide" type="button" title="Rộng toàn màn hình / Cột đọc">Rộng / Đọc</button>' +
    '<button class="tbtn" id="tocb" type="button" title="Ẩn / Hiện mục lục">Mục lục</button>' +
    '<button class="tbtn" id="print" type="button" title="In hoặc lưu PDF">In / PDF</button>' +
    '<button class="tbtn" id="fsm" type="button" aria-label="Giảm cỡ chữ">A−</button>' +
    '<button class="tbtn" id="fsp" type="button" aria-label="Tăng cỡ chữ">A+</button>' +
    '<button class="tbtn" id="theme" type="button" title="Đổi giao diện Sáng / Tối">Sáng / Tối</button></div></div></header>' +
    `<div class="layout">${nav}<main>${body}</main></div>` +
    '<button id="top" type="button" aria-label="Lên đầu trang">↑</button>' +
    '<div id="toast"></div>' +
    `<script>${JS}</script></body></html>\n`
  )
}
