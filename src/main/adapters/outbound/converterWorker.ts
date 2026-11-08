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
  /** Lý do process bị kill chủ động (Hủy / quá giờ); không có = dừng bất thường */
  reason?: Error
}

export class ConverterWorker {
  private live: Live | null = null
  private seq = 0

  constructor(
    private readonly entry: string,
    private readonly args: string[],
    private readonly serviceName: string,
    /** Quá thời gian này mà yêu cầu chưa xong thì kill worker (file độc/hỏng làm parse treo); 0 = không giới hạn */
    private readonly timeoutMs = 0
  ) {}

  private spawn(): Live {
    const proc = utilityProcess.fork(this.entry, this.args, { serviceName: this.serviceName })
    // pending gắn với từng process: process cũ thoát muộn không được reject yêu cầu của process mới
    const live: Live = { proc, pending: new Map() }
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
      const err =
        live.reason ??
        new Error(
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
      const timer =
        this.timeoutMs > 0
          ? setTimeout(() => {
              if (!live.pending.has(id)) return
              this.kill(live, new Error(`Đọc file quá ${Math.round(this.timeoutMs / 1000)} giây nên đã dừng. File có thể bị hỏng hoặc quá lớn.`))
            }, this.timeoutMs)
          : undefined
      const done = (): void => clearTimeout(timer)
      live.pending.set(id, {
        resolve: (v) => (done(), resolve(v as T)),
        reject: (e) => (done(), reject(e)),
      })
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
    if (this.live) this.kill(this.live, new CancelledError())
  }

  private kill(live: Live, reason: Error): void {
    live.reason = reason
    if (this.live === live) this.live = null
    live.proc.kill()
  }
}
