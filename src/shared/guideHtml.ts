/* Dựng trang HTML đứng riêng (dạng ghi chú hướng dẫn) từ HTML đã render + sanitize của Markdown.
 * Thuần, không phụ thuộc DOM/Node: dùng được ở renderer và test.
 * Trang có một script inline cố định (mục lục scrollspy, copy code, lọc/sắp xếp bảng, đổi giao diện);
 * `bodyHtml` đã sanitize nên không chứa script nào khác. */

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '')
/** Chữ thuần của đoạn HTML (đã escape): bỏ thẻ rồi giải entity, để escape lại một lần khi ghi ra. */
const htmlText = (s: string): string =>
  stripTags(s).replace(/&(lt|gt|quot|#39|#x27|amp);/g, (_m, e: string) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", amp: '&' })[e] ?? _m)

// scx (không phải Script) để tính cả ー、。「」 vốn thuộc script Common.
const CJK = /[\p{scx=Han}\p{scx=Hira}\p{scx=Kana}\uff00-\uffef]/gu

/** Tên file gợi ý (chưa có `.html`) từ tiêu đề preview: bỏ đuôi file, `/` thành ` - `.
 * Vd `book.xlsx / Rev.3` -> `book - Rev.3`, `docs/SC001.md` -> `docs - SC001`. */
export function guideFileStem(title: string | null): string {
  const stem = (title ?? '')
    .replace(/\.(md|markdown|xlsx|xlsm|xls|html)(?=\s*(?:[\\/]|$))/gi, '')
    .replace(/\s*[\\/]\s*/g, ' - ')
    .trim()
  return stem || 'ghi-chu'
}

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
:root{--bg:#f5f7fa;--surface:#fff;--panel:rgba(255,255,255,.72);--text:#141b26;--dim:#5a6678;--faint:#8693a5;--border:#e3e8ef;--border-2:#eef1f5;--accent:#1d5bd6;--accent-ink:#1a4fb8;--accent-soft:#ebf1fd;--code-bg:#0f1622;--code-head:#18212f;--code-text:#e3e9f2;--code-inline:#f0f3f7;--th:#f7f9fb;--zebra:#fafbfc;--glow:rgba(29,91,214,.10);--glow-2:rgba(22,138,122,.08);--shadow:0 1px 2px rgba(20,35,60,.05),0 4px 16px -6px rgba(20,35,60,.10);--shadow-lg:0 18px 40px -16px rgba(20,35,60,.28);--note:#1d5bd6;--tip:#168a4a;--imp:#7a4fd0;--warn:#b87a11;--caution:#d13838}
:root[data-theme=dark]{--bg:#0b1018;--surface:#111823;--panel:rgba(17,24,35,.72);--text:#e6ebf2;--dim:#9aa7b8;--faint:#6f7d90;--border:#212b3a;--border-2:#1a2230;--accent:#6ea2ff;--accent-ink:#8db6ff;--accent-soft:rgba(110,162,255,.12);--code-bg:#080c12;--code-head:#101722;--code-text:#e3e9f2;--code-inline:#18212e;--th:#141c28;--zebra:#0f1520;--glow:rgba(59,130,246,.16);--glow-2:rgba(45,168,160,.10);--shadow:0 1px 2px rgba(0,0,0,.3),0 6px 20px -8px rgba(0,0,0,.5);--shadow-lg:0 20px 44px -16px rgba(0,0,0,.65);--note:#6ea2ff;--tip:#3fbf75;--imp:#a98bf0;--warn:#e5a93b;--caution:#ef6b68}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0b1018;--surface:#111823;--panel:rgba(17,24,35,.72);--text:#e6ebf2;--dim:#9aa7b8;--faint:#6f7d90;--border:#212b3a;--border-2:#1a2230;--accent:#6ea2ff;--accent-ink:#8db6ff;--accent-soft:rgba(110,162,255,.12);--code-bg:#080c12;--code-head:#101722;--code-text:#e3e9f2;--code-inline:#18212e;--th:#141c28;--zebra:#0f1520;--glow:rgba(59,130,246,.16);--glow-2:rgba(45,168,160,.10);--shadow:0 1px 2px rgba(0,0,0,.3),0 6px 20px -8px rgba(0,0,0,.5);--shadow-lg:0 20px 44px -16px rgba(0,0,0,.65);--note:#6ea2ff;--tip:#3fbf75;--imp:#a98bf0;--warn:#e5a93b;--caution:#ef6b68}}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:76px}
body{margin:0;min-height:100dvh;background:radial-gradient(70vw 50vh at 0% 0%,var(--glow),transparent 70%),radial-gradient(60vw 50vh at 100% 0%,var(--glow-2),transparent 70%) no-repeat,var(--bg);color:var(--text);font:var(--fs,16px)/1.75 system-ui,-apple-system,"Segoe UI","Yu Gothic UI","Hiragino Sans","Meiryo","Noto Sans JP",Roboto,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
button{font:inherit;cursor:pointer;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
#bar{position:fixed;inset:0 0 auto 0;height:2px;width:0;background:var(--accent);z-index:60}
.top{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:12px;height:56px;padding:0 20px;background:var(--panel);backdrop-filter:blur(18px) saturate(180%);-webkit-backdrop-filter:blur(18px) saturate(180%);border-bottom:1px solid var(--border)}
.brand{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.logo{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:linear-gradient(160deg,var(--accent),var(--accent-ink));color:#fff;font-size:11px;font-weight:800;letter-spacing:.02em;box-shadow:inset 0 1px 0 rgba(255,255,255,.3)}
.doc-t{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transform:translateY(4px);transition:opacity .2s,transform .2s}
:root[data-scrolled] .doc-t{opacity:1;transform:none}
.tools{display:flex;gap:2px;align-items:center}
.tools .sep{width:1px;height:20px;background:var(--border);margin:0 6px}
.ib{display:inline-grid;place-items:center;min-width:34px;height:34px;padding:0 8px;border:0;border-radius:9px;background:transparent;color:var(--dim);font-size:13px;font-weight:600;transition:background .15s,color .15s,transform .1s}
.ib:hover{background:var(--accent-soft);color:var(--accent-ink)}
.ib:active{transform:scale(.95)}
.ib svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
#menu{display:none}
.shell{display:flex;align-items:flex-start;gap:48px;padding:0 32px}
nav{flex:0 0 264px;position:sticky;top:56px;max-height:calc(100dvh - 56px);overflow:auto;padding:28px 4px 28px 0;font-size:13.5px;scrollbar-width:thin}
:root[data-toc=off] nav{display:none}
.nav-h{display:flex;align-items:center;justify-content:space-between;margin:0 0 12px;color:var(--text);font-size:12.5px;font-weight:700}
.nav-h span{color:var(--faint);font-weight:500;font-variant-numeric:tabular-nums}
.sq{position:relative;margin-bottom:14px}
nav input{width:100%;padding:8px 34px 8px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font:inherit;font-size:13px;outline:none;transition:border-color .15s,box-shadow .15s}
nav input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.sq kbd{position:absolute;right:8px;top:50%;transform:translateY(-50%);padding:1px 6px;border:1px solid var(--border);border-radius:5px;color:var(--faint);font:11px ui-monospace,Consolas,monospace;pointer-events:none}
.toc{position:relative;border-left:1px solid var(--border)}
nav a{position:relative;display:block;margin-left:-1px;padding:5px 10px 5px 14px;border-left:2px solid transparent;color:var(--dim);text-decoration:none;line-height:1.45;transition:color .12s,border-color .12s}
nav a:hover{color:var(--text)}
nav a.on{border-left-color:var(--accent);color:var(--accent-ink);font-weight:600}
nav a.l1{color:var(--text)}
nav a.l2{padding-left:14px}nav a.l3{padding-left:28px;font-size:13px}
main{flex:1;min-width:0;padding:44px 0 40px}
:root[data-w=read] main{max-width:780px}
.hero{margin-bottom:36px;padding-bottom:28px;border-bottom:1px solid var(--border)}
.eyebrow{display:inline-flex;align-items:center;gap:8px;margin-bottom:14px;color:var(--accent-ink);font-size:12.5px;font-weight:600}
.eyebrow::before{content:"";width:18px;height:2px;border-radius:2px;background:var(--accent)}
.hero h1{margin:0 0 18px;font-size:clamp(1.9rem,1.4rem + 1.6vw,2.6rem);font-weight:750;letter-spacing:-.028em;line-height:1.18;text-wrap:balance}
.meta{display:flex;flex-wrap:wrap;gap:8px}
.meta span{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--dim);font-size:12.5px;font-weight:500;font-variant-numeric:tabular-nums}
.meta span::before{content:"";width:6px;height:6px;border-radius:2px;background:var(--faint)}
.meta span:first-child::before{background:var(--accent)}
.doc>h1:first-child{display:none}
.doc>:first-child,.doc>h1:first-child+*{margin-top:0}
.doc p,.doc li,.doc blockquote{max-width:78ch}
h1,h2,h3,h4{line-height:1.3;letter-spacing:-.018em;font-weight:700;text-wrap:balance}
.doc h1{font-size:1.75rem;margin:2.2em 0 .7em}
.doc h2{font-size:1.4rem;margin:2.4em 0 .8em;padding-top:1.2em;border-top:1px solid var(--border-2)}
.doc h3{font-size:1.14rem;margin:1.9em 0 .6em}
.doc h4{font-size:1rem;margin:1.5em 0 .5em;color:var(--dim)}
.a{margin-left:.35em;color:var(--faint);text-decoration:none;font-weight:400;opacity:0;transition:opacity .15s}
h1:hover .a,h2:hover .a,h3:hover .a,.a:focus{opacity:1;color:var(--accent)}
a{color:var(--accent-ink);text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--accent) 35%,transparent);text-underline-offset:3px}
a:hover{text-decoration-color:currentColor}
p{margin:1em 0}
ul,ol{padding-left:1.4em;margin:1em 0}
li{margin:.3em 0}li::marker{color:var(--faint)}
strong{font-weight:650}
hr{border:0;border-top:1px solid var(--border);margin:2.5em 0}
blockquote{margin:1.5em 0;padding:.9em 1.2em;border-left:3px solid var(--border);color:var(--dim);background:color-mix(in srgb,var(--surface) 60%,transparent);border-radius:0 10px 10px 0}
blockquote>:first-child{margin-top:0}blockquote>:last-child{margin-bottom:0}
.alert{--c:var(--note);border:1px solid color-mix(in srgb,var(--c) 22%,var(--border));border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 6%,var(--surface));color:var(--text)}
.alert-title{display:flex;align-items:center;gap:8px;margin:0 0 .3em;color:var(--c);font-weight:700;font-size:13.5px}
.alert-title::before{content:"i";display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--c);color:var(--surface);font:700 11px/1 system-ui,sans-serif}
.alert-tip{--c:var(--tip)}.alert-important{--c:var(--imp)}.alert-warning{--c:var(--warn)}.alert-caution{--c:var(--caution)}
.alert-tip .alert-title::before{content:"✓"}.alert-important .alert-title::before{content:"★"}.alert-warning .alert-title::before,.alert-caution .alert-title::before{content:"!"}
.tw{margin:1.6em 0;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
.tw-bar{display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--border)}
.tw-bar input{width:min(100%,260px);padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font:inherit;font-size:13px;outline:none}
.tw-bar input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.tw-bar span{margin-left:auto;color:var(--faint);font-size:12px;font-variant-numeric:tabular-nums}
.tw-scroll{overflow:auto;max-height:72vh}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:14px;font-variant-numeric:tabular-nums}
th,td{padding:9px 14px;border-bottom:1px solid var(--border-2);text-align:left;vertical-align:top}
td+td,th+th{border-left:1px solid var(--border-2)}
th{position:sticky;top:0;z-index:1;background:var(--th);color:var(--text);font-weight:650;font-size:13px;white-space:nowrap;border-bottom-color:var(--border)}
th.s{cursor:pointer;user-select:none}th.s:hover{color:var(--accent-ink)}
th[data-d=asc]::after{content:" ↑";color:var(--accent)}th[data-d=desc]::after{content:" ↓";color:var(--accent)}
tbody tr:nth-child(even){background:var(--zebra)}
tbody tr:hover{background:var(--accent-soft)}
tbody tr:last-child td{border-bottom:none}
code{padding:.15em .4em;background:var(--code-inline);border-radius:6px;font:.86em ui-monospace,"Cascadia Code","SF Mono",Menlo,Consolas,monospace}
.pw{margin:1.5em 0;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--code-bg);box-shadow:var(--shadow)}
.pw-h{display:flex;align-items:center;justify-content:space-between;padding:6px 8px 6px 14px;background:var(--code-head);border-bottom:1px solid rgba(255,255,255,.06);color:#8b97a8;font:600 11.5px ui-monospace,Consolas,monospace;letter-spacing:.02em}
pre{margin:0;padding:16px 18px;overflow:auto;color:var(--code-text);font-size:13.5px;line-height:1.65;background:var(--code-bg)}
pre code{padding:0;background:none;color:inherit;font-size:inherit}
.cp{padding:3px 10px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:rgba(255,255,255,.06);color:#c9d2de;font:500 12px system-ui,sans-serif;transition:background .15s}
.cp:hover{background:rgba(255,255,255,.14);color:#fff}
.mmd{margin:1.8em 0;padding:24px;border:1px solid var(--border);border-radius:14px;background:#fff;box-shadow:var(--shadow);overflow:auto;text-align:center}
.mmd svg{max-width:100%;height:auto}
.foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;margin-top:64px;padding:20px 64px 0 0;border-top:1px solid var(--border);color:var(--faint);font-size:12.5px}
.foot a{color:var(--dim)}
#toast{position:fixed;bottom:24px;left:50%;z-index:70;transform:translate(-50%,16px);padding:8px 16px;border-radius:10px;background:var(--text);color:var(--bg);font-size:13px;font-weight:500;box-shadow:var(--shadow-lg);opacity:0;transition:opacity .2s,transform .2s;pointer-events:none}
#toast.show{opacity:1;transform:translate(-50%,0)}
#top{position:fixed;right:24px;bottom:24px;z-index:40;display:none;place-items:center;width:42px;height:42px;border:1px solid var(--border);border-radius:12px;background:var(--panel);backdrop-filter:blur(12px);color:var(--dim);box-shadow:var(--shadow);transition:color .15s,transform .15s}
#top:hover{color:var(--accent-ink);transform:translateY(-2px)}
.scrim{display:none}
@media (max-width:960px){
#menu{display:inline-grid}
.shell{display:block;padding:0 20px}
nav{position:fixed;top:56px;left:0;bottom:0;z-index:45;width:min(86vw,320px);max-height:none;padding:20px;background:var(--surface);border-right:1px solid var(--border);box-shadow:var(--shadow-lg);transform:translateX(-102%);transition:transform .25s cubic-bezier(.2,.8,.2,1)}
:root[data-nav] nav{transform:none}
:root[data-nav] .scrim{display:block;position:fixed;inset:56px 0 0 0;z-index:44;background:rgba(10,15,25,.35)}
:root[data-toc=off] nav{display:block}
#tocb{display:none}
main{padding-top:28px}
.tools .sep,#fsm,#fsp{display:none}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
@page{margin:16mm 14mm}
@media print{
body{background:#fff;color:#000;font-size:11pt}
.top,#bar,#top,nav,.scrim,.cp,.tw-bar,.a,#toast{display:none!important}
.shell{display:block;padding:0}main{padding:0;max-width:none!important}
.hero{border-color:#ccc}.meta span{border-color:#ccc}
.tw,.pw,.mmd{box-shadow:none;border-color:#ccc}.tw-scroll{max-height:none;overflow:visible}
th{position:static}
pre{white-space:pre-wrap;word-break:break-word}
h2,h3{break-after:avoid}tr,blockquote,.pw,.mmd,figure{break-inside:avoid}
a{color:inherit;text-decoration:none}
}
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
on('menu',function(){if(R.hasAttribute('data-nav'))R.removeAttribute('data-nav');else R.setAttribute('data-nav','')});
var sc=d.querySelector('.scrim');if(sc)sc.onclick=function(){R.removeAttribute('data-nav')};
on('fsm',function(){setFs(fs-1)});on('fsp',function(){setFs(fs+1)});
function toast(m){var t=d.getElementById('toast');if(!t)return;t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},1800)}
var tb=d.getElementById('theme');if(tb)tb.onclick=function(){var dark=R.getAttribute('data-theme')==='dark'||(!R.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme:dark)').matches);var n=dark?'light':'dark';R.setAttribute('data-theme',n);store('x2m-theme',n)};
var bar=d.getElementById('bar'),top=d.getElementById('top'),nav=d.querySelector('nav'),np=d.getElementById('np'),last=-2,links=$('nav a[href^="#"]'),heads=links.map(function(a){return d.getElementById(a.getAttribute('href').slice(1))});
function spy(){var h=d.body.scrollHeight-innerHeight,y=scrollY,pc=h>0?Math.min(100,y/h*100):0;bar.style.width=pc+'%';if(np)np.textContent=Math.round(pc)+'%';if(y>140)R.setAttribute('data-scrolled','');else R.removeAttribute('data-scrolled');top.style.display=y>600?'grid':'none';var cur=-1;for(var i=0;i<heads.length;i++){if(heads[i]&&heads[i].getBoundingClientRect().top<=90)cur=i}if(h>0&&y>=h-2&&heads.length)cur=heads.length-1;if(cur===last)return;last=cur;links.forEach(function(a,i){a.classList.toggle('on',i===cur)});
var a=links[cur];if(a&&a.offsetParent){var r=a.getBoundingClientRect(),n=nav.getBoundingClientRect();if(r.top<n.top)nav.scrollTop+=r.top-n.top;else if(r.bottom>n.bottom)nav.scrollTop+=r.bottom-n.bottom}}
links.forEach(function(a){a.addEventListener('click',function(){R.removeAttribute('data-nav')})});
addEventListener('scroll',spy,{passive:true});spy();top.onclick=function(){scrollTo({top:0,behavior:'smooth'})};
var q=d.getElementById('tocq');if(q)q.oninput=function(){var v=q.value.toLowerCase();links.forEach(function(a){a.style.display=a.textContent.toLowerCase().indexOf(v)<0?'none':''})};
d.addEventListener('keydown',function(e){if(e.key==='/'&&d.activeElement!==q&&!/^(input|textarea)$/i.test(d.activeElement.tagName)){e.preventDefault();if(q){q.focus();q.select()}}else if(e.key==='Escape'&&d.activeElement===q){q.value='';q.dispatchEvent(new Event('input'));q.blur()}});
$('h1 .a,h2 .a,h3 .a').forEach(function(a){a.onclick=function(e){if(navigator.clipboard){navigator.clipboard.writeText(location.href.split('#')[0]+a.getAttribute('href')).then(function(){toast('✓ Đã copy liên kết mục này')})}}});
$('pre').forEach(function(p){var w=d.createElement('div');w.className='pw';var hd=d.createElement('div');hd.className='pw-h';var c=p.querySelector('code'),m=c&&/language-([a-z0-9-]+)/i.exec(c.className),lb=d.createElement('span');lb.textContent=m?m[1]:'code';hd.appendChild(lb);p.parentNode.insertBefore(w,p);w.appendChild(hd);w.appendChild(p);var b=d.createElement('button');b.type='button';b.className='cp';b.textContent='Copy';b.onclick=function(){var s=p.innerText;(navigator.clipboard?navigator.clipboard.writeText(s):Promise.reject()).then(function(){b.textContent='✓ Đã chép'},function(){var r=d.createRange();r.selectNodeContents(p);var g=getSelection();g.removeAllRanges();g.addRange(r);b.textContent='Đã chọn'});setTimeout(function(){b.textContent='Copy'},1500)};hd.appendChild(b)});
$('.tw').forEach(function(w){var tbl=w.querySelector('table'),body=tbl.tBodies[0];if(!body)return;var rows=$('tr',body);
if(rows.length>8){var bb=d.createElement('div');bb.className='tw-bar';var i=d.createElement('input');i.type='search';i.placeholder='Lọc '+rows.length+' dòng...';i.setAttribute('aria-label','Lọc dòng trong bảng');var cn=d.createElement('span');cn.textContent=rows.length+' dòng';i.oninput=function(){var v=i.value.toLowerCase(),n=0;rows.forEach(function(r){var hit=r.textContent.toLowerCase().indexOf(v)>=0;r.style.display=hit?'':'none';if(hit)n++});cn.textContent=(v?n+' / ':'')+rows.length+' dòng'};bb.appendChild(i);bb.appendChild(cn);w.insertBefore(bb,w.firstChild)}
$('th',tbl).forEach(function(th,c){th.classList.add('s');th.onclick=function(){var asc=th.getAttribute('data-d')!=='asc';$('th',tbl).forEach(function(x){x.removeAttribute('data-d')});th.setAttribute('data-d',asc?'asc':'desc');
var k=function(r){return r.cells[c]?r.cells[c].textContent.trim():''};rows.sort(function(a,b){var x=k(a),y=k(b),nx=parseFloat(x.replace(/,/g,'')),ny=parseFloat(y.replace(/,/g,''));var r=(!isNaN(nx)&&!isNaN(ny))?nx-ny:x.localeCompare(y,undefined,{numeric:true});return asc?r:-r});rows.forEach(function(r){body.appendChild(r)})}})});
})();`

/** Icon nét (stroke) nội tuyến cho thanh công cụ của trang xuất. */
const svg = (d: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`
const ICON = {
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  toc: svg('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
  wide: svg('<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>'),
  theme: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>'),
  print: svg('<path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/>'),
  up: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
}

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
    const text = htmlText(cleanInner).trim()
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
  // Chữ Nhật/Trung không có khoảng trắng: đếm theo ký tự (~500/phút), phần còn lại theo từ (~180/phút).
  const cjk = proseText.match(CJK)?.length ?? 0
  const words = proseText.replace(CJK, ' ').split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.round(words / 180 + cjk / 500))
  const timeLabel = minutes >= 60 ? `~${Math.round(minutes / 60)} giờ đọc` : `~${minutes} phút đọc`
  const tables = (body.match(/<table>/g) ?? []).length
  const chips = [timeLabel, `${toc.length} mục`]
  if (tables > 0) chips.push(`${tables} bảng`)
  const diagrams = (body.match(/class="mmd"/g) ?? []).length
  if (diagrams > 0) chips.push(`${diagrams} sơ đồ`)
  if (meta.date) chips.push(escapeHtml(meta.date))

  const nav =
    toc.length >= 2
      ? '<nav aria-label="Mục lục"><div class="nav-h">Trong tài liệu<span id="np">0%</span></div>' +
        '<div class="sq"><input id="tocq" type="search" placeholder="Tìm mục..." aria-label="Tìm mục"><kbd>/</kbd></div><div class="toc">' +
        toc.map((t) => `<a class="l${t.level}" href="#${escapeHtml(t.id)}">${escapeHtml(t.text)}</a>`).join('') +
        '</div></nav>'
      : '<nav hidden></nav>'
  const tool = (id: string, label: string, inner: string): string =>
    `<button class="ib" id="${id}" type="button" title="${label}" aria-label="${label}">${inner}</button>`
  return (
    '<!doctype html>\n<html lang="vi"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light dark">' +
    '<meta name="generator" content="ExcelToMarkdown">' +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<title>${escapeHtml(title)}</title><style>${CSS}</style></head><body>` +
    '<div id="bar"></div>' +
    '<header class="top">' +
    tool('menu', 'Mục lục', ICON.menu) +
    `<div class="brand"><span class="logo" aria-hidden="true">MD</span><span class="doc-t">${escapeHtml(title)}</span></div>` +
    '<div class="tools">' +
    tool('tocb', 'Ẩn / hiện mục lục', ICON.toc) +
    tool('wide', 'Rộng toàn màn hình / cột đọc', ICON.wide) +
    '<span class="sep"></span>' +
    tool('fsm', 'Giảm cỡ chữ', 'A−') +
    tool('fsp', 'Tăng cỡ chữ', 'A+') +
    '<span class="sep"></span>' +
    tool('theme', 'Đổi giao diện sáng / tối', ICON.theme) +
    tool('print', 'In hoặc lưu PDF', ICON.print) +
    '</div></header><div class="scrim"></div>' +
    `<div class="shell">${nav}<main>` +
    `<header class="hero"><div class="eyebrow">Tài liệu</div><h1>${escapeHtml(title)}</h1>` +
    `<div class="meta">${chips.map((c) => `<span>${c}</span>`).join('')}</div></header>` +
    `<article class="doc">${body}</article>` +
    `<footer class="foot"><span>Xuất từ ExcelToMarkdown${meta.date ? ` · ${escapeHtml(meta.date)}` : ''}</span><a href="#">Lên đầu trang ↑</a></footer>` +
    '</main></div>' +
    `<button id="top" type="button" aria-label="Lên đầu trang">${ICON.up}</button>` +
    '<div id="toast" role="status" aria-live="polite"></div>' +
    `<script>${JS}</script></body></html>\n`
  )
}
