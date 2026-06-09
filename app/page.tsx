'use client'

import EventPopup from '@/components/EventPopup'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/* ─────────────────────────────────────────────
 *  Types & Config
 * ───────────────────────────────────────────── */
type UserType = 'seeker' | 'employer'

type RoleConfig = {
  id: UserType
  label: string
  emoji: string
  shortDesc: string
  longHeadline: string
  longDesc: string
  steps: { num: string; title: string; desc: string }[]
  cta: string
  // 색상 토큰 (Tailwind class 일부 + 인라인 style 혼용)
  accent: string // hex
  accentSoft: string // hex (연한 배경)
  ringClass: string
  imagePath: string // public/ 안의 가상 경로
}

const ROLE_CONFIG: Record<UserType, RoleConfig> = {
  seeker: {
    id: 'seeker',
    label: '구직자로 시작하기',
    emoji: '🧑‍🍳',
    shortDesc: '일자리를 찾고 있어요',
    longHeadline: '맞춤 공고를 1분 만에 받아보세요',
    longDesc:
      '간단한 프로필과 가능한 시간만 입력하면, 우리 동네 사장님들이 올린 공고 중 딱 맞는 곳을 추천해 드려요.',
    steps: [
      { num: '01', title: '프로필 등록', desc: '이력·자격증·가능 시간 입력' },
      { num: '02', title: '맞춤 공고 확인', desc: '내 조건에 딱 맞는 일거리 추천' },
      { num: '03', title: '원클릭 지원', desc: '마음에 드면 바로 대화 시작' },
    ],
    cta: '구직자로 시작하기',
    accent: '#FF6B35',
    accentSoft: '#FFF0EB',
    ringClass: 'ring-orange-400',
    imagePath: '/guide-seeker.gif',
  },
  employer: {
    id: 'employer',
    label: '채용자로 시작하기',
    emoji: '🏪',
    shortDesc: '인력을 구인중이에요',
    longHeadline: '검증된 구직자와 빠르게 연결돼요',
    longDesc:
      '사장님이 원하던 조건(요일·시간·언어 등)을 입력하면, 그 조건에 부합하는 구직자들께 먼저 노출돼요.',
    steps: [
      { num: '01', title: '가게 정보 등록', desc: '매장명 · 업종 · 위치 입력' },
      { num: '02', title: '구인글 작성', desc: '근무 조건과 원하는 인원 설정' },
      { num: '03', title: '지원자 채팅', desc: '관심 있는 지원자와 즉시 대화' },
    ],
    cta: '채용자로 시작하기',
    accent: '#2563EB',
    accentSoft: '#EFF6FF',
    ringClass: 'ring-blue-400',
    imagePath: '/guide-employer.gif',
  },
}

/* ─────────────────────────────────────────────
 *  Page Component
 * ───────────────────────────────────────────── */
export default function LandingPage() {
  const [userType, setUserType] = useState<UserType | null>(null)
  const router = useRouter()

  const handleSelect = (type: UserType) => {
    // 같은 카드를 다시 누르면 접기, 다른 카드 누르면 전환
    setUserType(prev => (prev === type ? null : type))
  }

  const handleStart = (type: UserType) => {
    router.push(`/auth?type=${type}`)
  }

  return (
    <div className="animate-fade-in">
      {/* ───── Hero Section ─────────────────────── */}
      <section className="pt-8 pb-10 sm:pt-12 sm:pb-14 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-xs font-semibold mb-5 border border-orange-100">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
          밴쿠버 한인 구인구직 1분 매칭
        </span>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight">
          우리 동네 일자리,
          <br />
          <span style={{ color: 'var(--brand)' }}>1분 만에</span> 찾기
        </h1>

        <p className="mt-4 text-sm sm:text-base text-gray-500 max-w-md mx-auto leading-relaxed">
          워홀러 · 학생 · 주부까지, 우리 동네 사장님과 구직자를
          <br className="hidden sm:block" />
          가장 빠르게 연결해 드려요.
        </p>
      </section>

      {/* ───── Selection Section ─────────────────── */}
      <section className="pb-6 sm:pb-8 max-w-4xl mx-auto"> {/* 1. 여기서 전체 정렬 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(Object.values(ROLE_CONFIG) as RoleConfig[]).map(role => {
            const isSelected = userType === role.id
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => handleSelect(role.id)}
                aria-pressed={isSelected}
                className={[
                  'group relative text-left p-6 sm:p-7 rounded-2xl border-2 transition-all duration-200',
                  'bg-white shadow-sm hover:shadow-md active:scale-[0.98]',
                  isSelected
                    ? 'border-transparent shadow-xl scale-[1.01]'
                    : 'border-gray-100 hover:border-gray-200',
                ].join(' ')}
                style={
                  isSelected
                    ? {
                        backgroundColor: role.accentSoft,
                        boxShadow: `0 10px 30px -10px ${role.accent}55`,
                      }
                    : undefined
                }
              >
                {/* 선택됨 인디케이터 (우측 상단) */}
                {isSelected && (
                  <span
                    className="absolute top-3 right-3 inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold animate-fade-in"
                    style={{ backgroundColor: role.accent }}
                    aria-hidden
                  >
                    ✓
                  </span>
                )}

                <div
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl mb-4 transition-transform group-hover:scale-110"
                  style={{
                    backgroundColor: isSelected ? '#ffffff' : role.accentSoft,
                  }}
                >
                  {role.emoji}
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
                  {role.label}
                </h3>
                <p className="text-sm text-gray-500">{role.shortDesc}</p>

                {/* 선택됨 일 때만 보이는 화살표 */}
                <div
                  className={[
                    'mt-4 inline-flex items-center gap-1 text-sm font-semibold transition-opacity',
                    isSelected ? 'opacity-100' : 'opacity-0',
                  ].join(' ')}
                  style={{ color: role.accent }}
                  aria-hidden={!isSelected}
                >
                  아래에서 자세히 보기
                  <span className="text-base">↓</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* 미선택 시 안내 */}
        {userType === null && (
          <p className="text-center text-xs text-gray-400 mt-4 animate-fade-in">
            위에서 하나를 선택해 주세요
          </p>
        )}
      </section>

      {/* ───── Dynamic Content Section ──────────── */}
      {userType && (
        <DynamicContent
          key={userType /* 타입이 바뀔 때마다 마운트 → 애니메이션 재생 */}
          config={ROLE_CONFIG[userType]}
          onStart={handleStart}
        />
      )}

      {/* ───── Footer ───────────────────────────── */}
      <footer className="mt-16 pb-6 text-center text-xs text-gray-400">
        © HireVan · 밴쿠버 한인 커뮤니티를 위해
      </footer>

      {/* ───── Event Popup (첫 공고 무료 이벤트) ────
       *  - storageKey 를 이벤트별로 다르게 주면, 한 페이지에서
       *    여러 종류의 팝업을 동시에 운용할 수 있다.
       *  - "1주일간 보지 않기" 체크박스는 기본 노출.
       *    끄고 싶으면 hideCheckboxLabel={false} 로 주면 된다.
       */}
      <EventPopup
        title="🎉채용계정 신규 가입 이벤트🎉"
        description={`가입 후 첫 구인공고를 올리면 Pro 멤버십 1개월이 무료!\n이력서 요청 + 사전질문까지, 맞춤 지원자와 채팅하세요.`}
        imageSrc="/event/first-job-free.png"
        imageAlt="첫 공고 무료 이벤트 배너"
        buttonText="공고 올리고 Pro 받기"
        storageKey="event:first-job-free:dismissed"
        onButtonClick={() => {
          // CTA 클릭 시 페이지 내 안내 섹션으로 스크롤 등 원하는 동작
          window.location.href = '/employer/jobs/new'
        }}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────
 *  DynamicContent
 *  - 선택된 유형의 상세 가이드를 보여주는 섹션
 *  - 등장 시 `animate-fade-in-up` 으로 부드럽게 표시
 * ───────────────────────────────────────────── */
function DynamicContent({
  config,
  onStart,
}: {
  config: RoleConfig
  onStart: (type: UserType) => void
}) {
  return (
    <section className="mt-2 animate-fade-in-up">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {/* GIF placeholder */}
        {/* 수정된 부분: Placeholder div 대신 img 태그 사용 */}
        <div className="relative w-full h-40"> {/* h-48 → h-40 */}
          <img
            src={config.imagePath}
            alt={`${config.label} 가이드`}
            className="w-full h-full object-contain p-2"
          />

          {/* 우측 상단 태그는 그대로 유지 */}
          <span
            className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur text-[11px] font-semibold"
            style={{ color: config.accent }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: config.accent }}
            />
            HOW IT WORKS
          </span>
        </div>

        {/* 텍스트 콘텐츠 */}
        <div className="p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            {config.longHeadline}
          </h2>
          <p className="text-sm sm:text-base text-gray-500 leading-relaxed mb-6">
            {config.longDesc}
          </p>

          {/* 3-step 카드 */}
          <ol className="space-y-3 mb-7">
            {config.steps.map(step => (
              <li
                key={step.num}
                className="flex items-start gap-4 p-3.5 sm:p-4 rounded-2xl border border-gray-100 bg-gray-50/60"
              >
                <span
                  className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold text-white"
                  style={{ backgroundColor: config.accent }}
                >
                  {step.num}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm sm:text-base">
                    {step.title}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                    {step.desc}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* CTA */}
          <div className='flex flex-col items-center'>
            <button
              type="button"
              onClick={() => onStart(config.id)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 sm:px-7 py-3.5 rounded-2xl text-white font-semibold text-sm sm:text-base shadow-md hover:shadow-lg active:scale-[0.98] transition-all"
              style={{
                backgroundColor: config.accent,
                boxShadow: `0 8px 20px -8px ${config.accent}aa`,
              }}
            >
              {config.cta}
              <svg
                className="w-4 h-4"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

          {/* 로그인 페이지로의 보조 링크 */}
            <p className="text-xs text-gray-400 mt-4">
              이미 회원이신가요?{' '}
              <button
                type="button"
                onClick={() => onStart(config.id)}
                className="font-semibold hover:underline"
                style={{ color: config.accent }}
              >
                로그인하기
              </button>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
