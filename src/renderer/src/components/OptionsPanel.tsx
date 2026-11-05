import type { ConvertOptions, OutputMode, VerticalMergeMode } from '../../../types'
import { cn } from '../utils'
import { SidePanel } from './SidePanel'

interface Props {
  options: ConvertOptions
  outputMode: OutputMode
  onSetOption: <K extends keyof ConvertOptions>(key: K, value: ConvertOptions[K]) => void
  onApplyPreset?: (patch: Partial<ConvertOptions>) => void
  onSetMode: (mode: OutputMode) => void
  onReset: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
  width?: number
}

/** Cột phải: chế độ xuất file, preset nhanh và tùy chọn convert. */
export function OptionsPanel({
  options,
  outputMode,
  onSetOption,
  onApplyPreset,
  onSetMode,
  onReset,
  collapsed,
  onToggleCollapsed,
  width,
}: Props): React.ReactElement {
  const vMerge: VerticalMergeMode = options.verticalMerge ?? 'repeat'
  const alignTables = options.alignTables === true

  const activePreset =
    options.frontMatter && options.chunkRows > 0
      ? 'rag'
      : options.detectTwoColTables && vMerge === 'empty' && alignTables
        ? 'grid'
        : !options.detectTwoColTables && vMerge === 'repeat' && !alignTables && !options.frontMatter && options.chunkRows === 0
          ? 'spec'
          : null

  const applyPreset = (patch: Partial<ConvertOptions>): void => {
    if (onApplyPreset) {
      onApplyPreset(patch)
      return
    }
    ;(Object.keys(patch) as (keyof ConvertOptions)[]).forEach((k) => {
      const val = patch[k]
      if (val !== undefined) onSetOption(k, val as never)
    })
  }

  return (
    <SidePanel
      collapsed={collapsed}
      onToggle={onToggleCollapsed}
      width={width}
      actions={
        <button className="btn btn-sm btn-ghost" onClick={onReset} title="Khôi phục mặc định">
          Mặc định
        </button>
      }
    >
      <div className="x2m-opts">
        <div className="x2m-opt-group">
          <div className="x2m-opt-label">Cấu hình nhanh (Preset)</div>
          <div className="x2m-presets" role="group" aria-label="Cấu hình nhanh">
            <button
              type="button"
              className={cn('x2m-preset-btn', activePreset === 'spec' && 'active')}
              onClick={() =>
                applyPreset({
                  detectTwoColTables: false,
                  verticalMerge: 'repeat',
                  alignTables: false,
                  frontMatter: false,
                  chunkRows: 0,
                })
              }
              title="Tối ưu cho tài liệu thiết kế (Backlog / 基本設計書)"
            >
              Chuẩn tài liệu
            </button>
            <button
              type="button"
              className={cn('x2m-preset-btn', activePreset === 'grid' && 'active')}
              onClick={() =>
                applyPreset({
                  detectTwoColTables: true,
                  verticalMerge: 'empty',
                  alignTables: true,
                  frontMatter: false,
                  chunkRows: 0,
                })
              }
              title="Tối ưu cho bảng dữ liệu, giữ ô gộp dọc trống như Excel và căn thẳng cột"
            >
              Bảng dữ liệu
            </button>
            <button
              type="button"
              className={cn('x2m-preset-btn', activePreset === 'rag' && 'active')}
              onClick={() =>
                applyPreset({
                  detectTwoColTables: true,
                  verticalMerge: 'repeat',
                  alignTables: false,
                  frontMatter: true,
                  chunkRows: 50,
                })
              }
              title="Tối ưu cho AI / LLM / RAG: lặp đủ giá trị ô gộp, thêm YAML front-matter, chia khối 50 dòng"
            >
              AI / RAG
            </button>
          </div>
        </div>

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
          <div className="x2m-opt-label">Bố cục Bảng &amp; Sheet</div>
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
            <span>
              Nhận diện bảng 2 cột
              <span className="dim">Chuyển khối 2 cột liên tiếp thành bảng Markdown</span>
            </span>
          </label>
          <label className="x2m-check">
            <input
              type="checkbox"
              className="chk"
              checked={alignTables}
              onChange={(e) => onSetOption('alignTables', e.target.checked)}
            />
            <span>
              Căn thẳng cột bảng Markdown
              <span className="dim">Đệm khoảng trắng cho mã nguồn bảng dễ đọc</span>
            </span>
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
          <div className="x2m-opt-label">Ô gộp dọc (Vertical Merge)</div>
          <div className="x2m-seg-group" role="radiogroup" aria-label="Xử lý ô gộp dọc">
            <button
              type="button"
              className={cn('x2m-seg-btn', vMerge === 'repeat' && 'active')}
              onClick={() => onSetOption('verticalMerge', 'repeat')}
              title="Lặp lại giá trị xuống các dòng dưới (tốt cho tìm kiếm / lọc / AI)"
            >
              Lặp giá trị
            </button>
            <button
              type="button"
              className={cn('x2m-seg-btn', vMerge === 'empty' && 'active')}
              onClick={() => onSetOption('verticalMerge', 'empty')}
              title="Để trống các dòng dưới giống giao diện Excel"
            >
              Để trống
            </button>
            <button
              type="button"
              className={cn('x2m-seg-btn', vMerge === 'ditto' && 'active')}
              onClick={() => onSetOption('verticalMerge', 'ditto')}
              title="Điền ký hiệu ↑ cho các dòng gộp phía dưới"
            >
              Ký hiệu ↑
            </button>
          </div>
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

        <div className="x2m-opt-note">
          App tự nhận diện banner 基本設計, meta 機能ID/画面ID/テーブルID, section,
          bảng No/№/項番, header 2 tầng, ô merge ngang/dọc, ghi chú ※ cuối bảng và công thức liên sheet. Phím tắt: Ctrl+O thêm file, Ctrl+Enter để convert.
        </div>
      </div>
    </SidePanel>
  )
}
