/* Adapter ghi file .xlsx xuống đĩa (ghi `.partial` rồi đổi tên). Phần dựng workbook nằm ở domain/md2xlsx/write.ts. */
import type ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { promises as fsp } from 'node:fs'
import { PARTIAL_SUFFIX } from '../../application/ports/workerProtocol'
import { fixInternalLinks, injectIgnoredErrors } from '../../domain/md2xlsx/write'

/** Buffer .xlsx của exceljs -> buffer cuối: chèn ignoredErrors và sửa link nội bộ trong XML từng sheet. */
export async function finalizeXlsx(raw: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(raw)
  for (const file of zip.file(/^xl\/worksheets\/sheet\d+\.xml$/)) {
    const relsPath = file.name.replace(/sheet(\d+)\.xml$/, '_rels/sheet$1.xml.rels')
    const rels = (await zip.file(relsPath)?.async('string')) ?? null
    const fixed = fixInternalLinks(await file.async('string'), rels)
    zip.file(file.name, injectIgnoredErrors(fixed.sheet))
    if (fixed.rels !== null && fixed.rels !== rels) zip.file(relsPath, fixed.rels)
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/**
 * Ghi workbook ra `outPath` an toàn: ghi `outPath + PARTIAL_SUFFIX` rồi đổi tên, nên file cũ
 * không bao giờ bị hỏng nửa chừng. Lỗi → xóa file tạm và ném lại đúng lỗi gốc.
 */
export async function saveWorkbook(
  wb: ExcelJS.Workbook,
  outPath: string,
  deps: { rename?: (from: string, to: string) => Promise<void> } = {}
): Promise<void> {
  const partial = outPath + PARTIAL_SUFFIX
  try {
    const out = await finalizeXlsx(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer))
    await fsp.writeFile(partial, out)
    await (deps.rename ?? fsp.rename)(partial, outPath)
  } catch (err) {
    // Dọn file tạm; lỗi dọn không được che mất lỗi gốc.
    await fsp.rm(partial, { force: true }).catch(() => undefined)
    throw err
  }
}
