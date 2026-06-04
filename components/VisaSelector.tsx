'use client'

import { useEffect, useState } from 'react'
import type { VisaStatus } from '@/lib/database.types'

interface VisaSelectorProps {
  value: VisaStatus | null
  onChange: (visa: VisaStatus | null) => void
  expiry: string | null
  onExpiryChange: (date: string | null) => void
}

const VISA_OPTIONS: { value: VisaStatus; label: string; description: string; emoji: string }[] = [
  { value: 'working_holiday', label: '워킹홀리데이', description: 'IEC / WHV 비자', emoji: '🧳' },
  { value: 'co_op', label: '코업 (Co-op)', description: '협동교육 비자', emoji: '🎓' },
  { value: 'student', label: '학생비자', description: '대학교 / 컬리지', emoji: '📚' },
  { value: 'post_grad_work', label: 'PGWP', description: '졸업 후 취업비자', emoji: '💼' },
  { value: 'permanent_resident', label: '영주권', description: 'PR 카드 보유', emoji: '🏠' },
  { value: 'citizen', label: '시민권', description: '캐나다 시민', emoji: '🍁' },
  { value: 'other', label: '기타', description: '그 외 비자', emoji: '📄' },
]

type ExpiryWarning =
  | { kind: 'expired' }
  | { kind: 'soon'; days: number }

/**
 * VisaSelector
 *
 * 구직자 프로필의 비자 상태 + 만료일 선택 컴포넌트.
 * 카드 형태의 라디오 버튼으로, 각 옵션이 비자 종류와 설명을 함께 표시한다.
 * 만료일은 선택한 비자에 따라 입력 강제도가 다르지만,
 * 모든 비자에 대해 입력 가능하도록 한다 (PR/시민권은 선택사항).
 */
export default function VisaSelector({
  value,
  onChange,
  expiry,
  onExpiryChange,
}: VisaSelectorProps) {
  const isExemptFromExpiry = value === 'permanent_resident' || value === 'citizen'

  // 매 분마다 now를 갱신 → 만료일 경고가 실시간으로 갱신됨
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // now는 항상 number (lazy init + interval 갱신)
  const warning: ExpiryWarning | null = (() => {
    if (!expiry) return null
    const expiryTime = new Date(expiry).getTime()
    if (Number.isNaN(expiryTime)) return null
    if (expiryTime < now) return { kind: 'expired' }
    const days = Math.floor((expiryTime - now) / (1000 * 60 * 60 * 24))
    if (days > 0 && days < 30) return { kind: 'soon', days }
    return null
  })()

  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-gray-800">
        비자 상태
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {VISA_OPTIONS.map(opt => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(selected ? null : opt.value)}
              aria-pressed={selected}
              className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${
                selected
                  ? 'border-orange-300 bg-orange-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-lg">{opt.emoji}</span>
                {selected && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                    ✓
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-gray-900">{opt.label}</p>
              <p className="text-[11px] text-gray-500">{opt.description}</p>
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-semibold text-gray-800">
          비자 만료일
          {isExemptFromExpiry && (
            <span className="ml-1.5 text-[11px] font-normal text-gray-400">
              (해당 없음, 선택사항)
            </span>
          )}
        </label>
        <input
          type="date"
          value={expiry ?? ''}
          onChange={e => onExpiryChange(e.target.value || null)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
        />
        {warning?.kind === 'expired' && (
          <p className="mt-1.5 text-xs text-red-500">
            ⚠️ 비자가 이미 만료되었어요. 빠른 시일 내에 갱신이 필요해요.
          </p>
        )}
        {warning && warning.kind === 'soon' && (
          <p className="mt-1.5 text-xs text-amber-600">
            ⏰ {warning.days}일 후 만료 예정이에요. 갱신 일정을 미리 준비해주세요.
          </p>
        )}
      </div>
    </div>
  )
}
