'use client'

import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const LOCATION_OPTIONS = ['다운타운', '버나비', '서리', '코퀴틀람', '리치몬드', '노스밴쿠버', '기타']
const JOB_TYPE_OPTIONS = ['카페', '식당', '네일숍', '편의점', '소매점', '청소용역', '배송', '기타']
const MAX_QUESTIONS_FREE = 3
const MAX_QUESTIONS_PRO = 5

export default function EmployerNewJobPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()

  const [formData, setFormData] = useState({
    title: '',
    businessName: '',
    location: '',
    jobType: '',
    salary: '',
    workHours: '',
    description: '',
    deadline: '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [requireResume, setRequireResume] = useState(false)
  const [questions, setQuestions] = useState<string[]>([])
  const isPro = profile?.plan === 'pro'
  const maxQuestions = isPro ? MAX_QUESTIONS_PRO : MAX_QUESTIONS_FREE

  // 권한 확인
  if (!loading && (!user || profile?.role !== 'employer')) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-4xl mb-3">🚫</p>
        <p className="text-sm mb-4">업체 계정만 구인글을 등록할 수 있습니다.</p>
        <Link href="/login" className="inline-block text-white font-semibold text-sm px-6 py-2.5 rounded-full" style={{ backgroundColor: 'var(--brand)' }}>
          로그인
        </Link>
      </div>
    )
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // 유저가  프로플랜 인지 확인하는 작업
    if(requireResume && !isPro || questions.length > MAX_QUESTIONS_FREE && !isPro) {
      setError(`PRO 플랜으로 업그레이드해야만 이용가능합니다.`)
      return
    }
    // 유효성 검사
    if (!formData.title.trim()) {
      setError('공고 제목을 입력해주세요.')
      return
    }
    if (!formData.location) {
      setError('근무 위치를 선택해주세요.')
      return
    }
    if (!formData.jobType) {
      setError('업종을 선택해주세요.')
      return
    }

    if (!user) {
      setError('사용자 정보가 없습니다.')
      return
    }
   



    const customQuestions = questions
      .map(question => question.trim())
      .filter(Boolean)
      .map((question, index) => ({
        id: `q${index + 1}`,
        question,
      }))

    setSubmitting(true)
    setError('')

    try {
      // DB에 category, deadline, require_resume, custom_questions 컬럼이 없을 수 있으므로
      // description에 모든 정보를 포함하여 저장
      let descriptionText = `[${formData.jobType}] ${formData.description}`

      // 마감일 정보가 있으면 description에 추가
      if (formData.deadline) {
        descriptionText = `[마감:${formData.deadline}] ${descriptionText}`
      }

      // PRO 기능 (require_resume, custom_questions)은 description에 주석으로 추가
      if (requireResume) {
        descriptionText = `[이력서필수] ${descriptionText}`
      }
      if (customQuestions.length > 0) {
        const questionsText = customQuestions.map(q => q.question).join(', ')
        descriptionText = `${descriptionText}\n\n[사전질문] ${questionsText}`
      }

      // job_posts 테이블에 실제로 존재하는 컬럼만 사용
      // (id, employer_id, title, location, salary, work_hours, description, status, created_at)
      const jobPostData = {
        employer_id: user.id,
        title: formData.title,
        location: formData.location,
        salary: formData.salary,
        work_hours: formData.workHours,
        description: descriptionText,
        status: 'open' as const,
      }

      console.log('Submitting job post with data:', jobPostData)

      const { data, error: insertError } = await supabase
        .from('job_posts')
        .insert(jobPostData)
        .select()
        .single()

      console.log('Insert result:', { data, insertError })

      if (insertError) {
        console.error('Supabase error:', insertError)
        setError(`구인글 등록에 실패했습니다: ${insertError.message}`)
        setSubmitting(false)
        return
      }

      if (!data) {
        setError('구인글 등록에 실패했습니다. 데이터가 반환되지 않았습니다.')
        setSubmitting(false)
        return
      }

      // 성공 후 목록 페이지로 이동
      router.push('/employer/jobs')
    } catch (err) {
      console.error('Unexpected error:', err)
      setError(`오류가 발생했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
      setSubmitting(false)
    }
  }

  const handleAddQuestion = () => {
    if (questions.length >= maxQuestions) return
    setQuestions(prev => [...prev, ''])
  }

  const handleQuestionChange = (index: number, value: string) => {
    setQuestions(prev => prev.map((question, i) => (i === index ? value : question)))
  }

  const handleRemoveQuestion = (index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/employer/jobs" className="text-gray-400 hover:text-gray-600 transition-colors">
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">새 구인글 등록</h1>
          <p className="text-sm text-gray-500 mt-1">구인 정보를 입력하여 직원을 모집하세요</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-100 p-6">
        {/* 공고 제목 */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            공고 제목 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="예: 한식당 주방 보조원 모집"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all"
          />
          <p className="text-xs text-gray-400 mt-1">구직자 눈에 띄는 제목으로 작성해주세요</p>
        </div>

        {/* 업체명 */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            업체명
          </label>
          <input
            type="text"
            name="businessName"
            value={formData.businessName}
            onChange={handleChange}
            placeholder={profile?.name || '업체명'}
            disabled
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">프로필 정보에서 변경할 수 있습니다</p>
        </div>

        {/* 위치, 업종 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              근무 위치 <span className="text-red-500">*</span>
            </label>
            <select
              name="location"
              value={formData.location}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all"
            >
              <option value="">선택해주세요</option>
              {LOCATION_OPTIONS.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              업종 <span className="text-red-500">*</span>
            </label>
            <select
              name="jobType"
              value={formData.jobType}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all"
            >
              <option value="">선택해주세요</option>
              {JOB_TYPE_OPTIONS.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 급여, 근무시간 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              시급 / 월급
            </label>
            <input
              type="text"
              name="salary"
              value={formData.salary}
              onChange={handleChange}
              placeholder="예: $17-18/hr"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              근무 시간
            </label>
            <input
              type="text"
              name="workHours"
              value={formData.workHours}
              onChange={handleChange}
              placeholder="예: 주 3-4일, 풀타임"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* 마감일 */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            모집 기한
          </label>
          <input
            type="date"
            name="deadline"
            value={formData.deadline}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all"
          />
          <p className="text-xs text-gray-400 mt-1">설정하지 않으면 무기한 모집입니다</p>
        </div>

        {/* 상세 설명 */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            상세 내용
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={6}
            placeholder="업무 내용, 필수 조건, 우대사항, 복리후생, 연락처 등을 자세히 작성해주세요"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">상세할수록 좋은 지원자를 만날 수 있습니다</p>
        </div>

        <div className="mb-6 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900">지원자 필터링 조건 설정</h2>
                <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-bold text-white">PRO</span>
              </div>
              <p className="text-xs leading-relaxed text-gray-500">
                필요한 서류와 사전 질문을 받아 더 잘 맞는 지원자를 빠르게 확인하세요.
                {isPro && ' (PRO: 최대 5개)'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setRequireResume(prev => !prev)}
            className="mb-4 flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left transition-all active:scale-[0.99]"
            aria-pressed={requireResume}
          >
            <div>
              <p className="text-sm font-semibold text-gray-900">이력서 첨부 필수</p>
              <p className="mt-0.5 text-xs text-gray-400">지원자가 프로필에 등록한 이력서를 함께 제출합니다.</p>
            </div>
            <span
              className={`relative h-7 w-12 rounded-full transition-colors ${
                requireResume ? 'bg-orange-500' : 'bg-gray-200'
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  requireResume ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </span>
          </button>

          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">지원자에게 사전 질문하기</p>
                <p className="mt-0.5 text-xs text-gray-400">최대 {maxQuestions}개까지 단답형 질문을 추가할 수 있습니다.</p>
              </div>
              <button
                type="button"
                onClick={handleAddQuestion}
                disabled={questions.length >= maxQuestions}
                className="flex-shrink-0 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-600 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-300"
              >
                + 추가
              </button>
            </div>

            {questions.length === 0 ? (
              <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-400">
                아직 추가된 질문이 없습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {questions.map((question, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={question}
                      onChange={event => handleQuestionChange(index, event.target.value)}
                      maxLength={120}
                      placeholder={`질문 ${index + 1}. 예: 가능한 근무 시작일은 언제인가요?`}
                      className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(index)}
                      className="h-[46px] w-[46px] flex-shrink-0 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-400 transition-colors hover:text-red-500"
                      aria-label={`질문 ${index + 1} 삭제`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-50 border border-red-200">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-all active:scale-95"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-3.5 rounded-xl text-white font-semibold text-sm transition-all active:scale-95 disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {submitting ? '등록 중...' : '구인글 등록하기'}
          </button>
        </div>
      </form>
    </div>
  )
}
