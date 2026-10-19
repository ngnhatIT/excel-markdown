import { useCallback, useRef, useState } from 'react'
import type { FileItem, SheetInfo } from '../../../types'
import type { SheetListItem } from '../api'
import { errMsg } from '../api'
import { toast, uid } from '../utils'

const EXCEL_EXT = /\.(xlsx|xlsm|xls|xltx|xltm)$/i
/** Số file tối đa được nhớ lựa chọn sheet. */
const MAX_REMEMBERED = 50

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

const withChecks = (sheets: SheetListItem[], remembered?: string[]): SheetInfo[] =>
  sheets.map((s) => ({
    ...s,
    // Nhớ lựa chọn lần trước; sheet mới mặc định chọn trừ sheet ẩn
    checked: remembered ? remembered.includes(s.name) : !s.hidden,
  }))

/** Danh sách file Excel + sheet, lựa chọn sheet (nhớ theo đường dẫn file qua store). */
export function useFiles(skipDelSheets: boolean, persist: (key: string, value: unknown) => void) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [savedChecks, setSavedChecks] = useState<Record<string, string[]>>({})
  const savedChecksRef = useRef(savedChecks)
  savedChecksRef.current = savedChecks

  const patch = useCallback((match: (f: FileItem) => boolean, change: Partial<FileItem>) => {
    setFiles((prev) => prev.map((f) => (match(f) ? { ...f, ...change } : f)))
  }, [])

  const addPaths = useCallback(
    async (paths: string[]) => {
      const fresh = paths.filter((p) => EXCEL_EXT.test(p))
      const skipped = paths.length - fresh.length
      if (skipped > 0) toast(`Bỏ qua ${skipped} file không phải Excel (.xlsx/.xlsm/.xls)`, 'err')
      if (fresh.length === 0) return
      setFiles((prev) => {
        const known = new Set(prev.map((f) => f.path))
        const items: FileItem[] = fresh
          .filter((p) => !known.has(p))
          .map((p) => ({ id: uid(), path: p, name: baseName(p), sheets: [], loading: true }))
        return [...prev, ...items]
      })
      // nạp sheet cho từng file mới (độc lập để UI phản hồi nhanh)
      for (const p of fresh) {
        try {
          const sheets = await window.api.listSheets(p, skipDelSheets)
          patch((f) => f.path === p, { loading: false, sheets: withChecks(sheets, savedChecksRef.current[p]) })
        } catch (err) {
          patch((f) => f.path === p, { loading: false, error: errMsg(err) })
        }
      }
    },
    [skipDelSheets, patch]
  )

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  /** Đổi tick sheet của một file rồi nhớ lựa chọn (giữ tối đa MAX_REMEMBERED file). */
  const updateChecks = useCallback(
    (fileId: string, change: (s: SheetInfo) => SheetInfo) => {
      setFiles((prev) => {
        const next = prev.map((f) => (f.id === fileId ? { ...f, sheets: f.sheets.map(change) } : f))
        const f = next.find((x) => x.id === fileId)
        if (f) {
          const entries = Object.entries({
            ...savedChecksRef.current,
            [f.path]: f.sheets.filter((x) => x.checked).map((x) => x.name),
          })
          const rec = Object.fromEntries(entries.slice(-MAX_REMEMBERED))
          setSavedChecks(rec)
          persist('checkedSheets', rec)
        }
        return next
      })
    },
    [persist]
  )

  const toggleFileSheets = useCallback(
    (id: string, checked: boolean) => updateChecks(id, (s) => ({ ...s, checked })),
    [updateChecks]
  )

  const toggleSheet = useCallback(
    (fileId: string, sheetName: string, checked: boolean) =>
      updateChecks(fileId, (s) => (s.name === sheetName ? { ...s, checked } : s)),
    [updateChecks]
  )

  /** "Thử lại" cho file lỗi. */
  const reloadSheets = useCallback(
    async (file: FileItem) => {
      patch((f) => f.id === file.id, { loading: true, error: undefined })
      try {
        const sheets = await window.api.listSheets(file.path, skipDelSheets)
        patch((f) => f.id === file.id, { loading: false, sheets: withChecks(sheets) })
      } catch (err) {
        patch((f) => f.id === file.id, { loading: false, error: errMsg(err) })
      }
    },
    [skipDelSheets, patch]
  )

  /** Nạp lại sheet mọi file (khi đổi tùy chọn bỏ qua sheet DEL_). */
  const relistAll = useCallback(
    async (skipDel: boolean) => {
      const current = files
      setFiles((prev) => prev.map((f) => ({ ...f, loading: true, sheets: [], error: undefined })))
      for (const f of current) {
        try {
          const sheets = await window.api.listSheets(f.path, skipDel)
          patch((x) => x.id === f.id, { loading: false, sheets: withChecks(sheets) })
        } catch {
          patch((x) => x.id === f.id, { loading: false })
        }
      }
    },
    [files, patch]
  )

  return { files, setSavedChecks, addPaths, removeFile, toggleFileSheets, toggleSheet, reloadSheets, relistAll }
}
