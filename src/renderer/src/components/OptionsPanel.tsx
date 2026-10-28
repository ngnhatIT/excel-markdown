import type { ConvertOptions, OutputMode } from '../../../types'
import { SidePanel } from './SidePanel'

interface Props {
  options: ConvertOptions
  outputMode: OutputMode
  onSetOption: <K extends keyof ConvertOptions>(key: K, value: ConvertOptions[K]) => void
  onSetMode: (mode: OutputMode) => void
  onReset: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

/** Cột phải: chế độ xuất file và tùy chọn convert. */
export function OptionsPanel({
  options,
  outputMode,
  onSetOption,
  onSetMode,
  onReset,
  collapsed,
  onToggleCollapsed,
}: Props): React.ReactElement {
  return (
    <SidePanel
      collapsed={collapsed}
      onToggle={onToggleCollapsed}
      actions={
        <button className="btn btn-sm btn-ghost" onClick={onReset} title="Khôi phục mặc định">
          Mặc định
        </button>
      }
    >
      <div className="x2m-opts">
        <div className="x2m-opt-group">
          <div className="x2m-opt-label">Chế độ xuất file</div>
          <label className="x2m-radio">
            <input
              type="radio"
              className="chk"
              checked={outputMode === 'per-sheet'}
              onChange={() => onSetMode('per-sheet')}
            />
            <span>
              Mỗi sheet 1 file
              <span className="dim">TênFile__TênSheet.md</span>
            </span>
          </label>
          <label className="x2m-radio">
            <input
              type="radio"
              className="chk"
              checked={outputMode === 'per-workbook'}
              onChange={() => onSetMode('per-workbook')}
            />
            <span>
              Gộp cả workbook 1 file
              <span className="dim">TênFile.md, các sheet nối nhau</span>
            </span>
          </label>
        </div>
        <div className="x2m-opt-group">
          <div className="x2m-opt-label">Sheet</div>
          <label className="x2m-check">
            <input
              type="checkbox"
              className="chk"
              checked={options.skipDelSheets}
              onChange={(e) => onSetOption('skipDelSheets', e.target.checked)}
            />
            Bỏ qua sheet DEL_ (đã xóa)
          </label>
          <label className="x2m-check">
            <input
              type="checkbox"
              className="chk"
              checked={options.skipEmptySheets}
              onChange={(e) => onSetOption('skipEmptySheets', e.target.checked)}
            />
            Bỏ qua sheet rỗng
          </label>
          <label className="x2m-check">
            <input
              type="checkbox"
              className="chk"
              checked={options.includeSheetTitle}
              onChange={(e) => onSetOption('includeSheetTitle', e.target.checked)}
            />
            Thêm tiêu đề tên sheet
          </label>
          <label className="x2m-check">
            <input
              type="checkbox"
              className="chk"
              checked={options.detectTwoColTables}
              onChange={(e) => onSetOption('detectTwoColTables', e.target.checked)}
            />
            Nhận diện bảng 2 cột
          </label>
          <label className="x2m-check">
            <input
              type="checkbox"
              className="chk"
              checked={options.escapeMarkdown}
              onChange={(e) => onSetOption('escapeMarkdown', e.target.checked)}
            />
            <span>
              Escape ký tự Markdown/HTML trong ô
              <span className="dim">Tắt nếu ô Excel cố ý chứa cú pháp Markdown</span>
            </span>
          </label>
        </div>
        <div className="x2m-opt-group">
          <div className="x2m-opt-label">Nâng cao</div>
          <label className="x2m-check">
            <input
              type="checkbox"
              className="chk"
              checked={options.showFormulas}
              onChange={(e) => onSetOption('showFormulas', e.target.checked)}
            />
            <span>
              Hiện công thức
              <span className="dim">Giá trị kèm `=công thức`</span>
            </span>
          </label>
          <label className="x2m-check">
            <input
              type="checkbox"
              className="chk"
              checked={options.frontMatter}
              onChange={(e) => onSetOption('frontMatter', e.target.checked)}
            />
            <span>
              Front-matter YAML
              <span className="dim">File nguồn + sheet, dùng cho RAG/LLM</span>
            </span>
          </label>
          <label className="x2m-field">
            Vùng ô (vd A1:F40)
            <input
              type="text"
              className="input"
              value={options.range}
              placeholder="Cả sheet"
              onChange={(e) => onSetOption('range', e.target.value)}
            />
          </label>
          <label className="x2m-field">
            Tách bảng mỗi N dòng (0 = tắt)
            <input
              type="number"
              className="input"
              min={0}
              value={options.chunkRows}
              onChange={(e) => onSetOption('chunkRows', Math.max(0, Math.floor(Number(e.target.value)) || 0))}
            />
          </label>
        </div>
        <div className="x2m-opt-group">
          <div className="x2m-opt-label">Ô nhiều dòng</div>
          <label className="x2m-radio">
            <input
              type="radio"
              className="chk"
              checked={options.multiline === 'br'}
              onChange={() => onSetOption('multiline', 'br')}
            />
            Xuống dòng bằng &lt;br&gt;
          </label>
          <label className="x2m-radio">
            <input
              type="radio"
              className="chk"
              checked={options.multiline === 'space'}
              onChange={() => onSetOption('multiline', 'space')}
            />
            Gộp thành một dòng
          </label>
        </div>
        <div className="x2m-opt-note">
          App tự nhận diện banner 基本設計, meta 機能ID/画面ID/テーブルID, section,
          bảng No/№/項番, ô merge và công thức liên sheet. Phím tắt: Ctrl+O thêm file, Ctrl+Enter để convert.
        </div>
      </div>
    </SidePanel>
  )
}
