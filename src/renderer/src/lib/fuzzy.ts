/* Khớp mờ cho bảng lệnh Ctrl+K (thuần, có test). */

/** NFKC (toàn角 -> 半角, ｶﾅ半角 -> カナ) + chữ thường, để `ＡＢＣ` khớp `abc`. */
const norm = (s: string): string => s.normalize('NFKC').toLowerCase()

const isBoundary = (ch: string | undefined): boolean => ch === undefined || /[\s/\\_.\-・›]/.test(ch)

/** Điểm khớp của `query` trong `text`, null nếu không khớp. Chuỗi liền (vd `b.md`) luôn hơn khớp rời rạc
 * (ký tự theo thứ tự, vd `bmd`); cùng loại thì ưu tiên khớp sớm, đầu từ, chuỗi ngắn. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = norm(query).trim()
  if (q === '') return 0
  const t = norm(text)
  const tieBreak = Math.min(t.length, 999) / 1000
  const at = t.indexOf(q)
  if (at >= 0) return 2000 - Math.min(at, 500) + (isBoundary(t[at - 1]) ? 200 : 0) - tieBreak
  // Theo code point để chữ ngoài BMP (emoji, kanji hiếm) không bị tách đôi
  const qs = Array.from(q.replace(/\s+/g, ''))
  const ts = Array.from(t)
  let qi = 0
  let first = -1
  let prev = -2
  let runs = 0
  let gaps = 0
  for (let i = 0; i < ts.length && qi < qs.length; i++) {
    if (ts[i] !== qs[qi]) continue
    if (first < 0) first = i
    if (i !== prev + 1) runs++
    if (prev >= 0) gaps += i - prev - 1
    prev = i
    qi++
  }
  if (qi < qs.length) return null
  // Tối đa 980 < điểm thấp nhất của chuỗi liền (~1499)
  return 1000 - runs * 20 - Math.min(gaps, 300) - Math.min(first, 300) - tieBreak
}

/** Lọc + xếp `items` theo `query` (giữ thứ tự gốc khi bằng điểm), tối đa `limit` kết quả. */
export function fuzzyRank<T>(query: string, items: readonly T[], text: (item: T) => string, limit = 50): T[] {
  const scored: Array<{ item: T; score: number; i: number }> = []
  items.forEach((item, i) => {
    const score = fuzzyScore(query, text(item))
    if (score !== null) scored.push({ item, score, i })
  })
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  return scored.slice(0, limit).map((x) => x.item)
}
