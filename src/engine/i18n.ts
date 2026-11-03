import ar from '../i18n/ar.json'
import en from '../i18n/en.json'
import type { Locale } from './save'

export type Dictionary = Record<string, string>
const DICTIONARIES: Record<Locale, Dictionary> = { en, ar }

/** Browser language list -> supported locale (any ar* -> Arabic, else English). */
export function detectLocale(languages: readonly string[] | undefined): Locale {
  const first = (languages ?? []).find(Boolean) ?? ''
  return first.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}
/** A saved player choice always wins over browser detection. */
export function resolveLocale(saved: Locale | '', languages: readonly string[] | undefined): Locale {
  return saved === 'en' || saved === 'ar' ? saved : detectLocale(languages)
}
export const isRtl = (locale: Locale) => locale === 'ar'

export class I18n {
  locale: Locale
  private listeners = new Set<(locale: Locale) => void>()
  constructor(locale: Locale) {
    this.locale = locale
    this.applyDocument()
  }
  private applyDocument(): void {
    if (typeof document === 'undefined') return
    document.documentElement.lang = this.locale
    document.documentElement.dir = isRtl(this.locale) ? 'rtl' : 'ltr'
  }
  get rtl(): boolean {
    return isRtl(this.locale)
  }
  /** Look up `key`, replacing `{name}` placeholders. Missing keys fall back to English, then the key. */
  t(key: string, vars: Record<string, string | number> = {}): string {
    const text = DICTIONARIES[this.locale][key] ?? DICTIONARIES.en[key] ?? key
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
  }
  set(locale: Locale): void {
    if (locale === this.locale) return
    this.locale = locale
    this.applyDocument()
    for (const fn of this.listeners) fn(locale)
  }
  onChange(fn: (locale: Locale) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}
export const DICTIONARY_KEYS = { en: Object.keys(en), ar: Object.keys(ar) }
