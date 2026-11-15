import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { diffSpecMarkdown, type SpecDiff } from '../../../../shared/specDiff'
import { errMsg } from '../../lib/api'
import type { FoundProjectConfig } from '../../../../shared/projectConfig'

export type Side = 'old' | 'new'

export interface CompareSlot {
  path: string | null
  text: string | null
  loading: boolean
  error: string
}

const EMPTY: CompareSlot = { path: null, text: null, loading: false, error: '' }
export const isComparable = (p: string): boolean => /\.(xlsx|xlsm|xls|md|markdown)$/i.test(p)

/** Trạng thái màn hình So sánh: hai file (cũ / mới), nội dung Markdown của từng file và kết quả diff. */
export function useCompare() {
  const [slots, setSlots] = useState<Record<Side, CompareSlot>>({ old: EMPTY, new: EMPTY })
  const seq = useRef({ old: 0, new: 0 })

  const load = useCallback(async (side: Side, path: string) => {
    const s = ++seq.current[side]
    setSlots((prev) => ({ ...prev, [side]: { path, text: null, loading: true, error: '' } }))
    try {
      const text = await window.api.compareRead(path)
      if (s === seq.current[side]) setSlots((prev) => ({ ...prev, [side]: { path, text, loading: false, error: '' } }))
    } catch (err) {
      if (s === seq.current[side]) setSlots((prev) => ({ ...prev, [side]: { path, text: null, loading: false, error: errMsg(err) } }))
    }
  }, [])

  const setPath = useCallback((side: Side, path: string) => void load(side, path), [load])

  const clear = useCallback((side: Side) => {
    ++seq.current[side]
    setSlots((prev) => ({ ...prev, [side]: EMPTY }))
  }, [])

  const swap = useCallback(() => {
    const { old: o, new: n } = slots
    // Bỏ kết quả đang tải dở (gắn với phía cũ); phía nào đang tải thì tải lại ở vị trí mới
    seq.current = { old: seq.current.old + 1, new: seq.current.new + 1 }
    setSlots({ old: n, new: o })
    if (n.loading && n.path) void load('old', n.path)
    if (o.loading && o.path) void load('new', o.path)
  }, [slots, load])

  const reload = useCallback(() => {
    for (const side of ['old', 'new'] as const) if (slots[side].path) void load(side, slots[side].path as string)
  }, [slots, load])

  /** Kéo thả / mở bằng app: 2 file -> cũ + mới; 1 file -> ô còn trống (ưu tiên cũ), đầy cả hai thì thay bản mới. */
  const addPaths = useCallback(
    (paths: string[]): number => {
      const ok = paths.filter(isComparable)
      if (ok.length >= 2) {
        setPath('old', ok[0])
        setPath('new', ok[1])
      } else if (ok.length === 1) {
        setPath(!slots.old.path ? 'old' : 'new', ok[0])
      }
      return ok.length
    },
    [slots.old.path, setPath]
  )

  // x2m.json áp dụng cho bản mới (cột khóa của dự án); tìm lại mỗi lần bản mới được đọc (kể cả ⟳)
  // `path`: bản mới mà lần tìm này thuộc về. Diff chờ tới khi tìm xong cho đúng bản mới, để không hiện bản diff
  // không có cột khóa rồi lại tính lại.
  const [cfg, setCfg] = useState<{ path: string; found: FoundProjectConfig | null } | null>(null)
  const newPath = slots.new.path
  const newText = slots.new.text
  useEffect(() => {
    let live = true
    if (newPath && newText !== null)
      window.api.configFind(newPath).then(
        (found) => live && setCfg({ path: newPath, found }),
        () => live && setCfg({ path: newPath, found: null })
      )
    return () => {
      live = false
    }
  }, [newPath, newText])
  const cfgReady = cfg !== null && cfg.path === newPath
  const projectCfg = cfgReady ? cfg.found : null
  // Khóa chuỗi: đọc lại x2m.json (⟳) với cùng cột khóa thì không diff lại
  const keyColumnsKey = JSON.stringify(projectCfg?.config.rules.diffKeyColumns ?? [])

  // Diff chạy sau một nhịp render để kịp hiện trạng thái "đang so sánh" với file lớn
  const [diff, setDiff] = useState<SpecDiff | null>(null)
  const [diffing, setDiffing] = useState(false)
  const oldText = slots.old.text
  useEffect(() => {
    if (oldText === null || newText === null) {
      setDiff(null)
      setDiffing(false)
      return
    }
    setDiffing(true)
    if (!cfgReady) return
    const keyColumns = JSON.parse(keyColumnsKey) as string[]
    const t = window.setTimeout(() => {
      setDiff(diffSpecMarkdown(oldText, newText, keyColumns.length > 0 ? { diffKeyColumns: keyColumns } : undefined))
      setDiffing(false)
    }, 16)
    return () => window.clearTimeout(t)
  }, [oldText, newText, cfgReady, keyColumnsKey])

  const busy = slots.old.loading || slots.new.loading || diffing
  return useMemo(
    () => ({ slots, diff, busy, setPath, clear, swap, reload, addPaths, projectCfg }),
    [slots, diff, busy, setPath, clear, swap, reload, addPaths, projectCfg]
  )
}

export type CompareState = ReturnType<typeof useCompare>
