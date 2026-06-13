'use client'

import EventPopup from '@/components/EventPopup'
import { useLanguage } from '@/context/LanguageContext'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/* ─────────────────────────────────────────────
 *  Types & Config
 * ───────────────────────────────────────────── */
type UserType = 'seeker' | 'employer'

type RoleConfig = {
  id: UserType
  labelKey: string
  emoji: string
  shortDescKey: string
  longHeadlineKey: string
  longDescKey: string
  steps: { num: string; titleKey: string; descKey: string }[]
  ctaKey: string
  accent: string
  accentSoft: string
  ringClass: string
  imagePath: string
}

function getRoleConfigs(t: (key: string) => string): Record<UserType, RoleConfig> {
  return {
    seeker: {
      id: 'seeker',
      labelKey: t('landing.seeker_card_title'),
      emoji: '🧑‍🍳',
      shortDescKey: t('landing.seeker_card_desc'),
      longHeadlineKey: t('landing.seeker_headline'),
      longDescKey: t('landing.seeker_long_desc'),
      steps: [
        { num: '01', titleKey: t('landing.seeker_step1_title'), descKey: t('landing.seeker_step1_desc') },
        { num: '02', titleKey: t('landing.seeker_step2_title'), descKey: t('landing.seeker_step2_desc') },
        { num: '03', titleKey: t('landing.seeker_step3_title'), descKey: t('landing.seeker_step3_desc') },
      ],
      ctaKey: t('landing.seeker_cta'),
      accent: '#FF6B35',
      accentSoft: '#FFF0EB',
      ringClass: 'ring-orange-400',
      imagePath: '/guide-seeker.gif',
    },
    employer: {
      id: 'employer',
      labelKey: t('landing.employer_card_title'),
      emoji: '🏪',
      shortDescKey: t('landing.employer_card_desc'),
      longHeadlineKey: t('landing.employer_headline'),
      longDescKey: t('landing.employer_long_desc'),
      steps: [
        { num: '01', titleKey: t('landing.employer_step1_title'), descKey: t('landing.employer_step1_desc') },
        { num: '02', titleKey: t('landing.employer_step2_title'), descKey: t('landing.employer_step2_desc') },
        { num: '03', titleKey: t('landing.employer_step3_title'), descKey: t('landing.employer_step3_desc') },
      ],
      ctaKey: t('landing.employer_cta'),
      accent: '#2563EB',
      accentSoft: '#EFF6FF',
      ringClass: 'ring-blue-400',
      imagePath: '/guide-employer.gif',
    },
  }
}

/* ─────────────────────────────────────────────
 *  Page Component
 * ───────────────────────────────────────────── */
export default function LandingPage() {
  const [userType, setUserType] = useState<UserType | null>(null)
  const { t } = useLanguage()
  const router = useRouter()
  const ROLE_CONFIG = getRoleConfigs(t)

  const handleSelect = (type: UserType) => {
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
          {t('landing.hero_badge')}
        </span>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight">
          {t('landing.hero_title_1')}
          <br />
          <span style={{ color: 'var(--brand)' }}>{t('landing.hero_title_2')}</span>
        </h1>

        <p className="mt-4 text-sm sm:text-base text-gray-500 max-w-md mx-auto leading-relaxed">
          {t('landing.hero_desc')}
        </p>
      </section>

      {/* ───── Selection Section ─────────────────── */}
      <section className="pb-6 sm:pb-8 max-w-4xl mx-auto">
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
                  {role.labelKey}
                </h3>
                <p className="text-sm text-gray-500">{role.shortDescKey}</p>

                <div
                  className={[
                    'mt-4 inline-flex items-center gap-1 text-sm font-semibold transition-opacity',
                    isSelected ? 'opacity-100' : 'opacity-0',
                  ].join(' ')}
                  style={{ color: role.accent }}
                  aria-hidden={!isSelected}
                >
                  {t('landing.details_below')}
                  <span className="text-base">↓</span>
                </div>
              </button>
            )
          })}
        </div>

        {userType === null && (
          <p className="text-center text-xs text-gray-400 mt-4 animate-fade-in">
            {t('landing.select_prompt')}
          </p>
        )}
      </section>

      {/* ───── Dynamic Content Section ──────────── */}
      {userType && (
        <DynamicContent
          key={userType}
          config={ROLE_CONFIG[userType]}
          onStart={handleStart}
          t={t}
        />
      )}

      {/* ───── Footer ───────────────────────────── */}
      <footer className="mt-16 pb-6 text-center text-xs text-gray-400">
        {t('landing.footer')}
      </footer>

      {/* ───── Event Popup ──── */}
      <EventPopup
        title={t('event_popup.first_job_title')}
        description={t('event_popup.first_job_desc')}
        imageSrc="/event/first-job-free.png"
        imageAlt={t('event_popup.first_job_title')}
        buttonText={t('event_popup.first_job_button')}
        storageKey="event:first-job-free:dismissed"
        hideCheckboxLabel={t('event_popup.hide_week')}
        onButtonClick={() => {
          window.location.href = '/employer/jobs/new'
        }}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────
 *  DynamicContent
 * ───────────────────────────────────────────── */
function DynamicContent({
  config,
  onStart,
  t,
}: {
  config: RoleConfig
  onStart: (type: UserType) => void
  t: (key: string) => string
}) {
  return (
    <section className="mt-2 animate-fade-in-up">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="relative w-full h-40">
          <img
            src={config.imagePath}
            alt={`${config.labelKey} guide`}
            className="w-full h-full object-contain p-2"
          />

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

        <div className="p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            {config.longHeadlineKey}
          </h2>
          <p className="text-sm sm:text-base text-gray-500 leading-relaxed mb-6">
            {config.longDescKey}
          </p>

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
                    {step.titleKey}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                    {step.descKey}
                  </p>
                </div>
              </li>
            ))}
          </ol>

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
              {config.ctaKey}
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

            <p className="text-xs text-gray-400 mt-4">
              {t('landing.already_member')}{' '}
              <button
                type="button"
                onClick={() => onStart(config.id)}
                className="font-semibold hover:underline"
                style={{ color: config.accent }}
              >
                {t('landing.login_link')}
              </button>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}