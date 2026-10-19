/* Entry của utilityProcess đọc Excel. Parse SheetJS là đồng bộ và có thể mất vài giây /
 * vài trăm MB với file lớn; chạy ở đây để main process (cửa sổ, IPC) không bị treo,
 * hủy được bằng cách kill process, và file quá lớn có crash cũng không kéo sập app.
 */
import { readWorkbook } from './converter'
import { createWorkbookCache } from './workbookCache'
import { handleRequest } from './workerHandler'
import type { WorkerRequest } from './workerProtocol'

const cacheArg = process.argv.find((a) => a.startsWith('--cache='))
const cache = createWorkbookCache(Number(cacheArg?.slice('--cache='.length)) || 3, readWorkbook)

process.parentPort.on('message', (e) => {
  process.parentPort.postMessage(handleRequest(cache, e.data as WorkerRequest))
})
