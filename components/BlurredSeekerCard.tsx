'use client'

import type { PublicProfile } from '@/lib/database.types'

interface BlurredSeekerCardProps {
  /**
   * 카드로 표시할 구직자 정보. 일부 필드는 canViewForFree=false 일 때
   * null 로 마스킹되어 들어올 수 있다 (profiles_public 뷰 정책 그대로).
   */
  seeker: Pick<
    PublicProfile,
    | 'id'
    | 'name'
    | 'avatar_url'
    | 'bio'
    | 'neighborhood'
    | 'has_sir'
    | 'has_foodsafe'
    | 'english_level'
    | 'visa_status'
    | 'visa_type'
    | 'visa_expiry'
    | 'availability'
  >
  /** 카드 클릭 시 호출 — 상위 컴포넌트에서 useSeekerAccess().open() */
  onUnlockClick?: () => void
  /** 무료 열람 가능 여부 (본인 / PRO / 이미 본 구직자) */
  canViewForFree: boolean
  /** 남은 크레딧 (PRO 사용자는 의미 없음, 표시하지 않음) */
  creditsRemaining?: number
  /** 사용 가능한가 (false면 카드 비활성화, CTA 숨김) */
  interactive?: boolean
  isProEmployer: boolean; // ★ 추가
}

/**
 * BlurredSeekerCard
 *
 * 구직자 카드 컴포넌트.
 * - 상단: 이름, 사진, 한줄 소개 (항상 보임)
 * - 하단: 비자, 가용시간, 자격증, 거주지 → canViewForFree=false 면 블러 처리
 * - 카드 전체가 버튼. 클릭하면 onUnlockClick 호출
 *   → 상위에서 useSeekerAccess().open() 후 ProUpsellModal 분기
 */
export default function BlurredSeekerCard({
  seeker,
  onUnlockClick,
  canViewForFree,
  creditsRemaining,
  interactive = true,
  isProEmployer, // ★ 추가
}: BlurredSeekerCardProps) {
  const displayName = seeker.name || '익명 구직자'
  const displayAvatar = seeker.avatar_url
  const hasAvailability =
    !!seeker.availability && Object.keys(seeker.availability).length > 0

  const content = (
    <div
      className={`block w-full overflow-hidden rounded-3xl border border-gray-100 bg-white text-left shadow-sm transition-all ${
        interactive ? 'hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md active:scale-[0.99]' : ''
      }`}
    >
      {/* Header — 항상 보임 */}
      <div className="flex items-start gap-4 p-5">
        <div
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {displayAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayAvatar}
              alt={displayName}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            displayName[0] ?? '?'
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-base font-bold text-gray-900">{displayName}</h3>
            {creditsRemaining !== undefined && !canViewForFree && (
              <span className="flex-shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
                크레딧 {creditsRemaining}개
              </span>
            )}
          </div>
          {seeker.bio && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-600">
              {seeker.bio}
            </p>
          )}
        </div>
      </div>

      {/* Premium Fields — canViewForFree=false 면 블러 */}
      <div className="relative border-t border-gray-50 bg-gray-50/40 px-5 py-4">
        <div
          className={
            canViewForFree
              ? 'grid grid-cols-2 gap-3 text-xs'
              : 'pointer-events-none select-none space-y-2 blur-[6px]'
          }
        >
          {/* Visa */}
          <Field
            label="비자"
            value={
              seeker.visa_status
                ? VISA_LABEL[seeker.visa_status] || seeker.visa_type || '—'
                : seeker.visa_type || '—'
            }
          />
          <Field
            label="비자 만료"
            value={
              seeker.visa_expiry
                ? new Date(seeker.visa_expiry).toLocaleDateString('ko-KR')
                : '—'
            }
          />
          <Field
            label="거주 구역"
            value={seeker.neighborhood ?? '—'}
          />
          <Field
            label="영어"
            value={seeker.english_level ? ENGLISH_LABEL[seeker.english_level] : '—'}
          />

          {/* Certificates — wide */}
          <div className="col-span-2 flex flex-wrap gap-1.5 pt-1">
            <CertChip enabled={!!seeker.has_sir} label="🍷 Serving It Right" />
            <CertChip enabled={!!seeker.has_foodsafe} label="🥗 FoodSafe" />
          </div>

          {/* Availability */}
          <div className="col-span-2 pt-1">
            <p className="mb-1.5 text-[11px] font-medium text-gray-500">근무 가능 시간</p>
            {hasAvailability ? (
              <div className="flex flex-wrap gap-1">
                {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map(day => {
                  const slots = seeker.availability?.[day]
                  if (!slots || slots.length === 0) return null
                  return (
                    <span
                      key={day}
                      className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200"
                    >
                      {DAY_LABEL[day]} · {slots.map(s => SHIFT_LABEL[s]).join('/')}
                    </span>
                  )
                })}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400">미설정</p>
            )}
          </div>
        </div>

        {/* Blur overlay (CTA) — canViewForFree=false 일 때만 */}
{!canViewForFree && interactive && (
      <div 
        onClick={(e) => {
          e.stopPropagation();
          onUnlockClick?.();
        }} 
        className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md z-10 cursor-pointer rounded-xl"
      >
        <p className="text-white font-semibold text-base">
          {isProEmployer ? '프로필 상세 열람 (PRO 무료)' : '프로필 상세 열람'}
        </p>
        {!isProEmployer && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500 text-white mt-2">
            ⚡ 1 크레딧 소모
          </span>
        )}
      </div>
    )}
      </div>
    </div>
  )

  if (!interactive) {
    return content
  }

  return (
    <button
      type="button"
      onClick={onUnlockClick}
      className="group block w-full text-left"
    >
      {content}
    </button>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-400">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-gray-800">{value}</p>
    </div>
  )
}

function CertChip({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        enabled
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-400 line-through'
      }`}
    >
      {label}
    </span>
  )
}

const VISA_LABEL: Record<string, string> = {
  working_holiday: '워킹홀리데이',
  co_op: '코업',
  student: '학생비자',
  post_grad_work: 'PGWP',
  permanent_resident: '영주권',
  citizen: '시민권',
  other: '기타',
}

const ENGLISH_LABEL: Record<string, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
  native: '원어민',
}

const DAY_LABEL: Record<string, string> = {
  monday: '월',
  tuesday: '화',
  wednesday: '수',
  thursday: '목',
  friday: '금',
  saturday: '토',
  sunday: '일',
}

const SHIFT_LABEL: Record<string, string> = {
  morning: '아침',
  afternoon: '오후',
  evening: '저녁',
  night: '밤',
}
