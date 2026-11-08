// Chữ hiển thị của ô (spec §6): biến token inline của marked thành đúng chữ người đọc thấy.
// Là chiều ngược của escapeMarkdownInline (src/main/output.ts): mọi thứ hàm đó escape
// đều phải quay về đúng chữ gốc ở đây.
import type { Tokens } from 'marked'
import type { Run, XCell } from './model'

type Token = Tokens.Generic

const BR_RE = /^<br\s*\/?>$/i
// Chỉ các scheme này mới thành hyperlink ra ngoài (giống guards.ts); scheme khác -> chữ thuần.
const LINK_SCHEME_RE = /^(?:https?|mailto):/i

// Entity HTML thường gặp: tên (&amp; ...) và số (&#NN; / &#xHH;).
const ENTITY_RE = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos|nbsp));/g
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Giải mã entity trong MỘT lượt (`&amp;lt;` -> `&lt;`, không giải mã lần hai).
 * Mã điểm không hợp lệ (0, surrogate, quá U+10FFFF) giữ nguyên dạng chữ. */
function decodeEntities(s: string): string {
  return s.replace(ENTITY_RE, (m, dec?: string, hex?: string, name?: string) => {
    if (name) return NAMED_ENTITIES[name]
    const cp = dec !== undefined ? parseInt(dec, 10) : parseInt(hex as string, 16)
    const valid = cp >= 1 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)
    return valid ? String.fromCodePoint(cp) : m
  })
}

type Style = Omit<Run, 'text'>

/** Ghép chữ vào run cuối nếu cùng định dạng, không thì mở run mới. */
function push(out: Run[], text: string, style: Style): void {
  if (text === '') return
  const last = out[out.length - 1]
  if (last && sameStyle(last, style)) last.text += text
  else out.push({ text, ...style })
}

const sameStyle = (a: Style, b: Style): boolean =>
  !a.bold === !b.bold && !a.italic === !b.italic && !a.strike === !b.strike && !a.code === !b.code

/** Link viết tường minh (`[chữ](url)` hoặc `<url>`); URL trần do GFM tự nhận (raw không mở bằng `[`/`<`) thì không. */
const explicitLink = (t: Token): boolean => t.type === 'link' && (t.raw.startsWith('[') || t.raw.startsWith('<'))

/** Các URL http/https/mailto viết tường minh trong cây token (cả link lồng trong `**…**`, quote, list). */
export function externalLinks(tokens: Token[] | undefined, out: string[] = []): string[] {
  for (const t of tokens ?? []) {
    if (explicitLink(t) && LINK_SCHEME_RE.test(t.href)) out.push(t.href)
    else {
      if (t.tokens) externalLinks(t.tokens, out)
      if (t.items) externalLinks(t.items, out)
    }
  }
  return out
}

function textOf(tokens: Token[] | undefined): string {
  const out: Run[] = []
  walk(tokens, {}, out, false)
  return out.map((r) => r.text).join('')
}

/** `withUrls`: ô có nhiều link -> sau chữ của mỗi link http/https/mailto thêm ` (url)` để không mất URL. */
function walk(tokens: Token[] | undefined, style: Style, out: Run[], withUrls: boolean): void {
  for (const t of tokens ?? []) emit(t, style, out, withUrls)
}

function emit(t: Token, style: Style, out: Run[], withUrls: boolean): void {
  switch (t.type) {
    // `\x` -> `x`. Chữ này KHÔNG qua giải mã entity: `\&amp;` phải ra đúng `&amp;`.
    case 'escape':
      return push(out, t.raw.slice(1), style)
    case 'br':
      return push(out, '\n', style)
    // `<br>` thành xuống dòng; HTML khác (vd `<null>` viết tay không escape) giữ nguyên chữ.
    case 'html':
      return push(out, BR_RE.test(t.raw) ? '\n' : t.raw, style)
    case 'strong':
      return walk(t.tokens, { ...style, bold: true }, out, withUrls)
    case 'em':
      return walk(t.tokens, { ...style, italic: true }, out, withUrls)
    case 'del':
      return walk(t.tokens, { ...style, strike: true }, out, withUrls)
    case 'link': {
      const at = out.length
      walk(t.tokens, style, out, withUrls)
      const label = out.slice(at).map((r) => r.text).join('')
      // `<https://x>`: chữ đã là URL, không lặp lại
      if (withUrls && explicitLink(t) && LINK_SCHEME_RE.test(t.href) && label !== t.href) push(out, ` (${t.href})`, style)
      return
    }
    // Trong code `&amp;` hiển thị nguyên văn nên không giải mã.
    case 'codespan':
      return push(out, t.text, { ...style, code: true })
    case 'image':
      return t.tokens?.length ? walk(t.tokens, style, out, withUrls) : push(out, decodeEntities(t.text), style)
    // Chỉ chữ từ token `text` mới giải mã entity.
    case 'text':
      return t.tokens ? walk(t.tokens, style, out, withUrls) : push(out, decodeEntities(t.text), style)
    default:
      return push(out, t.raw, style)
  }
}

/** Link nội bộ chờ giải: `#slug` hoặc đường dẫn tương đối tới file `.md` (không scheme). */
const INTERNAL_LINK_RE = /^(?:#.+|(?![a-z][a-z0-9+.-]*:)[^?#]+\.md(?:#.*)?)$/i

/**
 * Token inline của một ô -> chữ hiển thị (+ `link`, + `runs` khi có định dạng).
 * - Cả ô là đúng một link viết tường minh: http/https/mailto hoặc link nội bộ (`#slug`, `x.md`) -> `link`.
 * - Link http/https/mailto nằm giữa câu: đúng một link -> cả ô là hyperlink (chữ giữ nguyên); từ hai link trở lên
 *   -> giữ chữ và thêm ` (url)` sau mỗi link, không mất URL. `withUrls` ép chế độ thêm URL (khối nhiều đoạn có
 *   tổng cộng nhiều link). URL trần GFM tự nhận đã hiện nguyên chữ nên không tính.
 */
export function inlineCell(tokens: Token[] | undefined, withUrls = false): XCell {
  if (!tokens || tokens.length === 0) return { text: '' }

  // `\<url>` do escaper sinh ra tách thành `escape` + `link` nên không lọt vào nhánh "cả ô là một link".
  const significant = tokens.filter((t) => t.raw.trim() !== '')
  const only = significant.length === 1 ? significant[0] : undefined
  const whole = !withUrls && only && explicitLink(only) && (LINK_SCHEME_RE.test(only.href) || INTERNAL_LINK_RE.test(only.href))
  const links = whole || withUrls ? [] : externalLinks(tokens)
  const out: Run[] = []
  walk(whole ? only.tokens : tokens, {}, out, withUrls || links.length > 1)
  const cell: XCell = { text: out.map((r) => r.text).join('') }
  if (whole) cell.link = only.href
  else if (links.length === 1) cell.link = links[0]
  if (out.some((r) => r.bold || r.italic || r.strike || r.code)) cell.runs = out
  return cell
}
