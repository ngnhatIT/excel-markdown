import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildMdTree, recentMdFiles, visibleTreeFiles, type MdSort } from '../../../../shared/mdView'
import type { MdSearchResult } from '../../../../shared/types'
import { errMsg } from '../../lib/api'
import { EMPTY_NAV, navReducer, type NavEntry, type NavHistory } from '../../lib/navHistory'
import { baseName, toast } from '../../lib/utils'
import { t } from '../../i18n'

export interface MdViewerDoc {
  path: string
  loading: boolean
  error: string
  markdown: string
}

export interface MdContentSearch {
  query: string
  loading: boolean
  error: string
  result: MdSearchResult | null
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
  /** Bản dán gần nhất; giữ lại để quay về sau khi chọn file khác. */
  const [pasted, setPasted] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  /** Ô lọc tìm trong nội dung file (thay vì theo tên) */
  const [contentSearch, setContentSearch] = useState(false)
  const [search, setSearch] = useState<MdContentSearch | null>(null)
  const readSeq = useRef(0)
  const listSeq = useRef(0)
  const docRef = useRef(doc)
  docRef.current = doc
  const pastedRef = useRef(pasted)
  pastedRef.current = pasted
  const [nav, setNav] = useState<NavHistory>(EMPTY_NAV)
  const navRef = useRef(nav)
  /** Ô lọc theo tên (không áp khi đang tìm trong nội dung) */
  const nameFilter = contentSearch ? '' : filter

  // Tìm trong nội dung: chờ ngừng gõ 300ms; quét lại thư mục thì tìm lại
  useEffect(() => {
    const q = filter.trim()
    if (!contentSearch || !root || q === '') {
      setSearch(null)
      return
    }
    let alive = true
    setSearch((s) => ({ query: q, loading: true, error: '', result: s?.result ?? null }))
    const t = setTimeout(() => {
      window.api.searchMarkdownFolder(root, q).then(
        (result) => alive && setSearch({ query: q, loading: false, error: '', result }),
        (err: unknown) => alive && setSearch({ query: q, loading: false, error: errMsg(err), result: null })
      )
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [contentSearch, root, filter, relFiles])

  const tree = useMemo(() => buildMdTree(relFiles, sort, mtimes), [relFiles, sort, mtimes])

  /** "Mới sửa": file sửa gần nhất của thư mục, đã áp ô lọc. */
  const recent = useMemo(() => {
    const q = nameFilter.trim().toLowerCase()
    return recentMdFiles(relFiles, mtimes).filter((r) => !q || r.toLowerCase().includes(q))
  }, [relFiles, mtimes, nameFilter])

  /** Mọi file đang hiện theo thứ tự (cây hoặc kết quả lọc, rồi file lẻ), đường dẫn tuyệt đối — dùng cho ↑/↓. */
  const visible = useMemo(() => {
    const q = nameFilter.trim().toLowerCase()
    const rels = search?.result
      ? search.result.files.map((f) => f.rel)
      : q
        ? relFiles.filter((r) => r.toLowerCase().includes(q))
        : visibleTreeFiles(tree, collapsed)
    return [
      ...(root ? rels.map((r) => joinRoot(root, r)) : []),
      ...loose.filter((f) => !q || f.toLowerCase().includes(q)),
    ]
  }, [root, tree, relFiles, collapsed, loose, nameFilter, search])

  /** Ghi vào lịch sử Lùi/Tiến (file đang xem + anchor nếu có). */
  const record = useCallback((entry: NavEntry) => {
    navRef.current = navReducer(navRef.current, { type: 'push', entry })
    setNav(navRef.current)
  }, [])

  /** Mở file để xem. `heading`: anchor sẽ nhảy tới (ghi vào lịch sử); `record: false` khi chính Lùi/Tiến gọi. */
  const select = useCallback(
    async (path: string, opts: { heading?: string; record?: boolean } = {}) => {
      if (opts.record !== false) record({ path, heading: opts.heading || undefined })
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
    [persist, record]
  )

  /** Lùi/Tiến: mở lại file của mục đó (nếu khác file đang xem); trả mục để App cuộn tới anchor, null nếu hết đường. */
  const go = useCallback(
    async (dir: 'back' | 'forward'): Promise<NavEntry | null> => {
      const next = navReducer(navRef.current, { type: dir })
      if (next === navRef.current) return null
      navRef.current = next
      setNav(next)
      const entry = next.stack[next.index]
      if (entry.path === PASTE_PATH) {
        // Bản dán đã đóng thì mục này không còn gì để hiện: giữ nguyên tài liệu đang xem
        if (pastedRef.current === null) return entry
        ++readSeq.current
        setDoc({ path: PASTE_PATH, loading: false, error: '', markdown: pastedRef.current })
      } else if (entry.path !== docRef.current?.path) {
        await select(entry.path, { record: false })
      }
      return entry
    },
    [select]
  )

  /** Đọc lại file đang xem (cửa sổ được focus lại). Nội dung đổi thì thay tại chỗ, không qua trạng thái
   * "đang đọc" nên vị trí cuộn giữ nguyên. Lỗi đọc (file vừa bị xóa/đổi tên) thì giữ bản đang xem. */
  const reloadCurrent = useCallback(async () => {
    const d = docRef.current
    if (!d || d.path === PASTE_PATH || d.loading || d.error) return
    const seq = readSeq.current
    try {
      const markdown = await window.api.readMarkdown(d.path)
      if (seq !== readSeq.current || markdown === docRef.current?.markdown) return
      setDoc({ ...d, markdown })
      toast(t('toast.viewer.reloaded', { name: baseName(d.path) }), 'ok')
    } catch {
      /* giữ nguyên bản đang xem */
    }
  }, [])

  /** Xem đoạn Markdown dán từ clipboard (không đọc file, không lưu vào store). */
  const pasteText = useCallback(
    (text: string) => {
      record({ path: PASTE_PATH })
      ++readSeq.current
      setPasted(text)
      setDoc({ path: PASTE_PATH, loading: false, error: '', markdown: text })
    },
    [record]
  )

  /** Quay lại bản dán đã có. */
  const showPaste = useCallback(() => {
    if (pasted === null) return
    record({ path: PASTE_PATH })
    ++readSeq.current
    setDoc({ path: PASTE_PATH, loading: false, error: '', markdown: pasted })
  }, [pasted, record])

  const closePaste = useCallback(() => {
    setPasted(null)
    setDoc((d) => (d?.path === PASTE_PATH ? null : d))
  }, [])

  /** Mở (hoặc quét lại) thư mục; trả danh sách file tuyệt đối, null nếu lỗi.
   * `quiet`: không báo lỗi (thư mục nhớ từ lần trước đã bị xóa). */
  const openFolder = useCallback(
    async (dir: string, quiet = false): Promise<string[] | null> => {
      // Mở thư mục khác trong lúc thư mục trước còn đang quét: kết quả cũ bị bỏ
      const seq = ++listSeq.current
      setListing(true)
      try {
        const res = await window.api.listMarkdownFolder(dir)
        if (seq !== listSeq.current) return null
        setRoot(res.root)
        setRelFiles(res.files)
        setMtimes(res.mtimes ?? {})
        setTruncated(res.truncated)
        persist('viewerRoot', res.root)
        if (res.truncated) toast(t('toast.viewer.truncated', { n: res.files.length }), 'err')
        else if (res.files.length === 0 && !quiet) toast(t('toast.viewer.noMd'), 'err')
        return res.files.map((r) => joinRoot(res.root, r))
      } catch (err) {
        if (!quiet && seq === listSeq.current) toast(errMsg(err), 'err')
        return null
      } finally {
        if (seq === listSeq.current) setListing(false)
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
    (paths: string[], heading?: string) => {
      if (paths.length === 0) return
      const inTree = new Set(root ? relFiles.map((r) => joinRoot(root, r)) : [])
      setLoose((prev) => [...prev, ...paths.filter((p) => !prev.includes(p) && !inTree.has(p))])
      void select(paths[0], { heading })
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
    contentSearch,
    setContentSearch,
    search,
    select,
    pasted,
    pasteText,
    showPaste,
    closePaste,
    openFolder,
    closeFolder,
    openFiles,
    removeLoose,
    toggleDir,
    move,
    record,
    go,
    canBack: nav.index > 0,
    canForward: nav.index < nav.stack.length - 1,
    reloadCurrent,
  }
}
