'use client'

import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

type AuthType = 'seeker' | 'employer'

function AuthInner() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLanguage()
  const rawType = searchParams.get('type')
  const type: AuthType = rawType === 'employer' ? 'employer' : 'seeker'

  const copy = {
    emoji: type === 'seeker' ? '🧑‍🍳' : '🏪',
    title: t(type === 'seeker' ? 'auth.auth_seeker_title' : 'auth.auth_employer_title'),
    desc: t(type === 'seeker' ? 'auth.auth_seeker_desc' : 'auth.auth_employer_desc'),
    cta: t(type === 'seeker' ? 'auth.auth_seeker_title' : 'auth.auth_employer_title'),
  }

  const [formData, setFormData] = useState({
    nameOrShop: '',
    email: '',
    password: '',
  })
  const [privacyConsent, setPrivacyConsent] = useState(false)

  const isSeeker = type === 'seeker'
  const submitDisabled = loading || (isSeeker && !privacyConsent)

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.nameOrShop || !formData.email || !formData.password) {
      alert(t('common.no_data'))
      return
    }

    if (isSeeker && !privacyConsent) {
      alert(t('auth.auth_privacy_consent'))
      return
    }

    try {
      setLoading(true)

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            nameOrShop: formData.nameOrShop,
            type: type,
          },
        },
      })

      if (signUpError) throw signUpError
      if (!data.user) throw new Error(t('common.loading'))

      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          role: type,
          name: formData.nameOrShop,
        })

      if (profileError && profileError.code !== '23505') {
        console.warn('Profile insert warning:', profileError)
      }

      console.log('가입 성공:', data)
      alert(t('auth.auth_welcome'))

      const dest = type === 'employer' ? '/employer/dashboard' : '/seeker/dashboard'
      router.push(dest)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('reviews.error')
      console.error('가입 에러:', error)
      alert(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mb-6" style={{ backgroundColor: type === 'seeker' ? '#FFF0EB' : '#EFF6FF' }}>
        {copy.emoji}
      </div>
      <h1 className="text-2xl font-extrabold mb-2">{copy.title}</h1>
      <p className="text-gray-500 mb-8">{copy.desc}</p>

      <form onSubmit={handleSignUp} className="w-full max-w-sm space-y-3">
        <input
          placeholder={type === 'employer' ? t('auth.auth_name_placeholder_employer') : t('auth.auth_name_placeholder_seeker')}
          required
          className="w-full p-4 rounded-2xl border"
          value={formData.nameOrShop}
          onChange={e => setFormData({ ...formData, nameOrShop: e.target.value })}
        />
        <input
          type="email"
          placeholder={t('auth.auth_email_placeholder')}
          required
          className="w-full p-4 rounded-2xl border"
          value={formData.email}
          onChange={e => setFormData({ ...formData, email: e.target.value })}
        />
        <input
          type="password"
          minLength={6}
          placeholder={t('auth.auth_password_placeholder')}
          required
          className="w-full p-4 rounded-2xl border"
          value={formData.password}
          onChange={e => setFormData({ ...formData, password: e.target.value })}
        />

        {isSeeker && (
          <div className="text-left rounded-2xl border border-gray-200 bg-gray-50/60 px-4 py-3">
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
                {t('auth.auth_privacy_consent')}{' '}
                <span className="text-red-500 font-semibold">{t('auth.signup_privacy_required')}</span>
              </span>
            </label>
            <p className="mt-1.5 pl-7 text-[11px] leading-relaxed text-gray-500">
              {t('auth.auth_privacy_detail')}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitDisabled}
          className="w-full mt-6 py-4 rounded-2xl text-white font-bold disabled:opacity-60"
          style={{ backgroundColor: type === 'seeker' ? '#FF6B35' : '#2563EB' }}
        >
          {loading ? t('auth.signup_loading') : copy.cta}
        </button>
      </form>

      <p className="text-sm text-gray-500 mt-6">
        {t('auth.already_logged_in')}{' '}
        <Link href="/login" className="font-semibold text-orange-500 hover:underline">
          {t('auth.login_button')}
        </Link>
      </p>

      <Link href="/" className="mt-4 text-sm text-gray-400">
        {t('auth.auth_back_to_home')}
      </Link>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div>{'Loading...'}</div>}>
      <AuthInner />
    </Suspense>
  )
}