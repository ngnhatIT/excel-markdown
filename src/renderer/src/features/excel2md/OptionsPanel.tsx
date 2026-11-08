import type { ConvertOptions, OutputMode, VerticalMergeMode } from '../../../../shared/types'
import { cn } from '../../lib/utils'
import { SidePanel } from '../../components/SidePanel'
import { btnGhost, btnSm, cx, input } from '../../lib/ui'
import { useT } from '../../i18n'

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
  const t = useT()
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
        <button className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={onReset} title={t('opts.resetTitle')}>
          {t('opts.reset')}
        </button>
      }
    >
      <div className="x2m-opts flex flex-col gap-2.5 px-3 pb-4 pt-3">
        <div className={`x2m-opt-group ${optGroup}`}>
          <div className="x2m-opt-label text-[12.5px] font-semibold tracking-[-0.005em] text-ink">{t('opts.preset')}</div>
          <div className={`x2m-presets ${segGroup}`} role="group" aria-label={t('opts.presetAria')}>
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
              title={t('opts.preset.specTitle')}
            >
              {t('opts.preset.spec')}
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
              title={t('opts.preset.gridTitle')}
            >
              {t('opts.preset.grid')}
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
              title={t('opts.preset.ragTitle')}
            >
              {t('opts.preset.rag')}
            </button>
          </div>
        </div>

        <div className={`x2m-opt-group ${optGroup}`}>
          <div className="x2m-opt-label text-[12.5px] font-semibold tracking-[-0.005em] text-ink">{t('opts.output')}</div>
          <label className={`x2m-radio ${optRow}`}>
            <input
              type="radio"
              className={cx('chk', chk)}
              checked={outputMode === 'per-sheet'}
              onChange={() => onSetMode('per-sheet')}
            />
            <span>
              {t('opts.perSheet')}
              <span className="dim text-dim">{t('opts.perSheetHint')}</span>
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
              {t('opts.perWorkbook')}
              <span className="dim text-dim">{t('opts.perWorkbookHint')}</span>
            </span>
          </label>
        </div>

        <div className={`x2m-opt-group ${optGroup}`}>
          <div className="x2m-opt-label text-[12.5px] font-semibold tracking-[-0.005em] text-ink">{t('opts.layout')}</div>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={options.skipDelSheets}
              onChange={(e) => onSetOption('skipDelSheets', e.target.checked)}
            />
            {t('opts.skipDel')}
          </label>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={options.skipEmptySheets}
              onChange={(e) => onSetOption('skipEmptySheets', e.target.checked)}
            />
            {t('opts.skipEmpty')}
          </label>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={options.includeSheetTitle}
              onChange={(e) => onSetOption('includeSheetTitle', e.target.checked)}
            />
            {t('opts.sheetTitle')}
          </label>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={options.detectTwoColTables}
              onChange={(e) => onSetOption('detectTwoColTables', e.target.checked)}
            />
            <span>
              {t('opts.twoCol')}
              <span className="dim text-dim">{t('opts.twoColHint')}</span>
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
              {t('opts.align')}
              <span className="dim text-dim">{t('opts.alignHint')}</span>
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
              {t('opts.escape')}
              <span className="dim text-dim">{t('opts.escapeHint')}</span>
            </span>
          </label>
        </div>

        <div className={`x2m-opt-group ${optGroup}`}>
          <div className="x2m-opt-label text-[12.5px] font-semibold tracking-[-0.005em] text-ink">{t('opts.vmerge')}</div>
          <div className={`x2m-seg-group ${segGroup}`} role="radiogroup" aria-label={t('opts.vmergeAria')}>
            <button
              type="button"
              className={cn('x2m-seg-btn', segBtn, segState(vMerge === 'repeat'), vMerge === 'repeat' && 'active')}
              onClick={() => onSetOption('verticalMerge', 'repeat')}
              title={t('opts.vmerge.repeatTitle')}
            >
              {t('opts.vmerge.repeat')}
            </button>
            <button
              type="button"
              className={cn('x2m-seg-btn', segBtn, segState(vMerge === 'empty'), vMerge === 'empty' && 'active')}
              onClick={() => onSetOption('verticalMerge', 'empty')}
              title={t('opts.vmerge.emptyTitle')}
            >
              {t('opts.vmerge.empty')}
            </button>
            <button
              type="button"
              className={cn('x2m-seg-btn', segBtn, segState(vMerge === 'ditto'), vMerge === 'ditto' && 'active')}
              onClick={() => onSetOption('verticalMerge', 'ditto')}
              title={t('opts.vmerge.dittoTitle')}
            >
              {t('opts.vmerge.ditto')}
            </button>
          </div>
        </div>

        <div className={`x2m-opt-group ${optGroup}`}>
          <div className="x2m-opt-label text-[12.5px] font-semibold tracking-[-0.005em] text-ink">{t('opts.multiline')}</div>
          <label className={`x2m-radio ${optRow}`}>
            <input
              type="radio"
              className={cx('chk', chk)}
              checked={options.multiline === 'br'}
              onChange={() => onSetOption('multiline', 'br')}
            />
            {t('opts.multiline.br')}
          </label>
          <label className={`x2m-radio ${optRow}`}>
            <input
              type="radio"
              className={cx('chk', chk)}
              checked={options.multiline === 'space'}
              onChange={() => onSetOption('multiline', 'space')}
            />
            {t('opts.multiline.space')}
          </label>
        </div>

        <div className={`x2m-opt-group ${optGroup}`}>
          <div className="x2m-opt-label text-[12.5px] font-semibold tracking-[-0.005em] text-ink">{t('opts.advanced')}</div>
          <label className={`x2m-check ${optRow}`}>
            <input
              type="checkbox"
              className={cx('chk', chk)}
              checked={options.showFormulas}
              onChange={(e) => onSetOption('showFormulas', e.target.checked)}
            />
            <span>
              {t('opts.formulas')}
              <span className="dim text-dim">{t('opts.formulasHint')}</span>
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
              {t('opts.frontMatter')}
              <span className="dim text-dim">{t('opts.frontMatterHint')}</span>
            </span>
          </label>
          <label className={`x2m-field ${fieldCls}`}>
            {t('opts.range')}
            <input
              type="text"
              className={cx('input', input, '!bg-canvas !text-[12.5px]')}
              value={options.range}
              placeholder={t('opts.rangePlaceholder')}
              onChange={(e) => onSetOption('range', e.target.value)}
            />
          </label>
          <label className={`x2m-field ${fieldCls}`}>
            {t('opts.chunk')}
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
          {t('opts.note')}
        </div>
      </div>
    </SidePanel>
  )
}
