export type Locale = 'en' | 'ja'

// Keep this preference separate from the S3 Data Catalog application.
const LOCALE_STORAGE_KEY = 'mmt.locale'
const listeners = new Set<() => void>()

function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ja'
}

// Shown when the browser reports no language or only languages the UI does not support.
const FALLBACK_LOCALE: Locale = 'en'

// A saved choice wins; otherwise the browser's preferred languages are checked in order.
export function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    // Private browsing can disable storage; language selection still works.
  }
  return browserLocale() ?? FALLBACK_LOCALE
}

function browserLocale(): Locale | null {
  if (typeof navigator === 'undefined') return null
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    const supported = language?.split('-')[0]
    if (isLocale(supported)) return supported
  }
  return null
}

let locale = initialLocale()

export function getLocale(): Locale {
  return locale
}

// The tag Intl formats (dates, numbers, lists) use for each display language.
export const INTL_LOCALES: Readonly<Record<Locale, string>> = { ja: 'ja-JP', en: 'en-US' }

export function getIntlLocale(): string {
  return INTL_LOCALES[locale]
}

export function initializeLocale(): void {
  document.documentElement.lang = locale
}

function updateLocale(next: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = next
  if (next === locale) return
  locale = next
  listeners.forEach(listener => listener())
}

export function setLocale(next: Locale): void {
  updateLocale(next)
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next)
  } catch {
    // The in-memory choice remains usable when storage is unavailable.
  }
}

function syncLocale(event: StorageEvent): void {
  if (event.key !== LOCALE_STORAGE_KEY && event.key !== null) return
  updateLocale(initialLocale())
}

export function subscribeLocale(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('storage', syncLocale)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', syncLocale)
    }
  }
}
