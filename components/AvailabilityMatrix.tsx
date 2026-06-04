'use client'

import { useState } from 'react'
import type { AvailabilityMatrix as AvailabilityMatrixType, ShiftSlot, Weekday } from '@/lib/database.types'

interface AvailabilityMatrixProps {
  value: AvailabilityMatrixType
  onChange: (next: AvailabilityMatrixType) => void
}

const DAYS: { key: Weekday; label: string }[] = [
  { key: 'monday', label: '월' },
  { key: 'tuesday', label: '화' },
  { key: 'wednesday', label: '수' },
  { key: 'thursday', label: '목' },
  { key: 'friday', label: '금' },
  { key: 'saturday', label: '토' },
  { key: 'sunday', label: '일' },
]

const SHIFTS: { key: ShiftSlot; label: string; emoji: string }[] = [
  { key: 'morning', label: '아침', emoji: '🌅' },
  { key: 'afternoon', label: '오후', emoji: '☀️' },
  { key: 'evening', label: '저녁', emoji: '🌆' },
  { key: 'night', label: '심야', emoji: '🌙' },
]

/**
 * AvailabilityMatrix
 *
 * 구직자 프로필에서 사용할 가용 시간 매트릭스 입력 컴포넌트.
 *
 * ## UX 의도
 * - 7×4 = 28 칸 매트릭스를 직접 클릭하는 대신,
 *   "선호 근무 형태 → 요일별 시프트 토글" 2-step 으로 입력 피로도 최소화.
 * - "불가능한 요일" 도 한 번에 끌 수 있다 (체크된 시프트 = 0 이면 자동으로 off 처리).
 *
 * ## value shape
 * ```ts
 * {
 *   monday: ['morning', 'afternoon'],
 *   thursday: ['evening'],
 *   ...
 * }
 * ```
 */
export default function AvailabilityMatrix({ value, onChange }: AvailabilityMatrixProps) {
  const [mode, setMode] = useState<'select' | 'remove'>('select')

  const toggle = (day: Weekday, shift: ShiftSlot) => {
    const current = value[day] ?? []
    if (mode === 'select') {
      if (current.includes(shift)) {
        onChange({ ...value, [day]: current.filter(s => s !== shift) })
      } else {
        onChange({ ...value, [day]: [...current, shift] })
      }
    } else {
      // 'remove' 모드: 클릭 시 해당 슬롯을 제거
      onChange({ ...value, [day]: current.filter(s => s !== shift) })
    }
  }

  const clearDay = (day: Weekday) => {
    const next = { ...value }
    delete next[day]
    onChange(next)
  }

  // 통계
  const totalSlots = Object.values(value).reduce(
    (acc, slots) => acc + (slots?.length ?? 0),
    0,
  )
  const activeDays = DAYS.filter(d => (value[d.key]?.length ?? 0) > 0).length

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">근무 가능 시간</p>
          <p className="mt-0.5 text-xs text-gray-500">
            현재 {activeDays}일 / 총 {totalSlots}개 시프트 등록됨
          </p>
        </div>
        <div className="flex rounded-full bg-gray-100 p-0.5 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setMode('select')}
            className={`rounded-full px-3 py-1 transition-colors ${
              mode === 'select' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            + 추가
          </button>
          <button
            type="button"
            onClick={() => setMode('remove')}
            className={`rounded-full px-3 py-1 transition-colors ${
              mode === 'remove' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            − 제거
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {/* Header */}
        <div className="grid grid-cols-[60px_repeat(4,1fr)] border-b border-gray-100 bg-gray-50 text-[10px] font-semibold text-gray-500">
          <div className="p-2" />
          {SHIFTS.map(s => (
            <div key={s.key} className="p-2 text-center">
              <div className="text-base leading-none">{s.emoji}</div>
              <div className="mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Rows */}
        {DAYS.map(day => {
          const slots = value[day.key] ?? []
          return (
            <div
              key={day.key}
              className="grid grid-cols-[60px_repeat(4,1fr)] items-center border-b border-gray-50 last:border-b-0"
            >
              <div className="border-r border-gray-50 p-2 text-center">
                <p className="text-sm font-bold text-gray-700">{day.label}</p>
                {slots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearDay(day.key)}
                    aria-label={`${day.label}요일 비우기`}
                    className="mt-1 text-[10px] text-gray-400 underline-offset-2 hover:text-red-500 hover:underline"
                  >
                    비우기
                  </button>
                )}
              </div>
              {SHIFTS.map(shift => {
                const active = slots.includes(shift.key)
                return (
                  <button
                    type="button"
                    key={shift.key}
                    onClick={() => toggle(day.key, shift.key)}
                    aria-pressed={active}
                    className={`m-1 aspect-square rounded-xl border text-[10px] font-semibold transition-all active:scale-95 ${
                      active
                        ? mode === 'select'
                          ? 'border-orange-300 bg-orange-100 text-orange-700 shadow-sm'
                          : 'border-red-300 bg-red-100 text-red-700 shadow-sm'
                        : 'border-gray-100 bg-gray-50 text-gray-300 hover:border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {active ? (mode === 'remove' ? '✕' : '●') : '+'}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <p className="mt-2 text-[11px] text-gray-500">
        💡 {mode === 'select'
          ? '추가할 칸을 탭하세요. 한 요일에 여러 시프트를 등록할 수 있어요.'
          : '제거할 칸을 탭하거나, 요일 옆 "비우기"로 한 번에 비울 수 있어요.'}
      </p>
    </div>
  )
}
