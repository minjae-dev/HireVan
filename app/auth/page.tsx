'use client'

import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

type AuthType = 'seeker' | 'employer'

const COPY: Record<AuthType, { emoji: string; title: string; desc: string; accent: string; soft: string; cta: string }> = {
  seeker: {
    emoji: '🧑‍🍳',
    title: '구직자로 가입하기',
    desc: '간단한 정보만 입력하면 가입 완료!',
    accent: '#FF6B35',
    soft: '#FFF0EB',
    cta: '구직자 가입하기',
  },
  employer: {
    emoji: '🏪',
    title: '채용자로 가입하기',
    desc: '가게 정보로 간단하게 가입하세요.',
    accent: '#2563EB',
    soft: '#EFF6FF',
    cta: '채용자 가입하기',
  },
}

function AuthInner() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawType = searchParams.get('type')
  const type: AuthType = rawType === 'employer' ? 'employer' : 'seeker'
  const copy = COPY[type]

  const [formData, setFormData] = useState({
    nameOrShop: '',
    email: '',
    password: '',
  })
  // 구직자 전용 — 프로필 정보 공개 동의 (필수)
  // 채용자(employer) 모드에서는 이 값이 사용되지도, 렌더링되지도 않는다.
  const [privacyConsent, setPrivacyConsent] = useState(false)

  const isSeeker = type === 'seeker'
  const submitDisabled = loading || (isSeeker && !privacyConsent)

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.nameOrShop || !formData.email || !formData.password) {
      alert('모든 정보를 입력해주세요.')
      return
    }

    // 구직자 동의가 체크되지 않은 상태에서 submit 이 호출되면 막는다.
    // (button disabled 만으로는 devtools 조작 등을 완전히 막을 수 없어서 방어 로직 추가)
    if (isSeeker && !privacyConsent) {
      alert('프로필 정보 공개에 동의해야 가입할 수 있습니다.')
      return
    }

    try {
      setLoading(true)

      // 1. Supabase Auth 회원가입
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
      if (!data.user) throw new Error('회원가입에 실패했습니다.')

      // 2. profiles 테이블에 row 생성
      //    ★ 핵심: 누락되면 navbar 의 `user && profile` 조건이 false 가 되어
      //      비로그인 UI("로그인/회원가입" 버튼) 가 노출됨.
      //    RLS 정책으로 인해 인증된 사용자만 자기 자신을 insert 할 수 있으므로,
      //    signUp 직후 (이메일 인증 off 라면 이미 세션이 있음) 실행해야 함.
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          role: type,
          name: formData.nameOrShop,
        })

      //    이미 존재(unique violation)거나 사소한 에러는 무시 (로그만 남김)
      if (profileError && profileError.code !== '23505') {
        console.warn('Profile insert warning:', profileError)
        // 그래도 진행 (auth.user_options 의 metadata 에는 저장되어 있음)
      }

      console.log('가입 성공:', data)
      alert(`${type === 'employer' ? '사장' : '구직자'}님, 환영합니다!`)

      // 3. 역할별 대시보드로 직접 이동 (이메일 인증 off 가정)
      const dest = type === 'employer' ? '/employer/dashboard' : '/seeker/dashboard'
      router.push(dest)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '가입 중 오류가 발생했습니다.'
      console.error('가입 에러:', error)
      alert(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mb-6"
        style={{ backgroundColor: copy.soft }}
      >
        {copy.emoji}
      </div>
      <h1 className="text-2xl font-extrabold mb-2">{copy.title}</h1>
      <p className="text-gray-500 mb-8">{copy.desc}</p>

      <form onSubmit={handleSignUp} className="w-full max-w-sm space-y-3">
        <input
          placeholder={type === 'employer' ? '업체명' : '이름'}
          required
          className="w-full p-4 rounded-2xl border"
          value={formData.nameOrShop}
          onChange={e => setFormData({ ...formData, nameOrShop: e.target.value })}
        />
        <input
          type="email"
          placeholder="이메일(example@email.com)"
          required
          className="w-full p-4 rounded-2xl border"
          value={formData.email}
          onChange={e => setFormData({ ...formData, email: e.target.value })}
        />
        <input
          type="password"
          minLength={6}
          placeholder="비밀번호(6자 이상 입력해주세요)"
          required
          className="w-full p-4 rounded-2xl border"
          value={formData.password}
          onChange={e => setFormData({ ...formData, password: e.target.value })}
        />

        {/* ── 구직자 전용: 프로필 정보 공개 동의 (필수) ──
             - 랜딩페이지에서 /auth?type=seeker 로 진입한 경우에만 렌더링
             - 채용자(employer) 모드에서는 이 영역이 아예 렌더링되지 않으며,
               체크 상태와 무관하게 '가입하기' 버튼이 정상 작동한다. */}
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
                채용 매칭을 위해 비자 상태, 경력 사항, 거주 지역 등 프로필 정보가
                기업 채용 담당자에게 공개되는 것에 동의합니다.{' '}
                <span className="text-red-500 font-semibold">(필수)</span>
              </span>
            </label>
            <p className="mt-1.5 pl-7 text-[11px] leading-relaxed text-gray-500">
              상세 공개 범위는 가입 후{' '}
              <Link
                href="/profile/edit"
                className="text-orange-500 hover:underline font-medium"
              >
                마이페이지
              </Link>{' '}
              {' > '}{' '}
              <Link
                href="/profile/edit"
                className="text-orange-500 hover:underline font-medium"
              >
                프로필 설정
              </Link>
              에서 언제든지 관리할 수 있습니다.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitDisabled}
          className="w-full mt-6 py-4 rounded-2xl text-white font-bold disabled:opacity-60"
          style={{ backgroundColor: copy.accent }}
        >
          {loading ? '가입 중...' : copy.cta}
        </button>
      </form>

      <p className="text-sm text-gray-500 mt-6">
        이미 회원이신가요?{' '}
        <Link href="/login" className="font-semibold text-orange-500 hover:underline">
          로그인
        </Link>
      </p>

      <Link href="/" className="mt-4 text-sm text-gray-400">
        ← 처음으로 돌아가기
      </Link>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthInner />
    </Suspense>
  )
}
