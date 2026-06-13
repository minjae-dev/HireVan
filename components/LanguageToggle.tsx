'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'

export default function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage()
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react/hook-use-state -- client-side mount detection
    setIsClient(true)
  }, [])

  if (!isClient) return null

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className="flex-shrink-0 w-9 h-9 rounded-full text-xs font-bold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 flex items-center justify-center"
      aria-label={language === 'ko' ? 'Switch to English' : '한국어로 전환'}
    >
      {language === 'ko' ? 'EN' : '한'}
    </button>
  )
}