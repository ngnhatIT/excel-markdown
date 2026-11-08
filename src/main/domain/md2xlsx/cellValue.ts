// Quy tắc chuyển chữ trong ô Markdown thành giá trị ô Excel (spec §6).
// Chỉ nhận dạng các dạng số "rõ ràng"; mọi thứ còn lại giữ nguyên là chữ
// để không làm mất số 0 đầu, mã, ngày tháng, v.v.

export interface CellValue {
  value: string | number
  numFmt?: string
}

// Số nguyên, tối đa 11 chữ số (không số 0 đầu) — 12 chữ số trở lên giữ dạng chữ.
const INT_RE = /^-?(0|[1-9]\d{0,10})$/
// Số thập phân: giữ số chữ số thập phân gốc qua numFmt (1.10 -> 0.00).
const DECIMAL_RE = /^-?(0|[1-9]\d*)\.(\d+)$/
// Nhóm nghìn bằng dấu phẩy, có thể kèm phần thập phân.
const THOUSANDS_RE = /^-?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/
// Phần trăm, có thể kèm phần thập phân.
const PERCENT_RE = /^-?(0|[1-9]\d*)(\.\d+)?%$/

/** Chuỗi numFmt thập phân: `0.` + `0` lặp theo số chữ số thập phân. */
function decimalFmt(fraction: string): string {
  return '0.' + '0'.repeat(fraction.length)
}

// Số double chỉ giữ đúng 15 chữ số có nghĩa: nhiều hơn thì Excel hiển thị sai chữ số -> giữ dạng chữ.
const MAX_DIGITS = 15

export function toCellValue(text: string): CellValue {
  const v = numberValue(text)
  // `-0`/`-0.0`: số -0 Excel hiển thị `0`, mất dấu `-` -> giữ chữ
  if (typeof v.value === 'number' && Object.is(v.value, -0)) return { value: text }
  return v
}

function numberValue(text: string): CellValue {
  if (INT_RE.test(text)) return { value: Number(text) }
  if ((text.match(/\d/g) ?? []).length > MAX_DIGITS) return { value: text }

  const dec = DECIMAL_RE.exec(text)
  if (dec) return { value: Number(text), numFmt: decimalFmt(dec[2]) }

  if (THOUSANDS_RE.test(text)) {
    const frac = text.split('.')[1]
    return {
      value: Number(text.replace(/,/g, '')),
      numFmt: frac === undefined ? '#,##0' : '#,##0.' + '0'.repeat(frac.length)
    }
  }

  if (PERCENT_RE.test(text)) {
    const body = text.slice(0, -1)
    const frac = body.split('.')[1]
    return {
      // Dịch dấu thập phân bằng số mũ để tránh sai số dấu phẩy động của phép chia 100.
      value: Number(body + 'e-2'),
      numFmt: frac === undefined ? '0%' : decimalFmt(frac) + '%'
    }
  }

  return { value: text }
}
