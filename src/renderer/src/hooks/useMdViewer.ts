import { useCallback, useMemo, useRef, useState } from 'react'
import { buildMdTree, recentMdFiles, visibleTreeFiles, type MdSort } from '../../../shared/mdView'
import { errMsg } from '../api'
import { toast } from '../utils'

export interface MdViewerDoc {
  path: string
  loading: boolean
  error: string
  markdown: string
}

/** Đường dẫn giả của bản Markdown dán từ clipboard (không phải file trên đĩa, không lưu vào `viewerFile`). */
export const PASTE_PATH = 'clipboard:paste'

/** Đường dẫn tuyệt đối của file `rel` (phân cách `/`) trong thư mục `root`, theo kiểu phân cách của `root`. */
export function joinRoot(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/'
  return root.replace(/[\\/]+$/, '') + sep + rel.split('/').join(sep)
}

/** Trạng thái chế độ Đọc Markdown: thư mục đang mở (cây file), các file mở lẻ, file đang xem. */
export function useMdViewer(persist: (key: string, value: unknown) => void) {
  const [root, setRoot] = useState<string | null>(null)
  const [relFiles, setRelFiles] = useState<string[]>([])
  const [mtimes, setMtimes] = useState<Record<string, number>>({})
  const [sort, setSort] = useState<MdSort>('name')
  const [truncated, setTruncated] = useState(false)
  const [listing, setListing] = useState(false)
  const [loose, setLoose] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [doc, setDoc] = useState<MdViewerDoc | null>(null)
  const [filter, setFilter] = useState('')
  const readSeq = useRef(0)

  const tree = useMemo(() => buildMdTree(relFiles, sort, mtimes), [relFiles, sort, mtimes])

  /** "Mới sửa": file sửa gần nhất của thư mục, đã áp ô lọc. */
  const recent = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return recentMdFiles(relFiles, mtimes).filter((r) => !q || r.toLowerCase().includes(q))
  }, [relFiles, mtimes, filter])

  /** Mọi file đang hiện theo thứ tự (cây hoặc kết quả lọc, rồi file lẻ), đường dẫn tuyệt đối — dùng cho ↑/↓. */
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const rels = q ? relFiles.filter((r) => r.toLowerCase().includes(q)) : visibleTreeFiles(tree, collapsed)
    return [
      ...(root ? rels.map((r) => joinRoot(root, r)) : []),
      ...loose.filter((f) => !q || f.toLowerCase().includes(q)),
    ]
  }, [root, tree, relFiles, collapsed, loose, filter])

  const select = useCallback(
    async (path: string) => {
      const seq = ++readSeq.current
      setDoc({ path, loading: true, error: '', markdown: '' })
      persist('viewerFile', path)
      try {
        const markdown = await window.api.readMarkdown(path)
        if (seq === readSeq.current) setDoc({ path, loading: false, error: '', markdown })
      } catch (err) {
        if (seq === readSeq.current) setDoc({ path, loading: false, error: errMsg(err), markdown: '' })
      }
    },
    [persist]
  )

  /** Xem đoạn Markdown dán từ clipboard (không đọc file, không lưu vào store). */
  const pasteText = useCallback((text: string) => {
    ++readSeq.current
    setDoc({ path: PASTE_PATH, loading: false, error: '', markdown: text })
  }, [])

  /** Mở (hoặc quét lại) thư mục; trả danh sách file tuyệt đối, null nếu lỗi.
   * `quiet`: không báo lỗi (thư mục nhớ từ lần trước đã bị xóa). */
  const openFolder = useCallback(
    async (dir: string, quiet = false): Promise<string[] | null> => {
      setListing(true)
      try {
        const res = await window.api.listMarkdownFolder(dir)
        setRoot(res.root)
        setRelFiles(res.files)
        setMtimes(res.mtimes ?? {})
        setTruncated(res.truncated)
        persist('viewerRoot', res.root)
        if (res.truncated) toast(`Thư mục có quá nhiều file, chỉ hiện ${res.files.length} file đầu`, 'err')
        else if (res.files.length === 0 && !quiet) toast('Thư mục không có file Markdown nào', 'err')
        return res.files.map((r) => joinRoot(res.root, r))
      } catch (err) {
        if (!quiet) toast(errMsg(err), 'err')
        return null
      } finally {
        setListing(false)
      }
    },
    [persist]
  )

  const closeFolder = useCallback(() => {
    setRoot(null)
    setRelFiles([])
    setMtimes({})
    setTruncated(false)
    setCollapsed(new Set())
    persist('viewerRoot', null)
  }, [persist])

  /** Thêm file .md lẻ (không thuộc thư mục đang mở) và mở file đầu tiên. */
  const openFiles = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return
      const inTree = new Set(root ? relFiles.map((r) => joinRoot(root, r)) : [])
      setLoose((prev) => [...prev, ...paths.filter((p) => !prev.includes(p) && !inTree.has(p))])
      void select(paths[0])
    },
    [root, relFiles, select]
  )

  const removeLoose = useCallback((path: string) => {
    setLoose((prev) => prev.filter((p) => p !== path))
    setDoc((d) => (d?.path === path ? null : d))
  }, [])

  const toggleDir = useCallback((rel: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(rel)) next.delete(rel)
      else next.add(rel)
      return next
    })
  }, [])

  /** ↑/↓: file trước/sau trong danh sách đang hiện. */
  const move = useCallback(
    (dir: 1 | -1) => {
      const next = visible[visible.indexOf(doc?.path ?? '') + dir] ?? (doc ? undefined : visible[0])
      if (next) void select(next)
    },
    [visible, doc, select]
  )

  return {
    root,
    tree,
    relFiles,
    mtimes,
    sort,
    setSort,
    recent,
    truncated,
    listing,
    loose,
    collapsed,
    doc,
    filter,
    setFilter,
    select,
    pasteText,
    openFolder,
    closeFolder,
    openFiles,
    removeLoose,
    toggleDir,
    move,
  }
}
