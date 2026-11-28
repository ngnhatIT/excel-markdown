/* Entry của utilityProcess đọc Excel. Parse SheetJS là đồng bộ và có thể mất vài giây /
 * vài trăm MB với file lớn; chạy ở đây để main process (cửa sổ, IPC) không bị treo,
 * hủy được bằng cách kill process, và file quá lớn có crash cũng không kéo sập app.
 */
import { readWorkbook } from './adapters/outbound/xlsxFiles'
import { createWorkbookCache } from './adapters/inbound/worker/workbookCache'
import { handleRequest } from './adapters/inbound/worker/workerHandler'
import type { WorkerRequest } from './application/ports/workerProtocol'

const argNum = (name: string): number => Number(process.argv.find((a) => a.startsWith(name))?.slice(name.length))
// --cache=N workbook, --cache-mb=M MB tổng file nguồn (không có = không giới hạn dung lượng)
const cache = createWorkbookCache(argNum('--cache=') || 3, readWorkbook, (argNum('--cache-mb=') || Infinity) * 1024 * 1024)

process.parentPort.on('message', (e) => {
  const req = e.data as WorkerRequest
  process.parentPort.postMessage(handleRequest(cache, req))
})
