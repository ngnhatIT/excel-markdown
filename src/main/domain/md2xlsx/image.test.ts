import { describe, expect, it } from 'vitest'
import { imageInfo } from './image'

const png = (w: number, h: number) => {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'latin1')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}
/** JPEG tối giản: SOI, APP0 (bỏ qua), byte đệm, SOF0 với cao/rộng. */
const jpeg = (w: number, h: number) =>
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0])

describe('imageInfo', () => {
  it('PNG / JPEG: định dạng theo nội dung + kích thước từ header', () => {
    expect(imageInfo(png(640, 480))).toEqual({ extension: 'png', width: 640, height: 480 })
    expect(imageInfo(jpeg(1024, 768))).toEqual({ extension: 'jpeg', width: 1024, height: 768 })
  })

  it('dữ liệu rác / cắt cụt / kích thước 0 hoặc quá lớn -> null, không ném lỗi', () => {
    for (const b of [Buffer.from('GIF89a'), Buffer.alloc(0), png(0, 10), png(100_000, 10), png(1, 1).subarray(0, 20), jpeg(10, 10).subarray(0, 12), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])]) {
      expect(imageInfo(b)).toBeNull()
    }
  })
})
