/* Markdown của cả workbook để so sánh (git textconv, so sánh 新旧 trong app). Nạp SheetJS:
 * chỉ dùng ở CLI và worker, không import từ main process. */
import { createHash } from 'node:crypto'
import { DEFAULT_OPTIONS, type ConvertOptions } from '../../../shared/types'
import { convertSheetsInWorkbook, listSheetsInWorkbook, type WorkBook } from '../../domain/excel/converter'
import { ASSET_TOKEN, linkSheets } from '../../domain/excel/output'
import { readWorkbook } from './xlsxFiles'

/** Mọi sheet kể cả sheet ẩn và `DEL_`, không tiêu đề tên file (git đưa file tạm tên ngẫu nhiên),
 * ảnh thành tên + sha1 nội dung để đổi ảnh cũng hiện trong diff. Nhận đường dẫn hoặc workbook đã parse (cache worker). */
export function workbookMarkdownForDiff(file: string | WorkBook): string {
  const wb = typeof file === 'string' ? readWorkbook(file) : file
  const opts: ConvertOptions = { ...DEFAULT_OPTIONS, skipDelSheets: false }
  const names = listSheetsInWorkbook(wb, false).map((s) => s.name)
  return (
    convertSheetsInWorkbook(wb, names, opts)
      .map((s) =>
        // Link sang sheet khác: giữ tên sheet đích để đổi đích cũng hiện trong diff
        linkSheets(s.markdown.trim(), (sheet) => '#' + encodeURIComponent(sheet)).replace(new RegExp(ASSET_TOKEN + '([^)\\s]+)', 'g'), (_m, enc: string) => {
          const name = decodeURIComponent(enc)
          const data = s.images?.[name]
          return data ? `${enc}#sha1=${createHash('sha1').update(data).digest('hex').slice(0, 12)}` : enc
        })
      )
      .filter((m) => m !== '')
      .join('\n\n---\n\n') + '\n'
  )
}
