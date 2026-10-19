/* Kiểu của `window.api` (expose bởi src/preload/index.ts qua contextBridge). */
import type { ConvertOptions, ConvertResultItem, OutputMode } from '../../types'

export interface SheetListItem {
  name: string
  rows: number
  hidden: boolean
}

export interface ConvertProgress {
  done: number
  total: number
}

export interface WindowApi {
  storeGet<T>(key: string): Promise<T | null>
  storeSet(key: string, value: unknown): Promise<void>
  openExcelFiles(): Promise<string[]>
  openDirectory(): Promise<string | null>
  openPath(target: string): Promise<void>
  getVersion(): Promise<string>
  getPathForFile(file: File): string
  onOpenFiles(cb: (paths: string[]) => void): () => void
  onProgress(cb: (p: ConvertProgress) => void): () => void
  listSheets(filePath: string, skipDelSheets: boolean): Promise<SheetListItem[]>
  previewSheet(filePath: string, sheetName: string, options: ConvertOptions): Promise<string>
  convert(payload: {
    files: { path: string; sheets: string[] }[]
    outDir: string
    options: ConvertOptions
    outputMode: OutputMode
  }): Promise<ConvertResultItem[]>
  cancelConvert(): Promise<void>
}

declare global {
  interface Window {
    api: WindowApi
  }
}

/** Message lỗi để hiện cho người dùng. */
export const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err))
