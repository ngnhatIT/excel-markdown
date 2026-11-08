/**
 * Sanitizer tối giản cho HTML preview Markdown.
 * Chỉ giữ các thẻ mà `marked` sinh ra (+ <br> của ô nhiều dòng);
 * mọi thẻ/attribute khác (script, img onerror, svg, iframe, ...) bị loại bỏ.
 * Không dùng dependency ngoài để giữ app nhẹ.
 */

const ALLOWED_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'code', 'pre', 'strong', 'em', 'del', 'hr', 'br', 'a', 'span',
])

const VOID_TAGS = new Set(['br', 'hr', 'img'])

export interface SanitizeOptions {
  /** URL được phép hiển thị cho `src` của ảnh (đã giải mã entity), null = bỏ ảnh.
   * Không truyền thì mọi `<img>` bị bỏ (preview Excel/Markdown → Excel không hiện ảnh). */
  resolveImage?: (src: string) => string | null
}

/** Giá trị attribute `name` trong phần thân thẻ (bỏ dấu nháy); null nếu không có. */
function attr(raw: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i').exec(raw)
  return m ? m[1].replace(/^['"]|['"]$/g, '') : null
}

const decodeEntities = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** Chỉ giữ href http/https/mailto hoặc relative; chặn javascript:/data:. */
function cleanHref(raw: string): string | null {
  const v = raw.trim().replace(/^['"]|['"]$/g, '')
  if (/^(https?:|mailto:)/i.test(v)) return v
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null
  return v
}

export function sanitizeHtml(html: string, opts: SanitizeOptions = {}): string {
  let out = ''
  let i = 0
  const len = html.length
  while (i < len) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      out += html.slice(i)
      break
    }
    out += html.slice(i, lt)
    const gt = html.indexOf('>', lt + 1)
    if (gt === -1) {
      out += '&lt;' + html.slice(lt + 1)
      break
    }
    const raw = html.slice(lt + 1, gt)
    const m = /^\/?\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(raw)
    const closing = raw.trimStart().startsWith('/')
    const tag = m ? m[1].toLowerCase() : ''
    if (tag === 'img' && !closing && opts.resolveImage) {
      const src = attr(raw, 'src')
      const url = src ? opts.resolveImage(decodeEntities(src)) : null
      if (url) out += `<img src="${escapeAttr(url)}" alt="${escapeAttr(decodeEntities(attr(raw, 'alt') ?? ''))}">`
      i = gt + 1
      continue
    }
    if (!tag || !ALLOWED_TAGS.has(tag)) {
      // Thẻ lạ: bỏ thẻ, giữ nội dung text bên trong
      i = gt + 1
      continue
    }
    if (closing) {
      out += VOID_TAGS.has(tag) ? '' : `</${tag}>`
      i = gt + 1
      continue
    }
    if (tag === 'a') {
      const hm = /href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(raw)
      const href = hm ? cleanHref(hm[1]) : null
      out += href ? `<a href="${href.replace(/"/g, '&quot;')}">` : '<a>'
    } else if (tag === 'code' && /^language-[\w-]+$/.test(attr(raw, 'class') ?? '')) {
      // Giữ nhãn ngôn ngữ của khối code (vd language-mermaid để vẽ sơ đồ)
      out += `<code class="${attr(raw, 'class')}">`
    } else {
      out += `<${tag}>`
    }
    i = gt + 1
  }
  return out
}
