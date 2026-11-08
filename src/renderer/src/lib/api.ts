/* Kiểu của `window.api` (expose bởi src/preload/index.ts qua contextBridge). */
import type {
  AiAskRequest,
  AiAskResponse,
  AiConfigInfo,
  AiProvider,
  AiSetConfigPayload,
  ConvertOptions,
  ConvertResultItem,
  MdConvertResult,
  MdFolderListing,
  MdSearchResult,
  MdInspectResult,
  OutputMode,
} from '../../../shared/types'

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
  openMarkdownFiles(): Promise<string[]>
  openCompareFile(): Promise<string | null>
  compareRead(path: string): Promise<string>
  openDirectory(): Promise<string | null>
  saveHtml(defaultName: string, html: string): Promise<string | null>
  saveMarkdown(defaultName: string, md: string): Promise<string | null>
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
  inspectMarkdown(path: string): Promise<MdInspectResult>
  convertMarkdown(payload: { files: string[]; outDir: string; fileName: string }): Promise<MdConvertResult>
  openMarkdownFolder(): Promise<string | null>
  listMarkdownFolder(root: string): Promise<MdFolderListing>
  searchMarkdownFolder(root: string, query: string): Promise<MdSearchResult>
  readMarkdown(path: string): Promise<string>
  aiGetConfig(): Promise<AiConfigInfo>
  aiSetConfig(payload: AiSetConfigPayload): Promise<AiConfigInfo>
  aiAsk(req: AiAskRequest): Promise<AiAskResponse>
  aiListModels(provider?: AiProvider): Promise<string[]>
  onAiDelta(cb: (text: string) => void): () => void
  aiTranslate(text: string, target: string): Promise<string>
  aiCancel(): Promise<void>
}

declare global {
  interface Window {
    api: WindowApi
  }
}

/** Message lỗi để hiện cho người dùng. */
export const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err))
