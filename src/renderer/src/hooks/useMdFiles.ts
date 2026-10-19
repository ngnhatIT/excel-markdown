import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MdFileItem } from '../../../types'
import { errMsg } from '../api'
import { baseName, moveItem, toast, uid } from '../utils'

export const MD_EXT = /\.(md|markdown)$/i

/** Danh sách file Markdown (chế độ Markdown → Excel): thứ tự = thứ tự sheet trong workbook. */
export function useMdFiles() {
  const [files, setFiles] = useState<MdFileItem[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const filesRef = useRef(files)
  filesRef.current = files

  const patch = useCallback((id: string, change: Partial<MdFileItem>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...change } : f)))
  }, [])

  /** Thêm file `.md`/`.markdown` (bỏ file khác và file đã có), đọc nhanh từng file qua IPC. */
  const addPaths = useCallback(
    async (paths: string[]) => {
      const md = paths.filter((p) => MD_EXT.test(p))
      const skipped = paths.length - md.length
      if (skipped > 0) toast(`Bỏ qua ${skipped} file không phải Markdown (.md)`, 'err')
      const known = new Set(filesRef.current.map((f) => f.path))
      const fresh: MdFileItem[] = []
      for (const p of md) {
        if (known.has(p)) continue
        known.add(p)
        fresh.push({ id: uid(), path: p, name: baseName(p), loading: true, title: null, sheets: [], markdown: '' })
      }
      if (fresh.length === 0) return
      // lọc lại theo state mới nhất: hai lần thả liên tiếp trước khi render không thêm trùng
      setFiles((prev) => {
        const have = new Set(prev.map((f) => f.path))
        return [...prev, ...fresh.filter((f) => !have.has(f.path))]
      })
      for (const f of fresh) {
        try {
          const r = await window.api.inspectMarkdown(f.path)
          patch(f.id, { loading: false, title: r.title, sheets: r.sheets, markdown: r.markdown })
        } catch (err) {
          patch(f.id, { loading: false, error: errMsg(err) })
        }
      }
    },
    [patch]
  )

  const remove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  /** Đổi chỗ file với file kề trước (-1) / sau (1). */
  const move = useCallback((id: string, dir: -1 | 1) => {
    setFiles((prev) => moveItem(prev, prev.findIndex((f) => f.id === id), dir))
  }, [])

  const select = useCallback((id: string) => setSelId(id), [])

  // chưa chọn / file đang chọn bị xóa -> chọn file đầu danh sách (giữ cố định khi đổi thứ tự)
  useEffect(() => {
    if (!files.some((f) => f.id === selId)) setSelId(files[0]?.id ?? null)
  }, [files, selId])
  const selected = useMemo(() => files.find((f) => f.id === selId) ?? files[0] ?? null, [files, selId])

  return { files, selectedId: selected?.id ?? null, selected, addPaths, remove, move, select }
}
