/* Phía main: gửi yêu cầu tới worker đọc Excel (utilityProcess), chờ kết quả theo id.
 * Worker khởi động lười, tự khởi động lại sau khi bị hủy hoặc crash.
 */
import { utilityProcess, type UtilityProcess } from 'electron'
import { CancelledError, type DistributiveOmit, type WorkerRequest, type WorkerResponse } from '../../application/ports/workerProtocol'


interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

interface Live {
  proc: UtilityProcess
  pending: Map<number, Pending>
  cancelled: boolean
}

export class ConverterWorker {
  private live: Live | null = null
  private seq = 0

  constructor(
    private readonly entry: string,
    private readonly args: string[],
    private readonly serviceName: string
  ) {}

  private spawn(): Live {
    const proc = utilityProcess.fork(this.entry, this.args, { serviceName: this.serviceName })
    // pending gắn với từng process: process cũ thoát muộn không được reject yêu cầu của process mới
    const live: Live = { proc, pending: new Map(), cancelled: false }
    proc.on('message', (res: WorkerResponse) => {
      const p = live.pending.get(res.id)
      if (!p) return
      live.pending.delete(res.id)
      if (res.ok) {
        p.resolve(res.data)
      } else {
        const err = new Error(res.error)
        if (res.stack) err.stack = res.stack
        p.reject(err)
      }
    })
    proc.on('exit', (code) => {
      if (this.live === live) this.live = null
      const err = live.cancelled
        ? new CancelledError()
        : new Error(
            `Tiến trình đọc Excel dừng bất thường (mã ${code}). File có thể quá lớn hoặc bị hỏng; hãy thử lại.`
          )
      for (const p of live.pending.values()) p.reject(err)
      live.pending.clear()
    })
    this.live = live
    return live
  }

  request<T>(req: DistributiveOmit<WorkerRequest, 'id'>): Promise<T> {
    const live = this.live ?? this.spawn()
    const id = ++this.seq
    return new Promise<T>((resolve, reject) => {
      live.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      live.proc.postMessage({ ...req, id })
    })
  }

  /** Khởi động sẵn để yêu cầu đầu tiên không phải chờ process lên. */
  warmUp(): void {
    if (!this.live) this.spawn()
  }

  /** Dừng mọi việc đang chạy: kill process (parse SheetJS đồng bộ, không ngắt giữa chừng
   * được). Yêu cầu đang chờ bị reject bằng CancelledError; yêu cầu sau khởi động process mới. */
  cancel(): void {
    const live = this.live
    if (!live) return
    live.cancelled = true
    this.live = null
    live.proc.kill()
  }
}
