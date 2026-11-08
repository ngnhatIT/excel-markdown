/* Entry của utilityProcess đọc Excel. Parse SheetJS là đồng bộ và có thể mất vài giây /
 * vài trăm MB với file lớn; chạy ở đây để main process (cửa sổ, IPC) không bị treo,
 * hủy được bằng cách kill process, và file quá lớn có crash cũng không kéo sập app.
 * Yêu cầu Markdown → Excel (mdInspect/mdToXlsx) cũng chạy ở đây; exceljs chỉ được nạp
 * (import động) khi có mdToXlsx.
 */
import { readWorkbook } from './adapters/outbound/xlsxFiles'
import { handleMdRequest } from './adapters/inbound/worker/mdHandler'
import { createWorkbookCache } from './adapters/inbound/worker/workbookCache'
import { handleRequest } from './adapters/inbound/worker/workerHandler'
import type { WorkerRequest } from './application/ports/workerProtocol'

const argNum = (name: string): number => Number(process.argv.find((a) => a.startsWith(name))?.slice(name.length))
// --cache=N workbook, --cache-mb=M MB tổng file nguồn (không có = không giới hạn dung lượng)
const cache = createWorkbookCache(argNum('--cache=') || 3, readWorkbook, (argNum('--cache-mb=') || Infinity) * 1024 * 1024)

process.parentPort.on('message', async (e) => {
  const req = e.data as WorkerRequest
  // handleMdRequest không ném (mọi lỗi thành phản hồi ok: false)
  const res =
    req.type === 'mdInspect' || req.type === 'mdToXlsx' ? await handleMdRequest(req) : handleRequest(cache, req)
  process.parentPort.postMessage(res)
})
