/* Ghi kết quả Excel → Markdown (file .md + ảnh) ra đĩa; app (IPC excel:convert) và CLI dùng chung. */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MdOutputFile } from '../../domain/excel/output'
import { isInsideDir } from '../../domain/guards'

/** Ghi lần lượt từng file (ảnh trước, .md sau). `onWritten` báo từng file .md đã ghi xong, để khi lỗi
 * giữa chừng nơi gọi biết chính xác những file nào đã có trên đĩa. */
export async function writeMdFiles(outDir: string, files: MdOutputFile[], onWritten: (name: string) => void): Promise<void> {
  for (const f of files) {
    for (const img of f.images ?? []) {
      const p = join(outDir, img.path)
      // Phòng thủ thêm: tên ảnh lấy từ file Excel, không bao giờ ghi ra ngoài thư mục xuất
      if (!isInsideDir(outDir, p)) throw new Error('Tên ảnh không hợp lệ trong file Excel: ' + img.path)
      await mkdir(dirname(p), { recursive: true })
      await writeFile(p, img.data)
    }
    await writeFile(join(outDir, f.name), f.text, 'utf-8')
    onWritten(f.name)
  }
}
