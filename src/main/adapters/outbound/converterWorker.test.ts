import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Process giả: ghi lại message gửi đi, trả lời khi test gọi `reply`. */
class FakeProc extends EventEmitter {
  sent: { id: number }[] = []
  killed = false
  postMessage(m: { id: number }): void {
    this.sent.push(m)
  }
  kill(): void {
    this.killed = true
    this.emit('exit', null)
  }
  reply(id: number): void {
    this.emit('message', { id, ok: true, data: id })
  }
}
const procs: FakeProc[] = []
vi.mock('electron', () => ({ utilityProcess: { fork: () => (procs.push(new FakeProc()), procs[procs.length - 1]) } }))

const { ConverterWorker } = await import('./converterWorker')

describe('ConverterWorker watchdog', () => {
  afterEach(() => {
    vi.useRealTimers()
    procs.length = 0
  })

  it('hàng đợi dài nhưng vẫn có tiến triển: không bị kill dù tổng thời gian vượt giới hạn', async () => {
    vi.useFakeTimers()
    const w = new ConverterWorker('w.js', [], 't', 120_000)
    const a = w.request({ type: 'listSheets', path: '/a.xlsx', skipDelSheets: true })
    const b = w.request({ type: 'listSheets', path: '/b.xlsx', skipDelSheets: true })
    const p = procs[0]
    await vi.advanceTimersByTimeAsync(100_000)
    p.reply(p.sent[0].id)
    await vi.advanceTimersByTimeAsync(100_000) // tổng 200s, nhưng b mới chạy 100s
    p.reply(p.sent[1].id)
    await expect(Promise.all([a, b])).resolves.toEqual([p.sent[0].id, p.sent[1].id])
    expect(p.killed).toBe(false)
  })

  it('không có phản hồi quá giới hạn: kill, mọi yêu cầu chờ báo lỗi quá giờ', async () => {
    vi.useFakeTimers()
    const w = new ConverterWorker('w.js', [], 't', 120_000)
    const a = w.request({ type: 'listSheets', path: '/a.xlsx', skipDelSheets: true })
    const rejected = expect(a).rejects.toThrow('120 giây')
    await vi.advanceTimersByTimeAsync(120_001)
    await rejected
    expect(procs[0].killed).toBe(true)
  })
})
