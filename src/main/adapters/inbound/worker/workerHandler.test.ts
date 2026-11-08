import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { readWorkbook } from '../../outbound/xlsxFiles'
import { createWorkbookCache } from './workbookCache'
import { handleRequest } from './workerHandler'
import type { WorkerRequest } from '../../../application/ports/workerProtocol'
import { DEFAULT_OPTIONS } from '../../../../types'

const fixture = fileURLToPath(new URL('../../../../../test/fixtures/kihon-sekkei.xlsx', import.meta.url))

describe('workerHandler', () => {
  let loads = 0
  const cache = createWorkbookCache(3, (p) => {
    loads++
    return readWorkbook(p)
  })

  it('listSheets -> preview -> convert dùng chung 1 lần parse', () => {
    loads = 0
    const ls = handleRequest(cache, { id: 1, type: 'listSheets', path: fixture, skipDelSheets: true })
    expect(ls).toMatchObject({ id: 1, ok: true })
    expect((ls as { data: { name: string }[] }).data.map((s) => s.name)).toEqual([
      '画面項目定義',
      'テーブル定義',
      '内部メモ',
      '空シート',
    ])
    const pv = handleRequest(cache, { id: 2, type: 'preview', path: fixture, sheet: 'テーブル定義', options: DEFAULT_OPTIONS })
    expect(pv.ok && (pv.data as string)).toContain('TBL_CUSTOMER')
    const cv = handleRequest(cache, {
      id: 3,
      type: 'convert',
      path: fixture,
      sheets: ['画面項目定義', '空シート'],
      options: DEFAULT_OPTIONS,
    })
    expect(cv.ok && (cv.data as { sheet: string }[]).map((s) => s.sheet)).toEqual(['画面項目定義'])
    expect(loads).toBe(1)
  })

  it('lỗi trả về { ok: false } kèm message, không ném ra ngoài', () => {
    const missingSheet = handleRequest(cache, { id: 4, type: 'preview', path: fixture, sheet: 'なし', options: DEFAULT_OPTIONS })
    expect(missingSheet).toMatchObject({ id: 4, ok: false, error: 'Không tìm thấy sheet: なし' })
    const missingFile = handleRequest(cache, { id: 5, type: 'listSheets', path: fixture + '.nope', skipDelSheets: true })
    expect(missingFile.ok).toBe(false)
    expect(!missingFile.ok && missingFile.error).toMatch(/ENOENT/)
    const bad = handleRequest(cache, { id: 6, type: 'nope' } as unknown as WorkerRequest)
    expect(bad).toMatchObject({ id: 6, ok: false })
  })

  it('preview gắn YAML front-matter khi options.frontMatter === true', () => {
    const pv = handleRequest(cache, {
      id: 7,
      type: 'preview',
      path: fixture,
      sheet: '画面項目定義',
      options: { ...DEFAULT_OPTIONS, frontMatter: true },
    })
    expect(pv.ok).toBe(true)
    const md = pv.ok ? (pv.data as string) : ''
    expect(md.startsWith('---\nsource: "kihon-sekkei.xlsx"\nsheet: "画面項目定義"\n')).toBe(true)
  })
})
