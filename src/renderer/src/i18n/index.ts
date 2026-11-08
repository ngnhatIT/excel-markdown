/* Đa ngôn ngữ giao diện (vi / en / ja), không thư viện: từ điển phẳng + store nhỏ cho React. */
import { useSyncExternalStore } from 'react'
import { vi } from './vi'
import { en } from './en'
import { ja } from './ja'
import { compareEn, compareJa, compareVi } from './compare'
import { translateEn, translateJa, translateVi } from './translate'

export type Lang = 'vi' | 'en' | 'ja'
/** Khóa của từ điển chính (vi.ts); en.ts / ja.ts phải đủ các khóa này. */
export type Dict = Record<keyof typeof vi, string>
export type TKey = keyof typeof vi | keyof typeof compareVi | keyof typeof translateVi
export type TFn = (key: TKey, params?: Record<string, string | number>) => string

export const LANGS: readonly Lang[] = ['vi', 'en', 'ja']
type FullDict = Record<TKey, string>
const VI: FullDict = { ...vi, ...compareVi, ...translateVi }
const DICTS: Record<Lang, FullDict> = { vi: VI, en: { ...en, ...compareEn, ...translateEn }, ja: { ...ja, ...compareJa, ...translateJa } }

/** Ngôn ngữ mặc định theo hệ điều hành (lần đầu chạy, chưa lưu lựa chọn). */
export function detectLang(locale = typeof navigator === 'undefined' ? 'vi' : navigator.language): Lang {
  const l = locale.toLowerCase()
  return l.startsWith('ja') ? 'ja' : l.startsWith('vi') ? 'vi' : l.startsWith('en') ? 'en' : 'vi'
}

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v)

let current: Lang = detectLang()
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  for (const f of listeners) f()
}

/** Dịch `key` theo ngôn ngữ `lang`; thay {tham số}. Thiếu bản dịch thì lấy tiếng Việt. */
export function translate(lang: Lang, key: TKey, params?: Record<string, string | number>): string {
  const s = DICTS[lang][key] ?? VI[key] ?? key
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s
}

/** Dùng ngoài React (toast, hàm tiện ích): theo ngôn ngữ hiện tại. */
export const t: TFn = (key, params) => translate(current, key, params)

const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Ngôn ngữ hiện tại; component render lại khi đổi. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang)
}

/** Hàm dịch gắn với ngôn ngữ hiện tại; component render lại khi đổi ngôn ngữ. */
export function useT(): TFn {
  const lang = useLang()
  return (key, params) => translate(lang, key, params)
}
