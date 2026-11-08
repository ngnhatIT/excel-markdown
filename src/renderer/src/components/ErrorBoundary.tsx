/* Lưới an toàn ở gốc: lỗi render của React không để lại cửa sổ trắng mà hiện thông báo + nút Tải lại,
 * và gửi lỗi sang main ghi error.log. */
import React from 'react'
import { t } from '../i18n'
import { btnPrimary } from '../lib/ui'

interface State {
  failed: boolean
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    const msg = error instanceof Error ? (error.stack ?? error.message) : String(error)
    try {
      window.api.logRenderer(msg + (info.componentStack ?? ''))
    } catch {
      /* preload không có (vd chạy ngoài Electron): bỏ qua */
    }
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="mx-auto mt-16 max-w-xl p-8 text-ink">
        <h1 className="mb-2 text-xl font-semibold">{t('crash.title')}</h1>
        <p className="mb-4 text-dim">{t('crash.body')}</p>
        <button type="button" className={btnPrimary} onClick={() => window.location.reload()}>
          {t('crash.reload')}
        </button>
      </div>
    )
  }
}
