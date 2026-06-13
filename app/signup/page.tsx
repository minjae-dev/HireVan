'use client'

import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Role = 'employer' | 'seeker'

const VISA_OPTIONS = ['워킹홀리데이', '학생비자', '취업비자', '영주권/시민권', '기타']

const NEIGHBORHOOD_OPTIONS = [
  { value: '5', label: '밴쿠버' },
  { value: '1', label: '버나비' },
  { value: '2', label: '코퀴틀람' },
  { value: '4', label: '써리' },
  { value: '11', label: '랭리' },
  { value: '14', label: '포트코퀴틀람' },
  { value: '6', label: '노스밴쿠버' },
  { value: '7', label: '웨스트밴쿠버' },
  { value: '3', label: '포트무디' },
  { value: '9', label: '리치몬드' },
  { value: '12', label: '델타' },
  { value: '15', label: '뉴웨스터민스터' },
  { value: '8', label: '메이플릿지' },
  { value: '10', label: '화이트락' },
  { value: '16', label: '핏메도우' },
  { value: '17', label: '재스퍼' },
  { value: '19', label: '아보츠포드' },
  { value: '20', label: '킬로나' },
  { value: '13', label: '기타' },
] as const

export default function SignupPage() {
  return <SignupForm />
}

function SignupForm() {
  const router = useRouter()
  const { t } = useLanguage()

  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [visaType, setVisaType] = useState('')
  const [visaExpiryDate, setVisaExpiryDate] = useState('')
  const [hasSir, setHasSir] = useState(false)
  const [hasFoodsafe, setHasFoodsafe] = useState(false)
  const [bio, setBio] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault()
    if (!role) {
      setError(t('auth.signup_role_error'))
      return
    }
    setError('')
    setStep(2)
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!role) return
    if (role === 'seeker' && !privacyConsent) {
      setError(t('auth.signup_privacy_consent'))
      return
    }
    setError('')
    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })

    if (signUpError || !data.user) {
      setError(signUpError?.message ?? t('auth.signup_button'))
      setLoading(false)
      return
    }

    const profilePayload: Record<string, unknown> = {
      id: data.user.id,
      role,
      name,
      bio,
      visa_type: visaType,
    }

    if (role === 'seeker') {
      profilePayload.visa_expiry_date = visaExpiryDate || null
      profilePayload.has_sir = hasSir
      profilePayload.has_foodsafe = hasFoodsafe
      profilePayload.neighborhood = neighborhood || null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: profileError } = await (supabase as any).from('profiles').insert(profilePayload)

    if (profileError) {
      setError(t('reviews.error'))
      setLoading(false)
      return
    }

    try {
      void fetch('/api/emails/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: data.user.id,
          email,
          name,
          role,
        }),
      })
    } catch (e) {
      console.warn('[signup] welcome email failed', e)
    }

    router.push('/')
  }

  const isSeeker = role === 'seeker'
  const submitDisabled = loading || (isSeeker && !privacyConsent)

  return (
    <div className="min-h-[80vh] flex flex-col justify-center">
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <div className="flex items-center gap-2 mb-6">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ backgroundColor: step >= 1 ? 'var(--brand)' : '#e5e7eb' }}
          >
            1
          </div>
          <div className="flex-1 h-0.5 bg-gray-200">
            <div
              className="h-full transition-all duration-300"
              style={{ width: step === 2 ? '100%' : '0%', backgroundColor: 'var(--brand)' }}
            />
          </div>
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white transition-colors"
            style={{ backgroundColor: step === 2 ? 'var(--brand)' : '#e5e7eb' }}
          >
            2
          </div>
        </div>

        {step === 1 ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('auth.signup_title_step1')}</h1>
            <p className="text-sm text-gray-500 mb-6">{t('auth.signup_subtitle_step1')}</p>

            <form onSubmit={handleStep1} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <RoleCard
                  selected={role === 'employer'}
                  onClick={() => setRole('employer')}
                  icon="🏪"
                  title={t('auth.signup_role_employer')}
                  desc={t('auth.signup_role_employer_desc')}
                />
                <RoleCard
                  selected={role === 'seeker'}
                  onClick={() => setRole('seeker')}
                  icon="🙋"
                  title={t('auth.signup_role_seeker')}
                  desc={t('auth.signup_role_seeker_desc')}
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
              )}

              <button
                type="submit"
                className="w-full text-white font-semibold py-3 rounded-xl transition-all active:scale-95 mt-2"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                {t('common.next')}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('auth.signup_title_step2')}</h1>
            <p className="text-sm text-gray-500 mb-6">
              {role === 'employer' ? t('auth.signup_subtitle_step2_employer') : t('auth.signup_subtitle_step2_seeker')}
            </p>

            <form onSubmit={handleSignup} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {role === 'employer' ? t('auth.signup_name_employer') : t('auth.signup_name_seeker')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder={role === 'employer' ? t('auth.signup_name_placeholder_employer') : t('auth.signup_name_placeholder_seeker')}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder={t('auth.email_placeholder')}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder={t('auth.signup_password_placeholder')}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                />
              </div>

              {role === 'seeker' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.signup_visa')}</label>
                    <select
                      value={visaType}
                      onChange={e => { setVisaType(e.target.value); if (e.target.value === '영주권/시민권') setVisaExpiryDate('') }}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent bg-white"
                    >
                      <option value="">{t('auth.signup_visa_placeholder')}</option>
                      {VISA_OPTIONS.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  {visaType && visaType !== '영주권/시민권' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {t('auth.signup_visa_expiry')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={visaExpiryDate}
                        onChange={e => setVisaExpiryDate(e.target.value)}
                        required
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.signup_neighborhood')}</label>
                    <select
                      value={neighborhood}
                      onChange={e => setNeighborhood(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent bg-white"
                    >
                      <option value="">{t('auth.signup_visa_placeholder')}</option>
                      {NEIGHBORHOOD_OPTIONS.map(n => (
                        <option key={n.value} value={n.value}>{n.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.signup_certificates')}</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasSir}
                          onChange={e => setHasSir(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                        />
                        <span className="text-sm text-gray-700">Serving It Right (SIR)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasFoodsafe}
                          onChange={e => setHasFoodsafe(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                        />
                        <span className="text-sm text-gray-700">FoodSafe</span>
                      </label>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {role === 'employer' ? t('auth.signup_bio_employer') : t('auth.signup_bio_seeker')}
                </label>
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  rows={3}
                  placeholder={role === 'employer' ? t('auth.signup_bio_placeholder_employer') : t('auth.signup_bio_placeholder_seeker')}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
              )}

              {isSeeker && (
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={privacyConsent}
                      onChange={e => setPrivacyConsent(e.target.checked)}
                      required
                      aria-required="true"
                      className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                    />
                    <span className="text-xs leading-relaxed text-gray-700">
                      {t('auth.signup_privacy_consent')}{' '}
                      <span className="text-red-500 font-semibold">{t('auth.signup_privacy_required')}</span>
                    </span>
                  </label>
                  <p className="mt-1.5 pl-7 text-[11px] leading-relaxed text-gray-500">
                    {t('auth.signup_privacy_detail')}
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 text-gray-600 font-medium py-3 rounded-xl border border-gray-200 bg-white transition-all hover:bg-gray-50 active:scale-95"
                >
                  {t('common.previous')}
                </button>
                <button
                  type="submit"
                  disabled={submitDisabled}
                  className="flex-1 text-white font-semibold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-60"
                  style={{ backgroundColor: 'var(--brand)' }}
                >
                  {loading ? t('auth.signup_loading') : t('auth.signup_button')}
                </button>
              </div>
            </form>
          </>
        )}
        <p className="text-sm text-center text-gray-500 mt-6">
          {t('auth.already_logged_in')}{' '}
          <Link href="/login" className="font-semibold text-orange-500 hover:underline">
            {t('auth.login_button')}
          </Link>
        </p>
      </div>
    </div>
  )
}

function RoleCard({
  selected,
  onClick,
  icon,
  title,
  desc,
}: {
  selected: boolean
  onClick: () => void
  icon: string
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all active:scale-95 ${
        selected
          ? 'border-orange-400 bg-orange-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <span className="text-3xl">{icon}</span>
      <span className={`text-sm font-semibold ${selected ? 'text-orange-600' : 'text-gray-700'}`}>
        {title}
      </span>
      <span className="text-xs text-gray-400 text-center leading-relaxed">{desc}</span>
    </button>
  )
}