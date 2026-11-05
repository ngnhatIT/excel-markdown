import { SidePanel } from './SidePanel'

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
  return (
    <SidePanel collapsed={collapsed} onToggle={onToggleCollapsed} width={width}>
      <div className="x2m-opts">
        <div className="x2m-opt-group">
          <label className="x2m-opt-label" htmlFor="x2m-xlsx-name">
            Tên file Excel
          </label>
          <div className="x2m-name-field">
            <input
              id="x2m-xlsx-name"
              className="x2m-name-input"
              type="text"
              value={fileName}
              placeholder={defaultName}
              onChange={(e) => onFileNameChange(e.target.value)}
              aria-label="Tên file Excel"
              spellCheck={false}
            />
            <span className="x2m-name-ext">.xlsx</span>
          </div>
        </div>
        <div className="x2m-opt-note">
          Các file trong danh sách được gộp thành một file Excel, mỗi phần là một sheet, theo
          thứ tự danh sách (dùng ↑/↓ để đổi thứ tự). File trùng tên trong thư mục lưu sẽ được hỏi
          trước khi ghi đè. Phím tắt: Ctrl+O thêm file, Ctrl+Enter để tạo file Excel.
        </div>
      </div>
    </SidePanel>
  )
}
