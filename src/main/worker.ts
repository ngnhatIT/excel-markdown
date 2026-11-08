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

const cacheArg = process.argv.find((a) => a.startsWith('--cache='))
const cache = createWorkbookCache(Number(cacheArg?.slice('--cache='.length)) || 3, readWorkbook)

process.parentPort.on('message', async (e) => {
  const req = e.data as WorkerRequest
  // handleMdRequest không ném (mọi lỗi thành phản hồi ok: false)
  const res =
    req.type === 'mdInspect' || req.type === 'mdToXlsx' ? await handleMdRequest(req) : handleRequest(cache, req)
  process.parentPort.postMessage(res)
})
