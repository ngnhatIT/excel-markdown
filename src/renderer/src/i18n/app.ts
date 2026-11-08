/* Chữ ở cấp app (ngoài các tính năng): màn hình lỗi của ErrorBoundary. */
export const appVi = {
  'crash.title': 'Giao diện gặp lỗi',
  'crash.body': 'Đã ghi lỗi vào error.log (menu Trợ giúp → Mở thư mục log). File trên đĩa không bị ảnh hưởng; bấm Tải lại để tiếp tục.',
  'crash.reload': 'Tải lại',
}

type AppDict = Record<keyof typeof appVi, string>

export const appEn: AppDict = {
  'crash.title': 'Something went wrong',
  'crash.body': 'The error was written to error.log (Help menu → Open Log Folder). Files on disk are not affected; click Reload to continue.',
  'crash.reload': 'Reload',
}

export const appJa: AppDict = {
  'crash.title': '画面でエラーが発生しました',
  'crash.body': 'エラーを error.log に記録しました（ヘルプ → ログフォルダーを開く）。ディスク上のファイルには影響しません。「再読み込み」で続行してください。',
  'crash.reload': '再読み込み',
}
