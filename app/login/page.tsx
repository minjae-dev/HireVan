'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

/**
 * /login
 * - 이미 로그인된 사용자는 role 별 대시보드로 자동 라우팅
 * - 로그인 성공 시에도 동일하게 role 별 대시보드로 이동
 *   (이전에는 무조건 / 로 갔는데, 이로 인해 사용자가 "튕겨나갔다"고 인식)
 */
export default function LoginPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  /**
   * 로그인된 사용자의 role 기반 목적지.
   * profile 이 아직 로드 안 됐으면 일단 / 로 보냄 (auth-context 가 곧 채워줌).
   */
  const dashboardFor = (role: 'seeker' | 'employer' | null | undefined) => {
    if (role === 'employer') return '/employer/dashboard'
    if (role === 'seeker') return '/seeker/dashboard'
    return '/'
  }

  // 이미 로그인된 상태로 페이지에 들어오면 role 별 대시보드로 보냄
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
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      setSubmitting(false)
      return
    }

    // 1) 방금 로그인한 사용자의 profile 을 직접 조회
    //    (auth-context 의 onAuthStateChange 가 비동기로 profile 을 채우기 전에
    //     destination 을 계산하기 위함)
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">로그인</h1>
        <p className="text-sm text-gray-500 mb-6">HireVan에 오신 것을 환영합니다</p>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="example@email.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="비밀번호를 입력하세요"
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
            {submitting ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="text-sm text-center text-gray-500 mt-6">
          아직 계정이 없으신가요?{' '}
          <Link href="/signup" className="font-semibold text-orange-500 hover:underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  )
}
