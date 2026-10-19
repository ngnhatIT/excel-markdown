import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  ApiResult,
  ConvertFileSpec,
  ConvertOptions,
  ConvertResultItem,
  OutputMode,
} from '../types'

interface SheetListItem {
  name: string
  rows: number
  hidden: boolean
}

async function unwrap<T>(p: Promise<ApiResult<T>>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error ?? 'Lỗi không xác định')
  return res.data as T
}

contextBridge.exposeInMainWorld('api', {
  storeGet: <T>(key: string): Promise<T | null> =>
    unwrap(ipcRenderer.invoke('store:get', key) as Promise<ApiResult<T | null>>),
  storeSet: (key: string, value: unknown): Promise<void> =>
    unwrap(ipcRenderer.invoke('store:set', key, value) as Promise<ApiResult<null>>).then(() => undefined),

  openExcelFiles: (): Promise<string[]> =>
    unwrap(ipcRenderer.invoke('dialog:openExcelFiles') as Promise<ApiResult<string[]>>),
  openDirectory: (): Promise<string | null> =>
    unwrap(ipcRenderer.invoke('dialog:openDirectory') as Promise<ApiResult<string | null>>),
  openPath: (target: string): Promise<void> =>
    unwrap(ipcRenderer.invoke('shell:openPath', target) as Promise<ApiResult<null>>).then(() => undefined),
  getVersion: (): Promise<string> =>
    unwrap(ipcRenderer.invoke('app:getVersion') as Promise<ApiResult<string>>),
  /** Đường dẫn thật của File kéo-thả. Electron 32+ đã bỏ `File.path`;
   * trả '' nếu không phải file trên đĩa. */
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  onOpenFiles: (cb: (paths: string[]) => void): (() => void) => {
    const listener = (_e: unknown, v: string[]): void => cb(v)
    ipcRenderer.on('open-files', listener)
    return () => ipcRenderer.removeListener('open-files', listener)
  },
  onProgress: (cb: (p: { done: number; total: number }) => void): (() => void) => {
    const listener = (_e: unknown, v: { done: number; total: number }): void => cb(v)
    ipcRenderer.on('excel:progress', listener)
    return () => ipcRenderer.removeListener('excel:progress', listener)
  },

  listSheets: (filePath: string, skipDelSheets: boolean): Promise<SheetListItem[]> =>
    unwrap(
      ipcRenderer.invoke('excel:listSheets', filePath, skipDelSheets) as Promise<
        ApiResult<SheetListItem[]>
      >
    ),
  previewSheet: (filePath: string, sheetName: string, options: ConvertOptions): Promise<string> =>
    unwrap(
      ipcRenderer.invoke('excel:preview', filePath, sheetName, options) as Promise<ApiResult<string>>
    ),
  convert: (payload: {
    files: ConvertFileSpec[]
    outDir: string
    options: ConvertOptions
    outputMode: OutputMode
  }): Promise<ConvertResultItem[]> =>
    unwrap(ipcRenderer.invoke('excel:convert', payload) as Promise<ApiResult<ConvertResultItem[]>>),
  cancelConvert: (): Promise<void> =>
    unwrap(ipcRenderer.invoke('excel:cancel') as Promise<ApiResult<null>>).then(() => undefined),
})
