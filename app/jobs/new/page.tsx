'use client'

import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { usePollProUpgrade } from '@/lib/usePollProUpgrade'

const LOCATION_OPTIONS = [
  '다운타운',
  '버나비',
  '서리',
  '코퀴틀람',
  '리치몬드',
  '노스밴쿠버',
  '기타',
]

const CATEGORY_OPTIONS = ['카페', '식당', '네일숍', '편의점', '기타']

type CustomQuestion = {
  id: string
  question: string
}

export default function NewJobPage() {
  const { user, profile } = useAuth()
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('')
  const [salary, setSalary] = useState('')
  const [workHours, setWorkHours] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Phase 2: Resume requirement and custom questions
  const [requireResume, setRequireResume] = useState(false)
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([])
  const [newQuestion, setNewQuestion] = useState('')

  // ── Pro 체험 활성화 폴링 (첫 공고 등록 시 자동 Pro 부상감지) ──
  //   - 등록 직전 employer 가 Pro 가 아니었다면 (= 이번 공고가 첫 공고)
  //     DB 트리거가 profiles 를 pro 로 승격시키는데, 이때까지 race condition
  //     없이 인메모리 profile 상태를 동기화한다.
  //   - activated 시: 베너 표시 + /api/notify/pro-activated 1회 호출
  //   - 이미 Pro 였던 유저(유료 구독 등)거나 첫 공고가 아니면 폴링 자체를
  //     트리거하지 않음 (베너도 안 뜸)

  // 이번에 등록하는 공고가 '첫 공고' 인가 (= 등록 전 Pro 가 아니었는가)
  const isLikelyFirstJob =
    profile?.role === 'employer' &&
    profile?.pro_subscriber !== true &&
    profile?.plan !== 'pro'

  // 이번 세션에서 막 INSERT 한 job 의 id (useEffect 와 handleSubmit 가 공유)
  const [lastInsertedJobId, setLastInsertedJobId] = useState<string | null>(null)
  // Pro 활성화 안내(이용자 노출) 시 1회만 트리거하도록 가드
  const proUpgradeAnnouncedRef = useRef(false)

  const poll = usePollProUpgrade({ manual: true, maxDurationMs: 8000 })
  const proJustActivated = poll.status === 'active'

  // Pro 가 막 활성화됐을 때: 1) 베너 표시 2) 알림 큐에 1 row INSERT
  useEffect(() => {
    if (!proJustActivated) return
    if (proUpgradeAnnouncedRef.current) return
    proUpgradeAnnouncedRef.current = true

    // notification_logs 큐에 등록
    const jobId = lastInsertedJobId
    if (jobId && user) {
      void supabase.auth.getSession().then(({ data }) => {
        const accessToken = data.session?.access_token
        if (!accessToken) return
        void fetch('/api/notify/pro-activated', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: 'Bearer ' + accessToken,
          },
          body: JSON.stringify({ job_id: jobId }),
        }).catch((e) => {
          console.warn('[NewJobPage] notify/pro-activated failed', e)
        })
      })
    }
  }, [proJustActivated, user, lastInsertedJobId])

  if (!profile || profile.role !== 'employer') {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-4xl mb-3">🚫</p>
        <p className="text-sm">업체 계정만 구인글을 등록할 수 있습니다.</p>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setLoading(true)
    setError('')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: insertError } = await (supabase as any)
      .from('job_posts')
      .insert({
        employer_id: user.id,
        title,
        location,
        category,
        salary,
        work_hours: workHours,
        description,
        deadline: deadline || null,
        status: 'open',
        require_resume: requireResume,
        custom_questions: customQuestions,
      })
      .select()
      .single()

    if (insertError || !data) {
      setError('구인글 등록에 실패했습니다. 다시 시도해주세요.')
      setLoading(false)
      return
    }

    const insertedJobId = (data as { id: string }).id
    setLastInsertedJobId(insertedJobId)

    // 다음 페이지(job 상세)에서 더 큰 축하 화면을 띄울 수 있도록 힌트를
    // sessionStorage 에 남겨둔다.
    if (isLikelyFirstJob && typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem('hv:proJustActivated', '1')
      } catch {
        // sessionStorage 사용 불가 환경(SSR, private mode)에서는 무시
      }
    }

    // '첫 공고' 시나리오였다면 폴링을 시작해서
    // DB 트리거가 profiles 를 pro 로 승격시킨 시점을 감지한다.
    if (isLikelyFirstJob) {
      proUpgradeAnnouncedRef.current = false
      poll.start()
      // 축하 베너를 잠시 보여준 뒤 라우팅한다.
      // 폴링이 active 가 되는 순간 베너가 렌더되고, 최소 1.5초는 보이도록.
      setTimeout(() => {
        router.push(`/jobs/${insertedJobId}`)
      }, 1800)
      return
    }

    // 이미 Pro 였거나 첫 공고가 아닌 경우: 바로 라우팅
    router.push(`/jobs/${insertedJobId}`)
  }

  // Today's date string for min on deadline picker
  const today = new Date().toISOString().split('T')[0]

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">구인글 등록</h1>
        <p className="text-sm text-gray-500 mt-1">
          상세하게 작성할수록 좋은 지원자를 만날 수 있어요 ✨
        </p>
      </div>

      {/* 첫 공고 축하 베너 — Pro 가 자동으로 활성화될 때 표시
          (pending: 동기화 중 / active: 활성화됨) */}
      {lastInsertedJobId && (proJustActivated || poll.status === 'pending') && (
        <ProUpgradeCelebration
          status={proJustActivated ? 'active' : 'pending'}
        />
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* 공고 제목 */}
          <Field label="공고 제목" required>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              placeholder="예: 한식당 주방 보조 구합니다"
              className={inputClass}
            />
          </Field>

          {/* 업종 */}
          <Field label="업종" required>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setCategory(opt)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-all active:scale-95 ${
                    category === opt
                      ? 'text-white border-transparent'
                      : 'text-gray-600 border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  style={
                    category === opt
                      ? { backgroundColor: 'var(--brand)', borderColor: 'var(--brand)' }
                      : {}
                  }
                >
                  {opt}
                </button>
              ))}
            </div>
            {/* hidden required validation helper */}
            <input
              type="text"
              value={category}
              required
              readOnly
              className="sr-only"
              tabIndex={-1}
            />
          </Field>

          {/* 근무 위치 */}
          <Field label="근무 위치" required>
            <select
              value={location}
              onChange={e => setLocation(e.target.value)}
              required
              className={inputClass + ' bg-white'}
            >
              <option value="">지역을 선택해주세요</option>
              {LOCATION_OPTIONS.map(l => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>

          {/* 시급 / 근무시간 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="시급 / 급여">
              <input
                type="text"
                value={salary}
                onChange={e => setSalary(e.target.value)}
                placeholder="예: $17.40/hr"
                className={inputClass}
              />
            </Field>
            <Field label="근무 시간">
              <input
                type="text"
                value={workHours}
                onChange={e => setWorkHours(e.target.value)}
                placeholder="예: 주 3~4일"
                className={inputClass}
              />
            </Field>
          </div>

          {/* 마감일 */}
          <Field label="모집 마감일">
            <input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              min={today}
              className={inputClass + ' bg-white'}
            />
            <p className="text-xs text-gray-400 mt-1">
              비워두면 마감일 없이 계속 노출됩니다.
            </p>
          </Field>

          {/* Phase 2: Resume Requirement Toggle */}
          <Field label="이력서 필수 여부">
            <button
              type="button"
              onClick={() => setRequireResume(!requireResume)}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-300 ${
                requireResume ? 'bg-orange-500' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                  requireResume ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <p className="text-xs text-gray-400 mt-1">
              {requireResume 
                ? '지원자는 이력서가 등록되어 있어야 지원할 수 있습니다.'
                : '이력서 없이도 지원할 수 있습니다.'
              }
            </p>
          </Field>

          {/* Phase 2: Custom Questions */}
          <Field label="사전 질문 (최대 3개)">
            <div className="space-y-2">
              {customQuestions.map((q, index) => (
                <div key={q.id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                    {index + 1}. {q.question}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomQuestions(prev => prev.filter(item => item.id !== q.id))}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    aria-label="삭제"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              
              {customQuestions.length < 3 && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newQuestion}
                    onChange={e => setNewQuestion(e.target.value)}
                    placeholder="예: 한국어 가능한가요?"
                    className={inputClass + ' flex-1'}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (newQuestion.trim()) {
                          setCustomQuestions(prev => [
                            ...prev,
                            { id: `q${Date.now()}`, question: newQuestion.trim() }
                          ])
                          setNewQuestion('')
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newQuestion.trim()) {
                        setCustomQuestions(prev => [
                          ...prev,
                          { id: `q${Date.now()}`, question: newQuestion.trim() }
                        ])
                        setNewQuestion('')
                      }
                    }}
                    disabled={!newQuestion.trim()}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all active:scale-95 disabled:opacity-40"
                    style={{ backgroundColor: 'var(--brand)' }}
                  >
                    추가
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-400">
                지원자가 지원 시 답변해야 할 질문을 추가하세요.
              </p>
            </div>
          </Field>

          {/* 상세 내용 */}
          <Field label="상세 내용">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={6}
              placeholder={`업무 내용, 필요 조건, 복리후생 등을 자세히 작성해주세요.\n\n예)\n• 한식당 주방 보조 (설거지, 재료 손질)\n• 한국어 가능자 우대\n• 식사 제공`}
              className={inputClass + ' resize-none'}
            />
          </Field>

          {/* 미리보기 카드 */}
          {title && (
            <div className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-200">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                미리보기
              </p>
              <p className="font-semibold text-gray-900 text-sm mb-1">{title}</p>
              <div className="flex flex-wrap gap-2">
                {location && <PreviewTag icon="📍" text={location} />}
                {category && <PreviewTag icon="🏪" text={category} />}
                {salary && <PreviewTag icon="💰" text={salary} />}
                {workHours && <PreviewTag icon="🕐" text={workHours} />}
                {deadline && (
                  <PreviewTag
                    icon="📅"
                    text={`~${new Date(deadline).toLocaleDateString('ko-KR')}`}
                  />
                )}
                {requireResume && <PreviewTag icon="📄" text="이력서 필수" />}
                {customQuestions.length > 0 && (
                  <PreviewTag icon="❓" text={`사전질문 ${customQuestions.length}개`} />
                )}
              </div>
            </div>
          )}

          {/* 에러 메시지 */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={loading || !category}
            className="w-full text-white font-semibold py-3.5 rounded-xl transition-all active:scale-95 disabled:opacity-60 mt-1"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                등록 중...
              </span>
            ) : (
              '구인글 등록하기'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────

const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{' '}
        {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  )
}

function PreviewTag({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-white border border-gray-100 rounded-full px-2.5 py-1">
      {icon} {text}
    </span>
  )
}

/**
 * ProUpgradeCelebration
 * 첫 공고 등록 직후 DB 트리거에 의해 Pro 가 활성화되는 과정을 시각적으로 알리는 베너.
 *  - status='pending' : 구독 상태 동기화 중 (스피너 + 메시지)
 *  - status='active'  : 활성화 감지됨 (축하 아이콘 + 30일 체험 안내)
 */
function ProUpgradeCelebration({ status }: { status: 'pending' | 'active' }) {
  if (status === 'active') {
    return (
      <div
        className="mb-4 rounded-2xl border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50 p-5 shadow-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <div className="text-3xl" aria-hidden>
            🎉
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-orange-900">
              Pro 플랜이 활성화됐어요!
            </p>
            <p className="text-sm text-orange-800 mt-1 leading-relaxed">
              공고가 등록되었습니다. 앞으로 <strong>30일간</strong> HireVan Pro의
              모든 기능을 무료로 사용하실 수 있어요.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-orange-200 px-3 py-1 text-orange-800">
                ✨ 구직자 연락처 전체 보기
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-orange-200 px-3 py-1 text-orange-800">
                ⚡ 매칭 추천 무제한
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-orange-200 px-3 py-1 text-orange-800">
                🚀 공고 상단 노출
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // pending
  return (
    <div
      className="mb-4 rounded-2xl border border-orange-200 bg-orange-50/60 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-5 w-5 rounded-full border-2 border-orange-300 border-t-orange-500 animate-spin"
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-orange-900">
            첫 공고 등록 축하드립니다! Pro 체험 활성화 중…
          </p>
          <p className="text-xs text-orange-700 mt-0.5">
            잠시만 기다려 주세요. 구독 정보를 동기화하고 있어요.
          </p>
        </div>
      </div>
    </div>
  )
}
