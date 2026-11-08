/* Chuỗi của popup Dịch nhanh đoạn bôi đen. */
export const translateVi = {
  'tr.button': 'Dịch',
  'tr.buttonTitle': 'Dịch đoạn đã chọn (Ctrl+Shift+T)',
  'tr.title': 'Dịch nhanh',
  'tr.to': 'Dịch sang',
  'tr.loading': 'Đang dịch…',
  'tr.copy': 'Copy bản dịch',
  'tr.copied': 'Đã copy bản dịch',
  'tr.close': 'Đóng (Esc)',
  'tr.noKey': 'Chưa có API Key. Mở khung Trợ lý AI ở chế độ Đọc Markdown để nhập key của Gemini / Claude / OpenAI.',
  'tr.tooLong': 'Đoạn chọn quá dài (tối đa {n} ký tự).',
  'tr.privacy': 'Đoạn chọn được gửi tới nhà cung cấp AI bạn đã cấu hình.',
  'tr.retry': 'Thử lại',
}

type TrDict = Record<keyof typeof translateVi, string>

export const translateEn: TrDict = {
  'tr.button': 'Translate',
  'tr.buttonTitle': 'Translate the selection (Ctrl+Shift+T)',
  'tr.title': 'Quick translate',
  'tr.to': 'Translate to',
  'tr.loading': 'Translating…',
  'tr.copy': 'Copy translation',
  'tr.copied': 'Translation copied',
  'tr.close': 'Close (Esc)',
  'tr.noKey': 'No API key yet. Open the AI assistant panel in Read Markdown mode to enter a Gemini / Claude / OpenAI key.',
  'tr.tooLong': 'Selection is too long (max {n} characters).',
  'tr.privacy': 'The selection is sent to the AI provider you configured.',
  'tr.retry': 'Retry',
}

export const translateJa: TrDict = {
  'tr.button': '翻訳',
  'tr.buttonTitle': '選択範囲を翻訳 (Ctrl+Shift+T)',
  'tr.title': 'クイック翻訳',
  'tr.to': '翻訳先',
  'tr.loading': '翻訳中…',
  'tr.copy': '訳文をコピー',
  'tr.copied': '訳文をコピーしました',
  'tr.close': '閉じる (Esc)',
  'tr.noKey': 'API キーが未設定です。Markdown 閲覧モードの AI アシスタント欄で Gemini / Claude / OpenAI のキーを入力してください。',
  'tr.tooLong': '選択範囲が長すぎます（最大 {n} 文字）。',
  'tr.privacy': '選択したテキストは設定済みの AI プロバイダーに送信されます。',
  'tr.retry': '再試行',
}
