/* Lịch sử dịch trong phiên (đoạn bôi đen, một mục, một bảng): kho nhỏ dùng chung giữa popup Dịch nhanh,
 * hộp Dịch mục và tab Dịch ở cột phải. Chỉ trong bộ nhớ: đóng app là mất (bản dịch có thể chứa tài liệu mật). */
import { useSyncExternalStore } from 'react'
import type { GlossaryEntry } from '../../../shared/glossary'
import type { TranslateLang } from '../../../shared/translate'

export interface TranslateEntry {
  id: number
  /** `selection`: đoạn bôi đen; `section`: một mục / một bảng (Markdown, hiện dạng đã render) */
  kind: 'selection' | 'section'
  /** Tên mục / bảng, hoặc '' với đoạn bôi đen */
  label: string
  source: string
  from: TranslateLang
  to: TranslateLang
  text: string
  terms: GlossaryEntry[]
  at: number
}

export const TRANSLATE_HISTORY_MAX = 50

let entries: TranslateEntry[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((l) => l())

/** Thêm bản dịch lên đầu; cùng nguồn + đích thì thay bản cũ (dịch lại không nhân đôi dòng). */
export function addTranslation(e: Omit<TranslateEntry, 'id' | 'at'>): void {
  const rest = entries.filter((x) => !(x.source === e.source && x.to === e.to))
  entries = [{ ...e, id: ++seq, at: Date.now() }, ...rest].slice(0, TRANSLATE_HISTORY_MAX)
  emit()
}

export function clearTranslations(): void {
  entries = []
  emit()
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const getTranslations = (): TranslateEntry[] => entries

export const useTranslations = (): TranslateEntry[] => useSyncExternalStore(subscribe, getTranslations)
