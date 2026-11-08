import { useCallback, useEffect, useState } from 'react'
import type { ConvertOptions, ConvertResultItem, FileItem, OutputMode } from '../../../../shared/types'
import { errMsg, type ConvertProgress } from '../../lib/api'
import { toast } from '../../lib/utils'

/** Luồng convert Excel → Markdown: gửi các sheet đã chọn, nhận tiến độ + kết quả.
 * Cờ converting dùng chung với chế độ Markdown → Excel (main chỉ cho chạy một lần convert). */
export function useExcelConvert({
  files,
  options,
  outputMode,
  ensureOutDir,
  converting,
  setConverting,
  setResults,
  onDone,
}: {
  files: FileItem[]
  options: ConvertOptions
  outputMode: OutputMode
  ensureOutDir: () => Promise<string | null>
  converting: boolean
  setConverting: (v: boolean) => void
  /** State kết quả do App giữ (App còn xóa nó khi đổi file/sheet, Esc). */
  setResults: (r: ConvertResultItem[] | null) => void
  /** Gọi khi convert thành công trọn vẹn (cập nhật thời điểm convert ở thanh dưới). */
  onDone: () => void
}) {
  const [progress, setProgress] = useState<ConvertProgress | null>(null)

  useEffect(() => window.api.onProgress((pr) => setProgress(pr)), [])

  const doConvert = useCallback(async () => {
    // đang chạy (kể cả lần tạo Excel ở chế độ kia): không gửi lần mới, tránh xóa cờ converting khi main từ chối
    if (converting) return
    if (files.length === 0) {
      toast('Chưa có file Excel nào', 'err')
      return
    }
    const specs = files
      .map((f) => ({ path: f.path, sheets: f.sheets.filter((s) => s.checked).map((s) => s.name) }))
      .filter((s) => s.sheets.length > 0)
    if (specs.length === 0) {
      toast('Chưa chọn sheet nào để convert', 'err')
      return
    }
    const dir = await ensureOutDir()
    if (!dir) return
    setConverting(true)
    setResults(null)
    setProgress(null)
    try {
      const res = await window.api.convert({ files: specs, outDir: dir, options, outputMode })
      setResults(res)
      const okCount = res.filter((r) => r.ok).length
      const cancelledCount = res.filter((r) => r.cancelled).length
      const mdCount = res.reduce((n, r) => n + r.filesWritten.length, 0)
      if (cancelledCount > 0) {
        toast(`Đã hủy: ${okCount} file Excel đã convert xong, ${cancelledCount} file bị hủy`, 'err')
      } else if (okCount === res.length) {
        toast(
          mdCount === 0
            ? 'Không tạo file nào (các sheet đều rỗng hoặc bị bỏ qua)'
            : `Xong: ${mdCount} file Markdown từ ${res.length} file Excel`
        )
        onDone()
      } else {
        toast(`${okCount}/${res.length} file thành công, xem chi tiết bên dưới`, 'err')
      }
    } catch (err) {
      toast(errMsg(err), 'err')
    } finally {
      setConverting(false)
      window.setTimeout(() => setProgress(null), 1500)
    }
  }, [converting, files, options, outputMode, ensureOutDir, setConverting, setResults, onDone])

  const cancelConvert = useCallback(() => {
    window.api.cancelConvert().catch((err) => toast(errMsg(err), 'err'))
  }, [])

  return { progress, setProgress, doConvert, cancelConvert }
}
