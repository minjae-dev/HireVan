'use client'

import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { getLocations, getCategories } from '@/lib/options'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const MAX_QUESTIONS_FREE = 3
const MAX_QUESTIONS_PRO = 5

export default function EmployerNewJobPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const { t } = useLanguage()
  const LOCATION_OPTIONS = getLocations(t)
  const JOB_TYPE_OPTIONS = getCategories(t)

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
        <p className="text-sm mb-4">{t('jobs.employer_only')}</p>
        <Link href="/login" className="inline-block text-white font-semibold text-sm px-6 py-2.5 rounded-full" style={{ backgroundColor: 'var(--brand)' }}>
          {t('auth.login_button')}
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
    if(requireResume && !isPro || questions.length > MAX_QUESTIONS_FREE && !isPro) {
      setError(t('employer.pro_required'))
      return
    }
    if (!formData.title.trim()) {
      setError(t('jobs.new_job_title_label') + t('common.required'))
      return
    }
    if (!formData.location) {
      setError(t('jobs.new_job_location') + t('common.required'))
      return
    }
    if (!formData.jobType) {
      setError(t('jobs.new_job_category') + t('common.required'))
      return
    }

    if (!user) {
      setError(t('common.no_data'))
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
      let descriptionText = `[${formData.jobType}] ${formData.description}`

      if (formData.deadline) {
        descriptionText = `[마감:${formData.deadline}] ${descriptionText}`
      }

      if (requireResume) {
        descriptionText = `[이력서필수] ${descriptionText}`
      }
      if (customQuestions.length > 0) {
        const questionsText = customQuestions.map(q => q.question).join(', ')
        descriptionText = `${descriptionText}\n\n[사전질문] ${questionsText}`
      }

      const jobPostData = {
        employer_id: user.id,
        title: formData.title,
        location: formData.location,
        salary: formData.salary,
        work_hours: formData.workHours,
        description: descriptionText,
        status: 'open' as const,
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: insertError } = await (supabase as any)
        .from('job_posts')
        .insert(jobPostData)
        .select()
        .single()

      if (insertError) {
        console.error('Supabase error:', insertError)
        setError(`${t('jobs.new_job_error')}: ${insertError.message}`)
        setSubmitting(false)
        return
      }

      if (!data) {
        setError(t('jobs.new_job_error'))
        setSubmitting(false)
        return
      }

      router.push('/employer/jobs')
    } catch (err) {
      console.error('Unexpected error:', err)
      setError(`${t('jobs.new_job_error')}: ${err instanceof Error ? err.message : ''}`)
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
          <h1 className="text-2xl font-bold text-gray-900">{t('jobs.new_job_title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('jobs.new_job_subtitle')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-100 p-6">
        {/* 공고 제목 */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            {t('jobs.new_job_title_label')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder={t('jobs.new_job_title_placeholder')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all"
          />
          <p className="text-xs text-gray-400 mt-1">{t('jobs.new_job_title_hint')}</p>
        </div>

        {/* 업체명 */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            {t('jobs.company_name')}
          </label>
          <input
            type="text"
            name="businessName"
            value={formData.businessName}
            onChange={handleChange}
            placeholder={profile?.name || t('jobs.company_name')}
            disabled
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">{t('jobs.company_name_hint')}</p>
        </div>

        {/* 위치, 업종 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {t('jobs.new_job_location')} <span className="text-red-500">*</span>
            </label>
            <select
              name="location"
              value={formData.location}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all"
            >
              <option value="">{t('jobs.new_job_location_placeholder')}</option>
              {LOCATION_OPTIONS.map((loc: { value: string; label: string }) => (
                <option key={loc.value} value={loc.value}>
                  {loc.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {t('jobs.new_job_category')} <span className="text-red-500">*</span>
            </label>
            <select
              name="jobType"
              value={formData.jobType}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all"
            >
              <option value="">{t('jobs.new_job_location_placeholder')}</option>
              {JOB_TYPE_OPTIONS.map((type: { value: string; label: string }) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 급여, 근무시간 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {t('jobs.new_job_salary')}
            </label>
            <input
              type="text"
              name="salary"
              value={formData.salary}
              onChange={handleChange}
              placeholder={t('jobs.salary_placeholder')}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {t('jobs.new_job_work_hours')}
            </label>
            <input
              type="text"
              name="workHours"
              value={formData.workHours}
              onChange={handleChange}
              placeholder={t('jobs.hours_placeholder')}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* 마감일 */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            {t('jobs.new_job_deadline')}
          </label>
          <input
            type="date"
            name="deadline"
            value={formData.deadline}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all"
          />
          <p className="text-xs text-gray-400 mt-1">{t('jobs.new_job_deadline_hint')}</p>
        </div>

        {/* 상세 설명 */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            {t('common.description')}
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={6}
            placeholder={t('jobs.description_placeholder')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition-all resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">{t('jobs.description_hint')}</p>
        </div>

        <div className="mb-6 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900">{t('jobs.filtering_title')}</h2>
                <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-bold text-white">PRO</span>
              </div>
              <p className="text-xs leading-relaxed text-gray-500">
                {t('jobs.filtering_desc')}
                {isPro && ' (PRO: max 5)'}
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
              <p className="text-sm font-semibold text-gray-900">{t('jobs.resume_toggle')}</p>
              <p className="mt-0.5 text-xs text-gray-400">{t('jobs.resume_toggle_desc')}</p>
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
                <p className="text-sm font-semibold text-gray-900">{t('jobs.pre_questions_title')}</p>
                <p className="mt-0.5 text-xs text-gray-400">{t('jobs.pre_questions_max', { count: maxQuestions })}</p>
              </div>
              <button
                type="button"
                onClick={handleAddQuestion}
                disabled={questions.length >= maxQuestions}
                className="flex-shrink-0 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-600 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-300"
              >
                {t('jobs.new_job_pre_questions_add')}
              </button>
            </div>

            {questions.length === 0 ? (
              <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-400">
                {t('jobs.pre_questions_empty')}
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
                      placeholder={t('jobs.pre_questions_placeholder_q', { num: index + 1 })}
                      className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(index)}
                      className="h-[46px] w-[46px] flex-shrink-0 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-400 transition-colors hover:text-red-500"
                      aria-label={`Q${index + 1}`}
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
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-3.5 rounded-xl text-white font-semibold text-sm transition-all active:scale-95 disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {submitting ? t('jobs.new_job_submitting') : t('jobs.new_job_submit')}
          </button>
        </div>
      </form>
    </div>
  )
}