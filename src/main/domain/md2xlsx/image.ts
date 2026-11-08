// Nhận dạng PNG/JPEG và đọc kích thước (pixel) từ header, không cần thư viện ảnh.
// Ảnh đến từ thư mục người dùng (không tin cậy): mọi chỗ đọc đều kiểm biên, sai định dạng -> null.

export interface ImageInfo {
  extension: 'png' | 'jpeg'
  width: number
  height: number
}

/** Kích thước tối đa chấp nhận mỗi chiều (ảnh hợp lệ không lớn vậy; số rác trong header bị loại). */
const MAX_SIDE = 30000
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const ok = (extension: ImageInfo['extension'], width: number, height: number): ImageInfo | null =>
  width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE ? { extension, width, height } : null

/** PNG: chữ ký 8 byte, chunk đầu là IHDR (rộng/cao uint32 big-endian ở byte 16/20). */
function pngSize(b: Buffer): ImageInfo | null {
  if (b.length < 24 || !PNG_SIG.every((x, i) => b[i] === x) || b.toString('latin1', 12, 16) !== 'IHDR') return null
  return ok('png', b.readUInt32BE(16), b.readUInt32BE(20))
}

/** JPEG: duyệt các segment tới marker SOF (C0–CF trừ C4/C8/CC), cao/rộng uint16 ở byte +5/+7. */
function jpegSize(b: Buffer): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const m = b[i + 1]
    if (m === 0xff) {
      i++ // byte đệm
      continue
    }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return ok('jpeg', b.readUInt16BE(i + 7), b.readUInt16BE(i + 5))
    // Marker đứng riêng (không có độ dài): TEM, RST0–7
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2
      continue
    }
    const len = b.readUInt16BE(i + 2)
    if (len < 2) return null
    i += 2 + len
  }
  return null
}

/** Định dạng + kích thước ảnh theo nội dung (không tin đuôi file); không phải PNG/JPEG hợp lệ -> null. */
export function imageInfo(b: Buffer): ImageInfo | null {
  return pngSize(b) ?? jpegSize(b)
}
