'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useAuth } from '@/lib/auth-context'
import { useLanguage } from '@/context/LanguageContext'
import type { EmployerBillingStatus } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { usePollProUpgrade } from '@/lib/usePollProUpgrade'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

type ReceivedReview = {
  id: string
  rating: number
  comment: string
  created_at: string
  reviewer: { name: string; role: 'employer' | 'seeker' } | null
}

type Resume = {
  id: string
  file_url: string
  updated_at: string
}

const VISA_OPTIONS = ['워킹홀리데이', '학생비자', '취업비자', '영주권/시민권', '기타']

export default function ProfilePage() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const { t } = useLanguage()
  const router = useRouter()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [visaType, setVisaType] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [reviews, setReviews] = useState<ReceivedReview[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [resume, setResume] = useState<Resume | null>(null)
  const [resumeLoading, setResumeLoading] = useState(true)
  const [resumeUploading, setResumeUploading] = useState(false)
  const [resumeError, setResumeError] = useState('')

  // -----------------------------------------------------------------
  // 결제 직후 Race Condition 방어 (웹후크 반영 대기)
  // -----------------------------------------------------------------
  //  Stripe success_url 이 /profile?upgrade=success&session_id=... 로
  //  리다이렉트시키기 때문에 이 페이지에서도 동기화 방어가 필요하다.
  //  usePollProUpgrade 훅이 프로필과 billing RPC 를
  //  최대 5초간 폴링해서 pro_subscriber 플래그가 true 가 되기를 기다린다.
  // -----------------------------------------------------------------
  const poll = usePollProUpgrade({ manual: true })
  const [billing, setBilling] = useState<EmployerBillingStatus | null>(null)
  const [upgradeJustCompleted, setUpgradeJustCompleted] = useState(false)

  const fetchBillingOnce = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc('get_employer_billing_status')
    if (data) setBilling(data as EmployerBillingStatus)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('upgrade') === 'success') {
      // 1) 쿼리 파라미터 정리 (URL 깔끔하게)
      url.searchParams.delete('upgrade')
      url.searchParams.delete('session_id')
      window.history.replaceState({}, '', url.toString())

      // 2) 프로필 + billing 동기화
      void refreshProfile()
      void fetchBillingOnce()

      // 3) 아직 webhook 미도달이면 폴링 시작
      setUpgradeJustCompleted(true)
      poll.start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 폴링이 종료될 때마다 billing 최신화
  useEffect(() => {
    if (poll.status === 'active' || poll.status === 'timeout') {
      void fetchBillingOnce()
    }
  }, [poll.status, fetchBillingOnce])

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
    if (profile) {
      setName(profile.name)
      setBio(profile.bio)
      setVisaType(profile.visa_type)
    }
  }, [user, profile, loading, router])

  useEffect(() => {
    if (!user) return

    const fetchReviews = async () => {
      setReviewsLoading(true)
      const { data } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at, reviewer:profiles!reviews_reviewer_id_fkey(name, role)')
        .eq('reviewee_id', user.id)
        .order('created_at', { ascending: false })

      setReviews((data as unknown as ReceivedReview[]) ?? [])
      setReviewsLoading(false)
    }

    fetchReviews()
  }, [user])

  useEffect(() => {
    if (!user || profile?.role !== 'seeker') {
      setResumeLoading(false)
      return
    }

    const fetchResume = async () => {
      setResumeLoading(true)
      const { data } = await supabase
        .from('resumes')
        .select('id, file_url, updated_at')
        .eq('seeker_id', user.id)
        .maybeSingle()

      setResume((data as Resume | null) ?? null)
      setResumeLoading(false)
    }

    fetchResume()
  }, [user, profile?.role])

  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!user || !file) return

    setResumeError('')
    setResumeUploading(true)

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]

    if (!allowedTypes.includes(file.type)) {
      setResumeError(t('profile.resume_error_type'))
      setResumeUploading(false)
      event.target.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setResumeError(t('profile.resume_error_size'))
      setResumeUploading(false)
      event.target.value = ''
      return
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${user.id}/${Date.now()}-${safeName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(filePath, file, {
        upsert: true,
        cacheControl: '3600',
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      setResumeError(t('profile.resume_error_failed', { message: uploadError.message }))
      setResumeUploading(false)
      event.target.value = ''
      return
    }

    console.log('Upload successful:', uploadData)

    const { data: publicUrlData } = supabase.storage.from('resumes').getPublicUrl(filePath)
    const updatedAt = new Date().toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: upsertError } = await (supabase as any)
      .from('resumes')
      .upsert(
        {
          seeker_id: user.id,
          file_url: publicUrlData.publicUrl,
          updated_at: updatedAt,
        },
        { onConflict: 'seeker_id' }
      )
      .select('id, file_url, updated_at')
      .single()

    if (upsertError || !data) {
      setResumeError(t('profile.resume_error_save'))
    } else {
      setResume(data as Resume)
    }

    setResumeUploading(false)
    event.target.value = ''
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setError('')
    setSuccess(false)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('profiles')
      .update({ name, bio, visa_type: visaType })
      .eq('id', user.id)

    if (error) {
      setError(t('profile.save_error'))
    } else {
      await refreshProfile()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile) return null

  const roleLabel = profile.role === 'employer' ? t('profile.role_employer') : t('profile.role_seeker')
  const roleColor = profile.role === 'employer' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
  const averageRating = reviews.length > 0
    ? (reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length).toFixed(1)
    : '0.0'
  const mannerTemperature = reviews.length > 0
    ? Math.min(99, Math.max(18, 36.5 + (Number(averageRating) - 3) * 8)).toFixed(1)
    : '36.5'

  // 폴링 상태 기반 UI 가시성
  const remainingSec = Math.max(0, 5 - Math.ceil(poll.elapsedMs / 1000))
  const showUpgradePending = poll.status === 'pending'
  const showUpgradeTimeout = poll.status === 'timeout'

  return (
    <div>
      {/* 결제 직후 동기화 배너 (race condition 방어) */}
      {showUpgradePending && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center gap-3 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-pink-50 px-5 py-4"
        >
          <div className="h-6 w-6 flex-shrink-0 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">
              {t('employer.upgrade_pending_title')}
            </p>
            <p className="mt-0.5 text-xs text-gray-600">
              {t('employer.upgrade_pending_desc', { sec: remainingSec })}
            </p>
          </div>
        </div>
      )}
      {showUpgradeTimeout && (
        <div
          role="alert"
          className="mb-4 flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:gap-3"
        >
          <span className="text-2xl">⏰</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-900">
              {t('employer.upgrade_timeout_title')}
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              {t('employer.upgrade_timeout_desc')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void fetchBillingOnce()
              poll.start()
            }}
            className="flex-shrink-0 rounded-full border border-amber-400 bg-white px-4 py-2 text-xs font-bold text-amber-700 transition-all active:scale-95"
          >
            {t('employer.upgrade_retry')}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
        <div className="flex items-center gap-4 mb-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white flex-shrink-0"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {profile.name ? profile.name[0] : '?'}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{profile.name || t('profile.no_name')}</h1>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleColor}`}>
              {roleLabel}
            </span>
          </div>
          <Link
            href="/profile/edit"
            className="flex-shrink-0 rounded-full border border-orange-300 bg-white px-4 py-2 text-xs font-bold text-orange-600 transition-all active:scale-95 hover:bg-orange-50"
          >
            {t('profile.edit_btn')}
          </Link>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {profile.role === 'employer' ? t('profile.name_employer') : t('profile.name_seeker')}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
            />
          </div>

          {profile.role === 'seeker' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('profile.visa_type')}
              </label>
              <select
                value={visaType}
                onChange={e => setVisaType(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent bg-white"
              >
                <option value="">{t('profile.visa_select')}</option>
                {VISA_OPTIONS.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {profile.role === 'employer' ? t('profile.bio_employer') : t('profile.bio_seeker')}
            </label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={4}
              placeholder={profile.role === 'employer' ? t('profile.bio_placeholder_employer') : t('profile.bio_placeholder_seeker')}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
          )}

          {success && (
            <p className="text-sm text-green-600 bg-green-50 rounded-xl px-4 py-3">{t('profile.save_success')}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full text-white font-semibold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </form>
      </div>

      {profile.role === 'seeker' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-xs font-semibold text-orange-500 mb-1">{t('profile.resume_section_title')}</p>
              <h2 className="text-lg font-bold text-gray-900">{t('profile.resume_section_title')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('profile.resume_section_desc')}</p>
            </div>
            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
              {t('profile.resume_free_badge')}
            </span>
          </div>

          {resumeLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="rounded-2xl bg-gray-50 p-4">
              {resume ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t('profile.resume_registered')}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {t('profile.resume_updated', { date: new Date(resume.updated_at).toLocaleDateString('ko-KR') })}
                    </p>
                  </div>
                  <a
                    href={resume.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:text-orange-500"
                  >
                    {t('profile.resume_view')}
                  </a>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-gray-800">{t('profile.resume_empty')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('profile.resume_empty_desc')}</p>
                </div>
              )}
            </div>
          )}

          {resumeError && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{resumeError}</p>
          )}

          <label className="mt-4 flex w-full cursor-pointer items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-60" style={{ backgroundColor: 'var(--brand)' }}>
            {resumeUploading ? t('profile.resume_uploading') : resume ? t('profile.resume_replace') : t('profile.resume_upload')}
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              disabled={resumeUploading}
              onChange={handleResumeUpload}
            />
          </label>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-5 mt-4">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs font-semibold text-orange-500 mb-1">{t('profile.manner_report')}</p>
            <h2 className="text-lg font-bold text-gray-900">{t('profile.manner_title')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('profile.manner_desc')}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-extrabold text-orange-500">{mannerTemperature}°C</p>
            <p className="text-xs text-gray-400">{t('profile.manner_temp')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-2xl bg-orange-50 px-4 py-3">
            <p className="text-xs text-orange-600 mb-1">{t('profile.avg_rating')}</p>
            <p className="text-xl font-bold text-gray-900">⭐ {averageRating}</p>
          </div>
          <div className="rounded-2xl bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">{t('profile.review_count')}</p>
            <p className="text-xl font-bold text-gray-900">{reviews.length}{t('common.no_data')?.includes('개') ? '' : '개'}{/* {t('profile.review_count')} handles count */}</p>
          </div>
        </div>

        {reviewsLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 py-8 text-center">
            <p className="text-3xl mb-2">🌱</p>
            <p className="text-sm font-medium text-gray-500">{t('profile.no_reviews')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('profile.no_reviews_desc')}</p>
          </div>
        ) : (
          <div className="space-y-3 divide-y divide-gray-100">
            {reviews.map(review => (
              <div key={review.id} className="pt-3 first:pt-0">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{review.reviewer?.name || t('profile.review_anonymous')}</p>
                    <p className="text-xs text-gray-400">
                      {review.reviewer?.role === 'employer' ? t('profile.role_employer') : t('profile.role_seeker')} · {new Date(review.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-0.5" aria-label={`${review.rating}점`}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <span key={star} className={star <= review.rating ? 'text-orange-400' : 'text-gray-200'}>★</span>
                    ))}
                  </div>
                </div>
                <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-600">
                  {review.comment || t('profile.no_comment')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My job posts link for employers */}
      {profile.role === 'employer' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-3">{t('jobs.manage_jobs')}</h2>
          <Link
            href="/employer/jobs"
            className="flex items-center justify-between text-sm text-gray-600 hover:text-orange-500 transition-colors"
          >
            <span>{t('jobs.view_jobs')}</span>
            <span className="text-gray-400">›</span>
          </Link>
        </div>
      )}
    </div>
  )
}