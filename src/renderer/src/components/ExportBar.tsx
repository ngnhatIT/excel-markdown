/* Thanh Copy Markdown / Copy TSV / Lưu .md cho một báo cáo (影響調査, 整合性チェック, 質問票). */
import { t as tr, useT } from '../i18n'
import { errMsg } from '../lib/api'
import { btnGhost, btnSm, cx } from '../lib/ui'
import { copyText, toast } from '../lib/utils'

const copyOut = async (src: string, label: string): Promise<void> => {
  const ok = await copyText(src)
  toast(ok ? tr('toast.copied', { label }) : tr('common.copyFailed'), ok ? 'ok' : 'err')
}

/** Copy Markdown / Copy TSV / Lưu .md cho một báo cáo. */
export function ExportBar({ md, tsv, name, label }: { md: () => string; tsv: () => string; name: string; label: string }): React.ReactElement {
  const t = useT()
  const save = async (): Promise<void> => {
    try {
      const saved = await window.api.saveMarkdown(name, md())
      if (saved) toast(t('sm.export.saved', { path: saved }), 'ok')
    } catch (err) {
      toast(t('sm.export.saveFailed', { err: errMsg(err) }), 'err')
    }
  }
  return (
    <span className="x2m-specmap-export ml-auto flex shrink-0 items-center gap-1">
      <button className={cx(btnGhost, btnSm)} onClick={() => void copyOut(md(), label)}>
        {t('sm.export.copyMd')}
      </button>
      <button className={cx(btnGhost, btnSm)} onClick={() => void copyOut(tsv(), label)}>
        {t('sm.export.copyTsv')}
      </button>
      <button className={cx(btnGhost, btnSm)} onClick={() => void save()} title={t('sm.export.saveTitle')}>
        {t('sm.export.save')}
      </button>
    </span>
  )
}

