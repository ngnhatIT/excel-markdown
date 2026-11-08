import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConvertResultItem, MdFileItem } from '../../../../shared/types'
import { defaultWorkbookName } from '../../../../shared/workbookName'
import { errMsg, type ConvertProgress } from '../../lib/api'
import { baseName, toast } from '../../lib/utils'
import { t } from '../../i18n'

/** Luồng Markdown → Excel: gộp các file Markdown thành một file Excel.
 * Cờ converting dùng chung với chế độ Excel → Markdown (main chỉ cho chạy một lần convert). */
export function useMdConvert({
  mdFiles,
  ensureOutDir,
  converting,
  setConverting,
  setProgress,
  setMdResult,
  onDone,
}: {
  mdFiles: MdFileItem[]
  ensureOutDir: () => Promise<string | null>
  converting: boolean
  setConverting: (v: boolean) => void
  /** Để xóa tiến độ còn sót của lần convert Excel trước. */
  setProgress: (p: ConvertProgress | null) => void
  /** State kết quả do App giữ (App còn xóa nó khi đổi file, Esc). */
  setMdResult: (r: ConvertResultItem | null) => void
  /** Gọi khi tạo file Excel xong (cập nhật thời điểm convert ở thanh dưới). */
  onDone: () => void
}) {
  /** Tên file Excel người dùng gõ; null = chưa sửa (dùng tên mặc định theo danh sách file) */
  const [mdName, setMdName] = useState<string | null>(null)

  const mdDefaultName = useMemo(() => defaultWorkbookName(mdFiles), [mdFiles])
  const mdSheetCount = useMemo(() => mdFiles.reduce((n, f) => n + f.sheets.length, 0), [mdFiles])
  const mdCanConvert = mdSheetCount > 0 && mdFiles.every((f) => !f.loading && !f.error)

  // danh sách rỗng -> lần thêm file sau lại dùng tên mặc định mới
  useEffect(() => {
    if (mdFiles.length === 0) setMdName(null)
  }, [mdFiles.length])

  const doMdConvert = useCallback(async () => {
    if (converting) return
    if (mdFiles.length === 0) {
      toast(t('toast.md.noFiles'), 'err')
      return
    }
    if (mdFiles.some((f) => f.loading)) {
      toast(t('toast.md.reading'), 'err')
      return
    }
    const bad = mdFiles.filter((f) => f.error)
    if (bad.length > 0) {
      // một file lỗi thì không tạo file Excel (thiếu sheet còn tệ hơn không có)
      toast(t('toast.md.badFiles', { names: bad.map((f) => f.name).join(', ') }), 'err')
      return
    }
    if (mdSheetCount === 0) {
      toast(t('toast.md.noSheets'), 'err')
      return
    }
    const dir = await ensureOutDir()
    if (!dir) return
    setConverting(true)
    setMdResult(null)
    setProgress(null)
    try {
      const res = await window.api.convertMarkdown({
        files: mdFiles.map((f) => f.path),
        outDir: dir,
        // ô tên để trống = dùng tên mặc định
        fileName: (mdName ?? '').trim() || mdDefaultName,
      })
      if (res.status === 'done') {
        const name = baseName(res.outPath)
        toast(t('toast.md.created', { name, n: res.sheets.length }))
        setMdResult({ fileName: name, ok: true, filesWritten: res.sheets })
        onDone()
      } else if (res.status === 'cancelled') {
        toast(t('toast.md.cancelled'), 'err')
      }
      // declined: người dùng chọn không ghi đè -> không làm gì
    } catch (err) {
      toast(errMsg(err), 'err')
    } finally {
      setConverting(false)
    }
  }, [converting, mdFiles, mdSheetCount, mdName, mdDefaultName, ensureOutDir, setConverting, setProgress, setMdResult, onDone])

  return { mdName, setMdName, mdDefaultName, mdSheetCount, mdCanConvert, doMdConvert }
}
