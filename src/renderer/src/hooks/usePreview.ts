import { useEffect, useRef, useState } from 'react'
import type { ConvertOptions, FileItem } from '../../../types'
import { errMsg } from '../api'

/** Markdown preview của sheet đang chọn. Debounce 250 ms; bỏ kết quả cũ khi người
 * dùng đã chuyển sang sheet khác (generation guard). */
export function usePreview(
  file: FileItem | null,
  sheet: string | null,
  options: ConvertOptions
): { md: string; loading: boolean; error: string } {
  const [md, setMd] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<number | null>(null)
  const gen = useRef(0)

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    const g = ++gen.current
    if (!file || !sheet) {
      setMd('')
      setError('')
      return
    }
    setLoading(true)
    timer.current = window.setTimeout(() => {
      window.api
        .previewSheet(file.path, sheet, options)
        .then((res) => {
          if (gen.current !== g) return // stale: user đã chuyển sheet khác
          setMd(res)
          setError('')
        })
        .catch((err) => {
          if (gen.current !== g) return
          setMd('')
          setError(errMsg(err))
        })
        .finally(() => {
          if (gen.current === g) setLoading(false)
        })
    }, 250)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [file, sheet, options])

  return { md, loading, error }
}
