import { SidePanel } from '../../components/SidePanel'
import { useT } from '../../i18n'

interface Props {
  /** Giá trị ô tên file (không đuôi .xlsx) */
  fileName: string
  /** Tên mặc định, hiện làm placeholder khi ô trống (để trống = dùng tên này) */
  defaultName: string
  onFileNameChange: (value: string) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  width?: number
}

/** Cột phải chế độ Markdown → Excel: tên file Excel xuất ra. */
export function MdOptionsPanel({
  fileName,
  defaultName,
  onFileNameChange,
  collapsed,
  onToggleCollapsed,
  width,
}: Props): React.ReactElement {
  const t = useT()
  return (
    <SidePanel collapsed={collapsed} onToggle={onToggleCollapsed} width={width}>
      <div className="x2m-opts flex flex-col gap-4 p-3">
        <div className="x2m-opt-group flex flex-col gap-1.5">
          <label className="x2m-opt-label text-xs font-semibold text-ink" htmlFor="x2m-xlsx-name">
            {t('mdopts.fileName')}
          </label>
          <div className="x2m-name-field flex items-center rounded-lg border border-line bg-canvas px-2.5 py-1.5 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
            <input
              id="x2m-xlsx-name"
              className="x2m-name-input flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-faint"
              type="text"
              value={fileName}
              placeholder={defaultName}
              onChange={(e) => onFileNameChange(e.target.value)}
              aria-label={t('mdopts.fileName')}
              spellCheck={false}
            />
            <span className="x2m-name-ext text-xs font-medium text-dim select-none ml-1">.xlsx</span>
          </div>
        </div>
        <div className="x2m-opt-note text-xs text-faint leading-relaxed">
          {t('mdopts.note')}
        </div>
      </div>
    </SidePanel>
  )
}
