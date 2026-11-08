import { useEffect, useRef, useState } from 'react'
import type { ConvertOptions, FileItem } from '../../../../shared/types'
import { errMsg } from '../../lib/api'

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
  const path = file?.path ?? null

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    const g = ++gen.current
    if (!path || !sheet) {
      setMd('')
      setError('')
      setLoading(false) // yêu cầu đang chạy bị bỏ (gen đổi) nên finally của nó không tắt loading
      return
    }
    setLoading(true)
    timer.current = window.setTimeout(() => {
      window.api
        .previewSheet(path, sheet, options)
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
    // Theo path, không theo object file: tick/bỏ tick sheet tạo object mới nhưng preview không đổi
  }, [path, sheet, options])

  return { md, loading, error }
}
