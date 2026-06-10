'use client'

import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Role = 'employer' | 'seeker'

const VISA_OPTIONS = ['워킹홀리데이', '학생비자', '취업비자', '영주권/시민권', '기타']

// 변경: 고유 식별 번호로 매핑된 객체 구조로 대체
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
/**
 * 회원가입 페이지는 항상 step 1(역할 선택)에서 시작한다.
 * 랜딩페이지에서 별도의 URL 파라미터 없이 진입해도 폼이 자연스럽게 동작하도록
 * 설계되어 있으며, 사용자가 step1 에서 '구직자' / '채용자' 카드를 직접 선택한다.
 */
export default function SignupPage() {
  return <SignupForm />
}

function SignupForm() {
  const router = useRouter()

  // 회원가입 단계는 항상 step 1(역할 선택)에서 시작한다.
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
  // 구직자 전용 — 프로필 정보 공개 동의
  const [privacyConsent, setPrivacyConsent] = useState(false)
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
    // 구직자인 경우 동의 체크가 해제된 상태에서 form submit 이 호출되면 막는다.
    // (button disabled 만으로는 devtools 조작 등을 완전히 막을 수 없어서 방어 로직 추가)
    if (role === 'seeker' && !privacyConsent) {
      setError('프로필 정보 공개에 동의해야 가입할 수 있습니다.')
      return
    }
    setError('')
    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })

    if (signUpError || !data.user) {
      setError(signUpError?.message ?? '회원가입에 실패했습니다.')
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

    // 구직자 추가 정보
    if (role === 'seeker') {
      profilePayload.visa_expiry_date = visaExpiryDate || null
      profilePayload.has_sir = hasSir
      profilePayload.has_foodsafe = hasFoodsafe
      profilePayload.neighborhood = neighborhood || null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: profileError } = await (supabase as any).from('profiles').insert(profilePayload)

    if (profileError) {
      setError('프로필 생성에 실패했습니다. 다시 시도해주세요.')
      setLoading(false)
      return
    }

    // ── 환영 이메일 + 인앱알림 발송 (비동기 fire-and-forget) ──
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
      // 이메일 발송 실패는 회원가입 흐름에 영향을 주지 않음
      console.warn('[signup] welcome email failed', e)
    }

    router.push('/')
  }

  // 구직자만 동의 체크가 필요. 채용자는 체크박스 자체가 렌더링되지 않으므로 항상 통과.
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
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      비자 종류
                    </label>
                    <select
                      value={visaType}
                      onChange={e => { setVisaType(e.target.value); if (e.target.value === '영주권/시민권') setVisaExpiryDate('') }}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent bg-white"
                    >
                      <option value="">선택해주세요</option>
                      {VISA_OPTIONS.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  {visaType && visaType !== '영주권/시민권' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        비자 만료일 <span className="text-red-500">*</span>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">거주 구역</label>
                    <select
                      value={neighborhood}
                      onChange={e => setNeighborhood(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent bg-white"
                    >
                      <option value="">선택해주세요</option>
                      {NEIGHBORHOOD_OPTIONS.map(n => (
                        <option key={n.value} value={n.value}>
                          {n.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      보유 자격증 (해당 항목을 선택해주세요)
                    </label>
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

              {/* ── 구직자 전용: 프로필 정보 공개 동의 (필수) ──
                   - step 2(계정 정보 입력) 화면에서, 구직자(seeker) 모드일 때만 렌더링
                   - 채용자(employer) 모드에서는 이 영역이 아예 렌더링되지 않으며,
                     체크 상태와 무관하게 '가입하기' 버튼이 정상 작동한다. */}
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
                  disabled={submitDisabled}
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
