/* Golden test: convert file Excel mẫu trong test/fixtures với tùy chọn mặc định của app,
 * so với output đã duyệt trong test/golden. Đổi engine có chủ ý thì chạy
 * `npm run test:update` rồi review diff của test/golden trước khi commit.
 * Sinh lại file mẫu: xem scripts/make-fixtures.mjs, scripts/make-excel-fixture.ps1.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { joinWorkbookMarkdown } from './converter'
import { convertWorkbook, listSheets } from '../../adapters/outbound/xlsxFiles'
import { DEFAULT_OPTIONS } from '../../../shared/types'

const FIXTURES = fileURLToPath(new URL('../../../../test/fixtures/', import.meta.url))
const files = readdirSync(FIXTURES).filter((f) => /\.(xlsx|xlsm|xls)$/i.test(f))

describe('golden: file Excel mẫu', () => {
  it('có file mẫu', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const f of files) {
    it(f, async () => {
      const p = join(FIXTURES, f)
      const sheets = listSheets(p, DEFAULT_OPTIONS.skipDelSheets)
      // Giống mặc định của UI: sheet ẩn không được tick.
      const names = sheets.filter((s) => !s.hidden).map((s) => s.name)
      const md = joinWorkbookMarkdown(basename(f, extname(f)), convertWorkbook(p, names, DEFAULT_OPTIONS))
      const golden = `../../../../test/golden/${f}`
      await expect(JSON.stringify(sheets, null, 2) + '\n').toMatchFileSnapshot(golden + '.sheets.json')
      await expect(md).toMatchFileSnapshot(golden + '.md')
    })
  }
})
