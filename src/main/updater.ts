/* Kiểm tra cập nhật THỦ CÔNG (chỉ khi người dùng bấm "Kiểm tra cập nhật"): app hứa không gọi mạng
 * ngoài nhà cung cấp AI, nên không có kiểm tra tự động / nền. Không tải hay cài gì: chỉ báo bản mới
 * và trả link trang release để mở bằng shell.openExternal.
 */
import { app } from 'electron'

const REPO = 'ngnhatIT/excel-markdown'
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`
export const RELEASES_URL = `https://github.com/${REPO}/releases`

/** `v2.3.0` / `2.3.0-beta.1` -> [2, 3, 0, isPrerelease]; null nếu không phải semver. */
function parse(v: string): [number, number, number, boolean] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] !== undefined] : null
}

/** a mới hơn b? So major.minor.patch; cùng số thì bản chính thức mới hơn bản pre-release.
 * shortcut: không so thứ tự giữa hai pre-release (beta.1 vs beta.2), đủ vì releases/latest bỏ qua pre-release. */
export function isNewer(a: string, b: string): boolean {
  const x = parse(a)
  const y = parse(b)
  if (!x || !y) return false
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] as number) > (y[i] as number)
  return !x[3] && y[3]
}

export interface UpdateInfo {
  latest: string
  url: string
  newer: boolean
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const res = await fetch(API_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `ExcelToMarkdown/${app.getVersion()}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Không kiểm tra được bản mới (GitHub trả về HTTP ${res.status}).`)
  const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown }
  const latest = typeof body.tag_name === 'string' ? body.tag_name.replace(/^v/, '') : ''
  if (!parse(latest)) throw new Error('Không đọc được phiên bản mới nhất từ GitHub.')
  // Link sẽ được mở bằng shell.openExternal: chỉ nhận trang release của đúng repo
  const url =
    typeof body.html_url === 'string' && body.html_url.startsWith(RELEASES_URL + '/') ? body.html_url : RELEASES_URL
  return { latest, url, newer: isNewer(latest, app.getVersion()) }
}
