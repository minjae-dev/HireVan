'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

export interface EventPopupProps {
  title: string
  description?: string
  imageSrc: string
  imageAlt?: string
  buttonText: string
  onButtonClick?: () => void
  onClose?: () => void
  storageKey?: string
  hideDurationDays?: number
  hideCheckboxLabel?: string | false
  maxWidthClassName?: string
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

function parseHiddenUntil(storedValue: string | null): number | null {
  if (!storedValue) return null
  try {
    const parsed = JSON.parse(storedValue) as { until?: number }
    if (typeof parsed.until !== 'number') return null
    return parsed.until
  } catch {
    return null
  }
}

const subscribers = new Map<string, Set<() => void>>()

function getSubscribers(key: string): Set<() => void> {
  let set = subscribers.get(key)
  if (!set) {
    set = new Set()
    subscribers.set(key, set)
  }
  return set
}

function notify(key: string) {
  const set = subscribers.get(key)
  if (!set) return
  set.forEach(fn => fn())
}

function useDismissState(storageKey: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const set = getSubscribers(storageKey)
      set.add(cb)
      const onStorage = (e: StorageEvent) => {
        if (e.key === storageKey) cb()
      }
      window.addEventListener('storage', onStorage)
      return () => {
        set.delete(cb)
        window.removeEventListener('storage', onStorage)
      }
    },
    [storageKey],
  )

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return false
    try {
      const stored = window.localStorage.getItem(storageKey)
      const until = parseHiddenUntil(stored)
      if (until === null) return true
      return until <= Date.now()
    } catch {
      return true
    }
  }, [storageKey])

  const getServerSnapshot = useCallback(() => false, [])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export default function EventPopup({
  title,
  description,
  imageSrc,
  imageAlt = '',
  buttonText,
  onButtonClick,
  onClose,
  storageKey = 'event-popup:dismissed',
  hideDurationDays = 7,
  hideCheckboxLabel = '1주일간 보지 않기',
  maxWidthClassName = 'max-w-sm',
}: EventPopupProps) {
  const shouldShow = useDismissState(storageKey)
  const [visible, setVisible] = useState<boolean>(shouldShow)
  const [hideForAWhile, setHideForAWhile] = useState(false)
console.log('EventPopup render, visible:', visible)

  useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  if (shouldShow) setVisible(true)
  }, [shouldShow])


  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  useEffect(() => {
    if (!visible) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [visible])

  // 그냥 닫기 — localStorage 저장 없음
  function handleClose() {
   console.log('X clicked')
  setVisible(false)
    onClose?.()
  }

  function handleButtonClick() {
    onButtonClick?.()
    handleClose()
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-popup-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      {/* Backdrop — 그냥 닫기 */}
      <button
        type="button"
        aria-label="닫기"
        onClick={handleClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Card */}
      <div
        className={[
          'relative z-10 w-full bg-white shadow-2xl',
          'rounded-2xl overflow-hidden',
          'animate-fade-in-up',
          maxWidthClassName,
        ].join(' ')}
        onClick={e => e.stopPropagation()}
      >
        {/* X 버튼 — 그냥 닫기 */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="닫기"
          className="absolute right-3 top-3 z-20 inline-flex items-center justify-center w-8 h-8 rounded-full bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M6 6 L18 18 M6 18 L18 6" />
          </svg>
        </button>

        {/* Image */}
        <div className="relative w-full bg-gray-50">
          <img
            src={imageSrc}
            alt={imageAlt || title}
            className="w-full h-auto object-contain"
            loading="lazy"
            decoding="async"
          />
        </div>

        {/* Text + Actions */}
        <div className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
          <h2
            id="event-popup-title"
            className="text-lg sm:text-xl font-extrabold text-gray-900 leading-snug"
          >
            {title}
          </h2>

          {description && (
            <p className="mt-1.5 text-sm sm:text-[15px] text-gray-600 leading-relaxed whitespace-pre-line">
              {description}
            </p>
          )}

          <button
            type="button"
            onClick={handleButtonClick}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 py-3 text-sm sm:text-base font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg"
          >
            {buttonText}
          </button>

          {/* 1주일간 보지 않기 — 체크 시점에 바로 localStorage 저장 */}
          {hideCheckboxLabel !== false && (
            <label className="mt-3 flex items-center justify-center gap-2 cursor-pointer select-none text-xs sm:text-sm text-gray-500">
              <input
                type="checkbox"
                checked={hideForAWhile}
                onChange={e => {
                  setHideForAWhile(e.target.checked)
                  if (e.target.checked) {
                    try {
                      const until = Date.now() + hideDurationDays * DAY_IN_MS
                      window.localStorage.setItem(storageKey, JSON.stringify({ until }))
                      notify(storageKey)
                    } catch {}
                  } else {
                    window.localStorage.removeItem(storageKey)
                    notify(storageKey)
                  }
                }}
                className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
              />
              <span>{hideCheckboxLabel}</span>
            </label>
          )}
        </div>
      </div>
    </div>
  )
}