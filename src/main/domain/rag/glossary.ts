/* Từ điển ánh xạ thuật ngữ chuyên ngành BA/BrSE Việt - Anh <-> Nhật (基本設計)
 * để câu hỏi bằng tiếng Việt khớp trực tiếp với các bảng/mục tiếng Nhật mà không tốn thêm 1 lượt gọi API phụ.
 * Thêm 用語集 của dự án (file 用語集.md / glossary.md của thư mục đang mở ở Đọc Markdown) khi có.
 */
import type { GlossaryEntry as ProjectTerm } from '../../../shared/glossary'

interface GlossaryEntry {
  triggers: string[]
  jaTerms: string[]
}

const VI_JA_GLOSSARY: GlossaryEntry[] = [
  {
    triggers: ['màn hình', 'man hinh', 'giao diện', 'screen', 'ui', 'form', 'trang'],
    jaTerms: ['画面', '画面id', '画面名', '表示', '項目', 'レイアウト'],
  },
  {
    triggers: ['khách hàng', 'khach hang', 'customer', 'client', 'đối tác'],
    jaTerms: ['顧客', '取引先', 'カスタマ', '得意先', 'customer'],
  },
  {
    triggers: ['bắt buộc', 'bat buoc', 'required', 'mandatory', 'không được trống', 'null'],
    jaTerms: ['必須', '○', 'not null', '入力必須'],
  },
  {
    triggers: ['kiểm tra', 'kiem tra', 'điều kiện', 'dieu kien', 'validate', 'validation', 'check', 'ràng buộc', 'độ dài', 'ký tự'],
    jaTerms: ['入力チェック', 'チェック', 'バリデーション', '条件', '桁数', '文字', '半角', '全角', '型'],
  },
  {
    triggers: ['bảng', 'table', 'db', 'database', 'cơ sở dữ liệu', 'cột', 'column', 'trường', 'field', 'master'],
    jaTerms: ['テーブル', 'マスタ', 'カラム', '項目定義', '項目名', '物理名', '論理名', '型', 'pk'],
  },
  {
    triggers: ['lỗi', 'thông báo', 'thong bao', 'error', 'message', 'cảnh báo', 'ngoại lệ'],
    jaTerms: ['エラー', 'メッセージ', '異常', '警告', 'エラーメッセージ'],
  },
  {
    triggers: ['nút', 'sự kiện', 'su kien', 'button', 'event', 'action', 'xử lý', 'xu ly', 'bấm', 'click'],
    jaTerms: ['イベント', 'ボタン', '処理', '押下', 'アクション', '初期表示', '検索', '登録', '更新', '削除'],
  },
  {
    triggers: ['chuyển màn hình', 'điều hướng', 'transition', 'luồng', 'flow', 'chuyển trang'],
    jaTerms: ['画面遷移', '遷移', '遷移先', '遷移元'],
  },
  {
    triggers: ['api', 'tích hợp', 'liên kết', 'interface', 'endpoint', 'request', 'response'],
    jaTerms: ['api', 'if', '連携', 'エンドポイント', 'リクエスト', 'レスポンス', 'パラメータ'],
  },
  {
    triggers: ['người dùng', 'tài khoản', 'user', 'account', 'quyền', 'phân quyền', 'role', 'đăng nhập', 'login'],
    jaTerms: ['ユーザ', 'ユーザー', 'アカウント', '権限', 'ロール', 'ログイン', '認証'],
  },
  {
    triggers: ['hợp đồng', 'hop dong', 'contract', 'đơn hàng', 'order'],
    jaTerms: ['契約', '注文', '受注', '発注', '調達', 'order', 'contract'],
  },
  {
    triggers: ['phiên bản', 'lịch sử', 'version', 'ngày tạo', 'người tạo', 'tác giả'],
    jaTerms: ['版数', '作成日', '作成者', '更新日', '改定履歴'],
  },
]

/* 用語集 của thư mục mở gần nhất ở Đọc Markdown: viewer.ts đặt (mdv:list / mdv:specIndex), ai:translate và RAG đọc.
 * shortcut: một bản cho cả app (chỉ có một cửa sổ, một thư mục đang xem); nhiều cửa sổ thì cần khóa theo thư mục. */
let projectTerms: readonly ProjectTerm[] = []
export function setProjectGlossary(entries: readonly ProjectTerm[]): void {
  projectTerms = entries
}
export const projectGlossary = (): readonly ProjectTerm[] => projectTerms

/** Bung câu hỏi tiếng Việt/Anh thành danh sách các từ khóa tiếng Nhật chuyên ngành tương ứng.
 * `extra`: cặp thuật ngữ của dự án (mặc định 用語集 đang mở), thêm vào sau từ điển có sẵn. */
export function expandViJaQueryTerms(query: string, extra: readonly ProjectTerm[] = projectTerms): string[] {
  const qLower = query.toLowerCase()
  const out = new Set<string>()
  for (const entry of VI_JA_GLOSSARY) {
    if (entry.triggers.some((t) => qLower.includes(t))) {
      for (const ja of entry.jaTerms) out.add(ja)
    }
  }
  for (const e of extra) {
    // Thuật ngữ quá ngắn (`id`, `no`) khớp lung tung: bỏ
    if ([e.vi, e.en].some((t) => t.trim().length >= 3 && qLower.includes(t.trim().toLowerCase()))) out.add(e.ja)
  }
  return Array.from(out)
}
