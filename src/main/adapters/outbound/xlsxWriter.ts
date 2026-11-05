/* Adapter ghi file .xlsx xuống đĩa (ghi `.partial` rồi đổi tên). Phần dựng workbook nằm ở domain/md2xlsx/write.ts. */
import type ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { promises as fsp } from 'node:fs'
import { PARTIAL_SUFFIX } from '../../application/ports/workerProtocol'
import { injectIgnoredErrors } from '../../domain/md2xlsx/write'

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
    const raw = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    const zip = await JSZip.loadAsync(raw)
    for (const file of zip.file(/^xl\/worksheets\/sheet\d+\.xml$/)) {
      zip.file(file.name, injectIgnoredErrors(await file.async('string')))
    }
    const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    await fsp.writeFile(partial, out)
    await (deps.rename ?? fsp.rename)(partial, outPath)
  } catch (err) {
    // Dọn file tạm; lỗi dọn không được che mất lỗi gốc.
    await fsp.rm(partial, { force: true }).catch(() => undefined)
    throw err
  }
}
