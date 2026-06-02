'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Role = 'employer' | 'seeker'

const VISA_OPTIONS = ['워킹홀리데이', '학생비자', '취업비자', '영주권/시민권', '기타']

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [visaType, setVisaType] = useState('')
  const [bio, setBio] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault()
    if (!role) {
      setError('역할을 선택해주세요.')
      return
    }
    setError('')
    setStep(2)
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!role) return
    setError('')
    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })

    if (signUpError || !data.user) {
      setError(signUpError?.message ?? '회원가입에 실패했습니다.')
      setLoading(false)
      return
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      role,
      name,
      bio,
      visa_type: visaType,
    })

    if (profileError) {
      setError('프로필 생성에 실패했습니다. 다시 시도해주세요.')
      setLoading(false)
      return
    }

    router.push('/')
  }

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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">역할을 선택해주세요</h1>
            <p className="text-sm text-gray-500 mb-6">나중에 변경할 수 없으니 신중하게 선택하세요</p>

            <form onSubmit={handleStep1} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <RoleCard
                  selected={role === 'employer'}
                  onClick={() => setRole('employer')}
                  icon="🏪"
                  title="업체 (구인)"
                  desc="직원을 구하고 있어요"
                />
                <RoleCard
                  selected={role === 'seeker'}
                  onClick={() => setRole('seeker')}
                  icon="🙋"
                  title="구직자 (구직)"
                  desc="일자리를 찾고 있어요"
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
                다음
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">계정 정보 입력</h1>
            <p className="text-sm text-gray-500 mb-6">
              {role === 'employer' ? '업체 정보를 입력해주세요' : '개인 정보를 입력해주세요'}
            </p>

            <form onSubmit={handleSignup} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {role === 'employer' ? '업체명' : '이름'}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder={role === 'employer' ? '예: 홍길동 식당' : '예: 김민지'}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                />
              </div>

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
                  minLength={6}
                  placeholder="6자 이상 입력해주세요"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                />
              </div>

              {role === 'seeker' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    비자 종류
                  </label>
                  <select
                    value={visaType}
                    onChange={e => setVisaType(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent bg-white"
                  >
                    <option value="">선택해주세요</option>
                    {VISA_OPTIONS.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {role === 'employer' ? '업체 소개 (선택)' : '자기소개 (선택)'}
                </label>
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  rows={3}
                  placeholder={role === 'employer' ? '업체 업종, 위치 등 간단히 소개해주세요' : '경력, 특기 등 간단히 소개해주세요'}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 text-gray-600 font-medium py-3 rounded-xl border border-gray-200 bg-white transition-all hover:bg-gray-50 active:scale-95"
                >
                  이전
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 text-white font-semibold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-60"
                  style={{ backgroundColor: 'var(--brand)' }}
                >
                  {loading ? '가입 중...' : '가입하기'}
                </button>
              </div>
            </form>
          </>
        )}

        <p className="text-sm text-center text-gray-500 mt-6">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="font-semibold text-orange-500 hover:underline">
            로그인
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
