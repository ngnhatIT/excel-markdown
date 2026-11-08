/* テーブル定義書 → DDL / JSON / ER: popover của nút DDL trên chip bảng và hộp thoại sơ đồ ER của cả file. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SQL_DIALECTS, toDDL, toErMermaid, toJson, type SqlDialect, type TableDef } from '../../../shared/tableDef'
import { renderMermaidIn } from '../lib/mermaid'
import { btnGhost, btnSm, cx, input } from '../lib/ui'
import { useT } from '../i18n'

const DIALECT_KEY = 'x2m.ddlDialect'
const DIALECT_LABEL: Record<SqlDialect, string> = { generic: '', postgres: 'PostgreSQL', mysql: 'MySQL', oracle: 'Oracle', sqlserver: 'SQL Server' }
const POP_W = 520

/** Dialect dùng lần cuối (localStorage có thể bị chặn: lỗi thì về mặc định). */
function loadDialect(): SqlDialect {
  try {
    const v = localStorage.getItem(DIALECT_KEY)
    return SQL_DIALECTS.includes(v as SqlDialect) ? (v as SqlDialect) : 'generic'
  } catch {
    return 'generic'
  }
}
function saveDialect(d: SqlDialect): void {
  try {
    localStorage.setItem(DIALECT_KEY, d)
  } catch {
    /* không lưu được thì thôi */
  }
}

type Copy = (text: string, label: string) => void

/** Đóng khi bấm Esc hoặc bấm ra ngoài `ref`. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown)
    }
  }, [ref, onClose])
}

/** Focus nút đóng khi mở mà không cuộn các khung cha (autoFocus cuộn khung xem lệch sang ngang). */
const focusNoScroll = (el: HTMLButtonElement | null): void => el?.focus({ preventScroll: true })

export function DdlPopover({ def, x, y, onClose, onCopy }: { def: TableDef; x: number; y: number; onClose: () => void; onCopy: Copy }): React.ReactElement {
  const t = useT()
  const ref = useRef<HTMLDivElement | null>(null)
  const [dialect, setDialect] = useState<SqlDialect>(loadDialect)
  const ddl = useMemo(() => toDDL([def], dialect), [def, dialect])
  useDismiss(ref, onClose)
  const left = Math.max(8, Math.min(x, window.innerWidth - POP_W - 8))
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={t('td.title', { name: def.tableName })}
      className="x2m-ddl-pop glass fixed z-50 flex max-h-[min(460px,70vh)] flex-col rounded-xl text-ink"
      style={{ left, top: y, width: `min(${POP_W}px, calc(100vw - 16px))` }}
    >
      <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
        <span className="truncate text-xs font-semibold">{t('td.title', { name: def.logicalName ? `${def.tableName} (${def.logicalName})` : def.tableName })}</span>
        <button className={cx(btnGhost, '!p-1 ml-auto')} onClick={onClose} title={t('td.close')} aria-label={t('td.close')} ref={focusNoScroll}>
          ✕
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line-subtle px-3 py-2 text-xs">
        <label className="flex items-center gap-1.5 text-dim">
          {t('td.dialect')}
          <select
            className={cx(input, 'x2m-ddl-dialect !w-auto !py-1')}
            value={dialect}
            onChange={(e) => {
              const d = e.target.value as SqlDialect
              setDialect(d)
              saveDialect(d)
            }}
          >
            {SQL_DIALECTS.map((d) => (
              <option key={d} value={d}>
                {DIALECT_LABEL[d] || t('td.generic')}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto flex flex-wrap gap-1">
          <button className={cx('x2m-ddl-copy', btnGhost, btnSm)} onClick={() => onCopy(ddl, t('td.lblDdl', { name: def.tableName }))}>
            {t('td.copyDdl')}
          </button>
          <button className={cx(btnGhost, btnSm)} onClick={() => onCopy(toJson([def]), t('td.lblJson', { name: def.tableName }))}>
            {t('td.copyJson')}
          </button>
          <button className={cx(btnGhost, btnSm)} onClick={() => onCopy(toErMermaid([def]), t('td.lblEr'))}>
            {t('td.copyEr')}
          </button>
        </span>
      </div>
      <pre className="x2m-ddl-preview m-0 flex-1 overflow-auto whitespace-pre bg-code p-3 font-mono text-[11.5px] leading-relaxed select-text">{ddl}</pre>
    </div>
    , document.body
  )
}

export function ErDialog({ defs, onClose, onCopy }: { defs: TableDef[]; onClose: () => void; onCopy: Copy }): React.ReactElement {
  const t = useT()
  const ref = useRef<HTMLDivElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const src = useMemo(() => toErMermaid(defs), [defs])
  useDismiss(ref, onClose)
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    // Khối code do DOM quản lý (renderMermaidIn thay node), không để React đụng vào
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.className = 'language-mermaid'
    code.textContent = src
    pre.append(code)
    box.replaceChildren(pre)
    void renderMermaidIn(box, document.documentElement.dataset.theme === 'light' ? 'default' : 'dark')
  }, [src])
  return createPortal(
    <div className="x2m-er-backdrop fixed inset-0 z-[90] flex items-start justify-center bg-black/40 pt-[8vh]">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t('td.erHeading', { n: defs.length })}
        className="x2m-er-dialog glass flex max-h-[80vh] w-[min(960px,92vw)] flex-col overflow-hidden rounded-xl border border-line bg-canvas shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
          <span className="text-xs font-semibold">{t('td.erHeading', { n: defs.length })}</span>
          <button className={cx(btnGhost, btnSm, 'ml-auto')} onClick={() => onCopy(src, t('td.lblEr'))}>
            {t('td.copyMermaid')}
          </button>
          <button className={cx(btnGhost, '!p-1')} onClick={onClose} title={t('td.close')} aria-label={t('td.close')} ref={focusNoScroll}>
            ✕
          </button>
        </div>
        <div ref={boxRef} className="x2m-er-body md-body full flex-1 overflow-auto p-4" />
      </div>
    </div>
    , document.body
  )
}
