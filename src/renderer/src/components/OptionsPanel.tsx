import type { ConvertOptions, OutputMode, VerticalMergeMode } from '../../../types'
import { cn } from '../utils'
import { SidePanel } from './SidePanel'
import { btnGhost, btnSm, cx, input } from '../ui'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'
const segGroup = 'grid grid-cols-3 gap-1 rounded-xl border border-line-subtle bg-canvas p-[3px]'
const segBtn = cx(
  'cursor-pointer rounded-lg px-1 py-1.5 text-center text-[11.5px] font-semibold leading-tight [text-wrap:balance] transition-[background-color,color,box-shadow] duration-200',
  focusRing
)
const segState = (on: boolean): string => (on ? 'active seg-on' : 'text-dim hover:bg-hover hover:text-ink')
const optRow = 'flex cursor-pointer items-start gap-2 text-[12.5px] leading-[1.45] [&_.dim]:mt-px [&_.dim]:block [&_.dim]:text-[11px] [&_.dim]:text-dim'
const optGroup = 'glass-chip flex flex-col gap-2 rounded-xl p-3'
const chk = 'chk size-3.5 shrink-0 cursor-pointer accent-accent'
const fieldCls = 'flex flex-col gap-1 mt-1 text-xs text-dim'

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
        <button className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={onReset} title="Khôi phục mặc định">
          Mặc định
        </button>
      }
    >
      <div className="x2m-opts flex flex-col gap-2.5 px-3 pb-4 pt-3">
        <div className={`x2m-opt-group ${optGroup}`}>
          <div className="x2m-opt-label text-[12.5px] font-semibold tracking-[-0.005em] text-ink">Cấu hình nhanh (Preset)</div>
          <div className={`x2m-presets ${segGroup}`} role="group" aria-label="Cấu hình nhanh">
            <button
              type="button"
              className={cn('x2m-preset-btn', segBtn, segState(activePreset === 'spec'), activePreset === 'spec' && 'active')}
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
              className={cn('x2m-preset-btn', segBtn, segState(activePreset === 'grid'), activePreset === 'grid' && 'active')}
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
              className={cn('x2m-preset-btn', segBtn, segState(activePreset === 'rag'), activePreset === 'rag' && 'active')}
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

        <div className={`x2m-opt-group ${optGroup}`}>
          <div className="x2m-opt-label text-[12.5px] font-semibold tracking-[-0.005em] text-ink">Chế độ xuất file</div>
          <label className={`x2m-radio ${optRow}`}>
            <input
              type="radio"
              className={cx('chk', chk)}
              checked={outputMode === 'per-sheet'}
              onChange={() => onSetMode('per-sheet')}
            />
            <span>
              Mỗi sheet 1 file
              <span className="dim text-dim">TênFile__TênSheet.md</span>
            </span>
          </label>
          <label className={`x2m-radio ${optRow}`}>
            <input
              type="radio"
              className={cx('chk', chk)}
              checked={outputMode === 'per-workbook'}
              onChange={() => onSetMode('per-workbook')}
            />
            <span>
              Gộp cả workbook 1 file
              <span className="dim text-dim">TênFile.md, các sheet nối nhau</span>
            </span>
          </label>
        </div>

        <div className={`x2m-opt-group ${optGroup}`}>
          <div className="x2m-opt-label text-[12.5px] font-semibold tracking-[-0.005em] text-ink">Bố cục Bảng &amp; Sheet</div>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={options.skipDelSheets}
              onChange={(e) => onSetOption('skipDelSheets', e.target.checked)}
            />
            Bỏ qua sheet DEL_ (đã xóa)
          </label>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={options.skipEmptySheets}
              onChange={(e) => onSetOption('skipEmptySheets', e.target.checked)}
            />
            Bỏ qua sheet rỗng
          </label>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={options.includeSheetTitle}
              onChange={(e) => onSetOption('includeSheetTitle', e.target.checked)}
            />
            Thêm tiêu đề tên sheet
          </label>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={options.detectTwoColTables}
              onChange={(e) => onSetOption('detectTwoColTables', e.target.checked)}
            />
            <span>
              Nhận diện bảng 2 cột
              <span className="dim text-dim">Chuyển khối 2 cột liên tiếp thành bảng Markdown</span>
            </span>
          </label>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={alignTables}
              onChange={(e) => onSetOption('alignTables', e.target.checked)}
            />
            <span>
              Căn thẳng cột bảng Markdown
              <span className="dim text-dim">Đệm khoảng trắng cho mã nguồn bảng dễ đọc</span>
            </span>
          </label>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={options.escapeMarkdown}
              onChange={(e) => onSetOption('escapeMarkdown', e.target.checked)}
            />
            <span>
              Escape ký tự Markdown/HTML trong ô
              <span className="dim text-dim">Tắt nếu ô Excel cố ý chứa cú pháp Markdown</span>
            </span>
          </label>
        </div>

        <div className={`x2m-opt-group ${optGroup}`}>
          <div className="x2m-opt-label text-[12.5px] font-semibold tracking-[-0.005em] text-ink">Ô gộp dọc (Vertical Merge)</div>
          <div className={`x2m-seg-group ${segGroup}`} role="radiogroup" aria-label="Xử lý ô gộp dọc">
            <button
              type="button"
              className={cn('x2m-seg-btn', segBtn, segState(vMerge === 'repeat'), vMerge === 'repeat' && 'active')}
              onClick={() => onSetOption('verticalMerge', 'repeat')}
              title="Lặp lại giá trị xuống các dòng dưới (tốt cho tìm kiếm / lọc / AI)"
            >
              Lặp giá trị
            </button>
            <button
              type="button"
              className={cn('x2m-seg-btn', segBtn, segState(vMerge === 'empty'), vMerge === 'empty' && 'active')}
              onClick={() => onSetOption('verticalMerge', 'empty')}
              title="Để trống các dòng dưới giống giao diện Excel"
            >
              Để trống
            </button>
            <button
              type="button"
              className={cn('x2m-seg-btn', segBtn, segState(vMerge === 'ditto'), vMerge === 'ditto' && 'active')}
              onClick={() => onSetOption('verticalMerge', 'ditto')}
              title="Điền ký hiệu ↑ cho các dòng gộp phía dưới"
            >
              Ký hiệu ↑
            </button>
          </div>
        </div>

        <div className={`x2m-opt-group ${optGroup}`}>
          <div className="x2m-opt-label text-[12.5px] font-semibold tracking-[-0.005em] text-ink">Ô nhiều dòng</div>
          <label className={`x2m-radio ${optRow}`}>
            <input
              type="radio"
              className={cx('chk', chk)}
              checked={options.multiline === 'br'}
              onChange={() => onSetOption('multiline', 'br')}
            />
            Xuống dòng bằng &lt;br&gt;
          </label>
          <label className={`x2m-radio ${optRow}`}>
            <input
              type="radio"
              className={cx('chk', chk)}
              checked={options.multiline === 'space'}
              onChange={() => onSetOption('multiline', 'space')}
            />
            Gộp thành một dòng
          </label>
        </div>

        <div className={`x2m-opt-group ${optGroup}`}>
          <div className="x2m-opt-label text-[12.5px] font-semibold tracking-[-0.005em] text-ink">Nâng cao</div>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={options.showFormulas}
              onChange={(e) => onSetOption('showFormulas', e.target.checked)}
            />
            <span>
              Hiện công thức
              <span className="dim text-dim">Giá trị kèm `=công thức`</span>
            </span>
          </label>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={options.frontMatter}
              onChange={(e) => onSetOption('frontMatter', e.target.checked)}
            />
            <span>
              Front-matter YAML
              <span className="dim text-dim">File nguồn + sheet, dùng cho RAG/LLM</span>
            </span>
          </label>
          <label className={`x2m-field ${fieldCls}`}>
            Vùng ô (vd A1:F40)
            <input
              type="text"
              className={cx('input', input, '!bg-canvas !text-[12.5px]')}
              value={options.range}
              placeholder="Cả sheet"
              onChange={(e) => onSetOption('range', e.target.value)}
            />
          </label>
          <label className={`x2m-field ${fieldCls}`}>
            Tách bảng mỗi N dòng (0 = tắt)
            <input
              type="number"
              className={cx('input', input, '!bg-canvas !text-[12.5px]')}
              min={0}
              value={options.chunkRows}
              onChange={(e) => onSetOption('chunkRows', Math.max(0, Math.floor(Number(e.target.value)) || 0))}
            />
          </label>
        </div>

        <div className="x2m-opt-note border-t border-line pt-2.5 text-[11.5px] leading-[1.55] text-faint">
          App tự nhận diện banner 基本設計, meta 機能ID/画面ID/テーブルID, section,
          bảng No/№/項番, header 2 tầng, ô merge ngang/dọc, ghi chú ※ cuối bảng và công thức liên sheet. Phím tắt: Ctrl+O thêm file, Ctrl+Enter để convert.
        </div>
      </div>
    </SidePanel>
  )
}
