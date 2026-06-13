'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

type Language = 'ko' | 'en'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextType | null>(null)

function resolveKey(obj: Record<string, unknown>, key: string): string | null {
  const parts = key.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : null
}

const localeCache: { ko: Record<string, unknown> | null; en: Record<string, unknown> | null } = {
  ko: null,
  en: null,
}

async function loadLocale(lang: Language): Promise<Record<string, unknown>> {
  if (localeCache[lang]) return localeCache[lang]!
  const mod = lang === 'ko' ? await import('@/locales/ko.json') : await import('@/locales/en.json')
  const data = mod.default || mod
  localeCache[lang] = data as Record<string, unknown>
  return localeCache[lang]!
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ko')
  const [localeData, setLocaleData] = useState<Record<string, unknown> | null>(null)
  const initialized = useRef(false)

  // Initialize from localStorage once on client (synchronizing with external system)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    try {
      const stored = localStorage.getItem('hv:language')
      if (stored === 'en' || stored === 'ko') {
        setLanguageState(stored)
      }
    } catch {}
  }, [])

  // Load locale data when language changes
  useEffect(() => {
    loadLocale(language).then((data) => {
      setLocaleData(data)
    })
  }, [language])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    try {
      localStorage.setItem('hv:language', lang)
    } catch {}
  }, [])

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'ko' ? 'en' : 'ko')
  }, [language, setLanguage])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      if (!localeData) return key
      let value = resolveKey(localeData, key)
      if (!value) return key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(`{${k}}`, String(v))
        }
      }
      return value
    },
    [localeData],
  )

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextType {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}