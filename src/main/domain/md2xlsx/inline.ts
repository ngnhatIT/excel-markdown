// Chữ hiển thị của ô (spec §6): biến token inline của marked thành đúng chữ người đọc thấy.
// Là chiều ngược của escapeMarkdownInline (src/main/output.ts): mọi thứ hàm đó escape
// đều phải quay về đúng chữ gốc ở đây.
import type { Tokens } from 'marked'
import type { XCell } from './model'

type Token = Tokens.Generic

const BR_RE = /^<br\s*\/?>$/i
// Chỉ các scheme này mới thành hyperlink (giống guards.ts); link nội bộ và scheme khác -> chữ thuần.
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

function textOf(tokens: Token[] | undefined): string {
  return (tokens ?? []).map(tokenText).join('')
}

function tokenText(t: Token): string {
  switch (t.type) {
    // `\x` -> `x`. Chữ này KHÔNG qua giải mã entity: `\&amp;` phải ra đúng `&amp;`.
    case 'escape':
      return t.raw.slice(1)
    case 'br':
      return '\n'
    // `<br>` thành xuống dòng; HTML khác (vd `<null>` viết tay không escape) giữ nguyên chữ.
    case 'html':
      return BR_RE.test(t.raw) ? '\n' : t.raw
    case 'strong':
    case 'em':
    case 'del':
    case 'link':
      return textOf(t.tokens)
    // Trong code `&amp;` hiển thị nguyên văn nên không giải mã.
    case 'codespan':
      return t.text
    case 'image':
      return t.tokens?.length ? textOf(t.tokens) : decodeEntities(t.text)
    // Chỉ chữ từ token `text` mới giải mã entity.
    case 'text':
      return t.tokens ? textOf(t.tokens) : decodeEntities(t.text)
    default:
      return t.raw
  }
}

/** Token inline của một ô -> chữ hiển thị (+ link nếu cả ô là đúng một link http/https/mailto). */
export function inlineCell(tokens: Token[] | undefined): XCell {
  if (!tokens || tokens.length === 0) return { text: '' }

  // Bỏ token chỉ gồm khoảng trắng; còn đúng một `link` viết tường minh (`[chữ](url)` hoặc `<url>`) mới thành hyperlink.
  // URL trần do GFM tự nhận (raw không bắt đầu bằng `[` hay `<`) chỉ giữ chữ.
  // `\<url>` do escaper sinh ra tách thành `escape` + `link` nên đã không lọt vào nhánh này.
  const significant = tokens.filter((t) => t.raw.trim() !== '')
  if (significant.length === 1) {
    const only = significant[0]
    const explicit = only.raw.startsWith('[') || only.raw.startsWith('<')
    if (only.type === 'link' && explicit && LINK_SCHEME_RE.test(only.href)) {
      return { text: textOf(only.tokens), link: only.href }
    }
  }
  return { text: textOf(tokens) }
}
