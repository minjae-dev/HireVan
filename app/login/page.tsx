'use client'

import { useLanguage } from '@/context/LanguageContext'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || ''
  const { user, profile, loading } = useAuth()
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const dashboardFor = (role: 'seeker' | 'employer' | null | undefined) => {
    if (redirectTo) return redirectTo
    if (role === 'employer') return '/employer/dashboard'
    if (role === 'seeker') return '/seeker/dashboard'
    return '/'
  }

  useEffect(() => {
    if (loading) return
    if (user && profile) {
      router.replace(dashboardFor(profile.role))
    }
  }, [user, profile, loading, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError || !data.user) {
      setError(t('auth.login_error'))
      setSubmitting(false)
      return
    }

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle()

    router.push(dashboardFor(profileRow?.role))
  }

  return (
    <div className="min-h-[80vh] flex flex-col justify-center">
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('auth.login_title')}</h1>
        <p className="text-sm text-gray-500 mb-6">{t('auth.login_subtitle')}</p>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('auth.email')}
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('auth.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder={t('auth.password_placeholder')}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full text-white font-semibold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-60 mt-2"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {submitting ? t('auth.login_loading') : t('auth.login_button')}
          </button>
        </form>

        <p className="text-sm text-center text-gray-500 mt-6">
          {t('auth.no_account')}{' '}
          <Link href="/signup" className="font-semibold text-orange-500 hover:underline">
            {t('auth.signup_link')}
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /></div>}>
      <LoginContent />
    </Suspense>
  )
}