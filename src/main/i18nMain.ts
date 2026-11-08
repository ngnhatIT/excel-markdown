/* Đa ngôn ngữ cho chữ do main hiện trực tiếp: hộp thoại hệ thống, menu, ghi chú gắn vào kết quả, lỗi từng file.
 * Ngôn ngữ = khóa 'lang' của store.json (renderer lưu khi đổi), cache ở đây; index.ts nạp lúc khởi động,
 * store:set cập nhật. Lỗi trả về renderer qua IPC vẫn là mã `E_…` (renderer dịch, xem domain/errors.ts).
 * Thuần (không import Electron) để test được.
 */
import { describeError, type ErrLang } from './domain/errors'

export type MainLang = ErrLang

const vi = {
  'dialog.openExcel': 'Chọn file Excel',
  'dialog.openMd': 'Chọn file Markdown',
  'dialog.openCompare': 'Chọn file để so sánh',
  'dialog.outDir': 'Chọn thư mục lưu kết quả',
  'dialog.mdFolder': 'Chọn thư mục chứa file Markdown',
  'dialog.saveHtml': 'Lưu trang HTML',
  'dialog.saveMd': 'Lưu file Markdown',

  'overwrite.one': 'File {name} đã tồn tại. Ghi đè?',
  'overwrite.many': '{n} file .md đã có trong thư mục xuất (vd {name}). Ghi đè?',
  'overwrite.yes': 'Ghi đè',
  'common.cancel': 'Hủy',
  'common.close': 'Đóng',
  'common.reload': 'Tải lại',

  'convert.cancelled': 'Đã hủy',
  'convert.unreadable': 'File không tồn tại hoặc không đọc được: {path}',
  'convert.mdLocked': 'Không ghi được file .md: file đang bị chương trình khác khóa hoặc không có quyền ghi.',
  'convert.mdWriteFailed': 'Không ghi được file .md: {err}',

  'preview.truncated':
    'Bản xem trước quá dài nên chỉ hiện {shown} / {total} ký tự đầu. File .md khi convert vẫn có đủ nội dung.',
  'ai.skippedNote':
    '*(Lưu ý: mỗi câu hỏi chỉ đọc tối đa {max} file của thư mục và {loose} file mở lẻ; {n} file vượt giới hạn chưa được đọc. Hãy mở thư mục con hoặc chọn "Chỉ file đang xem" để hỏi về các file đó.)*',

  'crash.message': 'Giao diện gặp sự cố và đã dừng.',
  'crash.detail': 'Lý do: {reason}. Bấm Tải lại để mở lại giao diện (file trên đĩa không bị ảnh hưởng).',

  'menu.edit': 'Sửa',
  'menu.undo': 'Hoàn tác',
  'menu.redo': 'Làm lại',
  'menu.cut': 'Cắt',
  'menu.copy': 'Sao chép',
  'menu.paste': 'Dán',
  'menu.selectAll': 'Chọn tất cả',
  'menu.view': 'Xem',
  'menu.zoomIn': 'Phóng to',
  'menu.zoomOut': 'Thu nhỏ',
  'menu.resetZoom': 'Cỡ thật',
  'menu.fullscreen': 'Toàn màn hình',
  'menu.reload': 'Tải lại',
  'menu.forceReload': 'Tải lại (bỏ cache)',
  'menu.devTools': 'Công cụ nhà phát triển',
  'menu.help': 'Trợ giúp',
  'menu.about': 'Giới thiệu',
  'menu.openLogs': 'Mở thư mục log',
  'menu.copyDiag': 'Copy thông tin chẩn đoán',
  'menu.reset': 'Đặt lại cài đặt…',

  'about.detail': 'Phiên bản {version}\nElectron {electron}\nChrome {chrome}\nNode {node}',
  'diag.copied': 'Đã copy thông tin chẩn đoán vào clipboard (API Key đã được che).',
  'reset.message': 'Đặt lại mọi cài đặt về mặc định?',
  'reset.detail': 'API Key và nhà cung cấp AI được giữ lại. Cửa sổ sẽ tải lại.',
  'reset.confirm': 'Đặt lại',
}

export type MainKey = keyof typeof vi
type MainDict = Record<MainKey, string>

const en: MainDict = {
  'dialog.openExcel': 'Select Excel files',
  'dialog.openMd': 'Select Markdown files',
  'dialog.openCompare': 'Select a file to compare',
  'dialog.outDir': 'Select output folder',
  'dialog.mdFolder': 'Select a folder of Markdown files',
  'dialog.saveHtml': 'Save HTML page',
  'dialog.saveMd': 'Save Markdown file',

  'overwrite.one': '{name} already exists. Overwrite?',
  'overwrite.many': '{n} .md files already exist in the output folder (e.g. {name}). Overwrite?',
  'overwrite.yes': 'Overwrite',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.reload': 'Reload',

  'convert.cancelled': 'Cancelled',
  'convert.unreadable': 'File does not exist or cannot be read: {path}',
  'convert.mdLocked': 'Cannot write the .md file: it is locked by another program or not writable.',
  'convert.mdWriteFailed': 'Cannot write the .md file: {err}',

  'preview.truncated':
    'The preview is too long, so only the first {shown} / {total} characters are shown. Converted .md files still contain everything.',
  'ai.skippedNote':
    '*(Note: each question reads at most {max} files of the folder and {loose} loose files; {n} files over the limit were not read. Open a subfolder or choose "Current file only" to ask about them.)*',

  'crash.message': 'The interface crashed and stopped.',
  'crash.detail': 'Reason: {reason}. Click Reload to reopen the interface (files on disk are not affected).',

  'menu.edit': 'Edit',
  'menu.undo': 'Undo',
  'menu.redo': 'Redo',
  'menu.cut': 'Cut',
  'menu.copy': 'Copy',
  'menu.paste': 'Paste',
  'menu.selectAll': 'Select All',
  'menu.view': 'View',
  'menu.zoomIn': 'Zoom In',
  'menu.zoomOut': 'Zoom Out',
  'menu.resetZoom': 'Actual Size',
  'menu.fullscreen': 'Toggle Full Screen',
  'menu.reload': 'Reload',
  'menu.forceReload': 'Force Reload',
  'menu.devTools': 'Developer Tools',
  'menu.help': 'Help',
  'menu.about': 'About',
  'menu.openLogs': 'Open Log Folder',
  'menu.copyDiag': 'Copy Diagnostic Info',
  'menu.reset': 'Reset Settings…',

  'about.detail': 'Version {version}\nElectron {electron}\nChrome {chrome}\nNode {node}',
  'diag.copied': 'Diagnostic info copied to the clipboard (API keys are masked).',
  'reset.message': 'Reset all settings to defaults?',
  'reset.detail': 'API keys and the AI provider are kept. The window will reload.',
  'reset.confirm': 'Reset',
}

const ja: MainDict = {
  'dialog.openExcel': 'Excel ファイルを選択',
  'dialog.openMd': 'Markdown ファイルを選択',
  'dialog.openCompare': '比較するファイルを選択',
  'dialog.outDir': '出力フォルダーを選択',
  'dialog.mdFolder': 'Markdown ファイルのフォルダーを選択',
  'dialog.saveHtml': 'HTML ページを保存',
  'dialog.saveMd': 'Markdown ファイルを保存',

  'overwrite.one': '{name} は既に存在します。上書きしますか？',
  'overwrite.many': '出力フォルダーに .md ファイルが {n} 件あります（例: {name}）。上書きしますか？',
  'overwrite.yes': '上書き',
  'common.cancel': 'キャンセル',
  'common.close': '閉じる',
  'common.reload': '再読み込み',

  'convert.cancelled': 'キャンセルしました',
  'convert.unreadable': 'ファイルが存在しないか読み込めません: {path}',
  'convert.mdLocked': '.md ファイルを書き込めません: 他のプログラムがロックしているか書き込み権限がありません。',
  'convert.mdWriteFailed': '.md ファイルを書き込めません: {err}',

  'preview.truncated': 'プレビューが長すぎるため、先頭 {shown} / {total} 文字のみ表示しています。変換した .md ファイルには全内容が含まれます。',
  'ai.skippedNote':
    '*(注意: 1 回の質問で読み込むのはフォルダーの最大 {max} ファイルと個別に開いた {loose} ファイルまでです。上限を超えた {n} ファイルは読み込まれていません。サブフォルダーを開くか「表示中のファイルのみ」を選んで質問してください。)*',

  'crash.message': '画面に問題が発生し、停止しました。',
  'crash.detail': '理由: {reason}。「再読み込み」で画面を開き直してください（ディスク上のファイルには影響しません）。',

  'menu.edit': '編集',
  'menu.undo': '元に戻す',
  'menu.redo': 'やり直し',
  'menu.cut': '切り取り',
  'menu.copy': 'コピー',
  'menu.paste': '貼り付け',
  'menu.selectAll': 'すべて選択',
  'menu.view': '表示',
  'menu.zoomIn': '拡大',
  'menu.zoomOut': '縮小',
  'menu.resetZoom': '実際のサイズ',
  'menu.fullscreen': '全画面表示',
  'menu.reload': '再読み込み',
  'menu.forceReload': '強制再読み込み',
  'menu.devTools': '開発者ツール',
  'menu.help': 'ヘルプ',
  'menu.about': 'バージョン情報',
  'menu.openLogs': 'ログフォルダーを開く',
  'menu.copyDiag': '診断情報をコピー',
  'menu.reset': '設定をリセット…',

  'about.detail': 'バージョン {version}\nElectron {electron}\nChrome {chrome}\nNode {node}',
  'diag.copied': '診断情報をクリップボードにコピーしました（API キーは伏せ字）。',
  'reset.message': 'すべての設定を既定値に戻しますか？',
  'reset.detail': 'API キーと AI プロバイダーは保持されます。ウィンドウを再読み込みします。',
  'reset.confirm': 'リセット',
}

export const MAIN_DICTS: Record<MainLang, MainDict> = { vi, en, ja }

export const isMainLang = (v: unknown): v is MainLang => v === 'vi' || v === 'en' || v === 'ja'

/** Như detectLang của renderer: chưa lưu lựa chọn thì theo locale hệ điều hành. */
export function langFromLocale(locale: string): MainLang {
  const l = locale.toLowerCase()
  return l.startsWith('ja') ? 'ja' : l.startsWith('en') ? 'en' : 'vi'
}

let current: MainLang = 'vi'

/** Cập nhật ngôn ngữ từ giá trị 'lang' của store; không hợp lệ / chưa có thì theo `locale`. */
export function setMainLang(stored: unknown, locale = 'vi'): void {
  current = isMainLang(stored) ? stored : langFromLocale(locale)
}

export const getMainLang = (): MainLang => current

/** Dịch theo ngôn ngữ giao diện hiện tại; thay {tham số}. */
export function mt(key: MainKey, params?: Record<string, string | number>): string {
  const s = MAIN_DICTS[current][key]
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s
}

/** Lỗi -> câu dễ hiểu theo ngôn ngữ giao diện (lỗi nằm trong dữ liệu trả về, renderer hiện nguyên văn). */
export const mErr = (err: unknown, op: 'read' | 'write' = 'read'): string => describeError(err, current, op)
