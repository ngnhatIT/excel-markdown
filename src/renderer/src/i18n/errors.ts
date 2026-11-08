/* Mã lỗi do main trả về (\`E_…\`), dịch ở renderer theo ngôn ngữ giao diện. */
export const errorsVi = {
  'err.E_COMPARE_UNSUPPORTED': 'Chỉ so sánh được file Excel (.xlsx/.xlsm/.xls) hoặc Markdown (.md).',
  'err.E_SEARCH_NOT_OPENED': 'Chưa mở thư mục này.',
  'err.E_SEARCH_BAD_QUERY': 'Từ khóa không hợp lệ (1–200 ký tự).',
  'err.E_SPECMAP_TOO_BIG': 'Thư mục quá lớn để lập Bản đồ thiết kế. Hãy mở thư mục con nhỏ hơn.',
  'err.E_TR_INVALID': 'Đoạn chọn hoặc ngôn ngữ đích không hợp lệ.',
  'err.E_TR_TOO_LONG': 'Đoạn chọn quá dài (tối đa 4 000 ký tự). Hãy chọn ngắn hơn hoặc dùng khung Trợ lý AI.',
}

type ErrDict = Record<keyof typeof errorsVi, string>

export const errorsEn: ErrDict = {
  'err.E_COMPARE_UNSUPPORTED': 'Only Excel (.xlsx/.xlsm/.xls) or Markdown (.md) files can be compared.',
  'err.E_SEARCH_NOT_OPENED': 'This folder is not open.',
  'err.E_SEARCH_BAD_QUERY': 'Invalid search text (1–200 characters).',
  'err.E_SPECMAP_TOO_BIG': 'This folder is too large for the spec map. Open a smaller subfolder.',
  'err.E_TR_INVALID': 'Invalid selection or target language.',
  'err.E_TR_TOO_LONG': 'The selection is too long (max 4,000 characters). Select less or use the AI assistant panel.',
}

export const errorsJa: ErrDict = {
  'err.E_COMPARE_UNSUPPORTED': '比較できるのは Excel（.xlsx/.xlsm/.xls）または Markdown（.md）のみです。',
  'err.E_SEARCH_NOT_OPENED': 'このフォルダは開かれていません。',
  'err.E_SEARCH_BAD_QUERY': '検索語が不正です（1〜200 文字）。',
  'err.E_SPECMAP_TOO_BIG': 'フォルダが大きすぎて設計マップを作成できません。より小さいサブフォルダを開いてください。',
  'err.E_TR_INVALID': '選択範囲または翻訳先の言語が不正です。',
  'err.E_TR_TOO_LONG': '選択範囲が長すぎます（最大 4,000 文字）。短く選択するか AI アシスタント欄を使ってください。',
}
