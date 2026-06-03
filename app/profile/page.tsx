'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

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
      setResumeError('PDF, DOC, DOCX 파일만 업로드할 수 있습니다.')
      setResumeUploading(false)
      event.target.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setResumeError('이력서는 10MB 이하 파일만 업로드할 수 있습니다.')
      setResumeUploading(false)
      event.target.value = ''
      return
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${user.id}/${Date.now()}-${safeName}`
    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      setResumeError('이력서 업로드에 실패했습니다. 스토리지 버킷 설정을 확인해주세요.')
      setResumeUploading(false)
      event.target.value = ''
      return
    }

    const { data: publicUrlData } = supabase.storage.from('resumes').getPublicUrl(filePath)
    const updatedAt = new Date().toISOString()
    const { data, error: upsertError } = await supabase
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
      setResumeError('이력서 정보를 저장하지 못했습니다. 다시 시도해주세요.')
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

    const { error } = await supabase
      .from('profiles')
      .update({ name, bio, visa_type: visaType })
      .eq('id', user.id)

    if (error) {
      setError('저장에 실패했습니다.')
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

  const roleLabel = profile.role === 'employer' ? '업체 (구인)' : '구직자'
  const roleColor = profile.role === 'employer' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
  const averageRating = reviews.length > 0
    ? (reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length).toFixed(1)
    : '0.0'
  const mannerTemperature = reviews.length > 0
    ? Math.min(99, Math.max(18, 36.5 + (Number(averageRating) - 3) * 8)).toFixed(1)
    : '36.5'

  return (
    <div>
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
        <div className="flex items-center gap-4 mb-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white flex-shrink-0"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {profile.name ? profile.name[0] : '?'}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{profile.name || '이름 없음'}</h1>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleColor}`}>
              {roleLabel}
            </span>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {profile.role === 'employer' ? '업체명' : '이름'}
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
              {profile.role === 'employer' ? '업체 소개' : '자기소개'}
            </label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={4}
              placeholder={profile.role === 'employer' ? '업체 업종, 위치 등을 소개해주세요' : '경력, 특기 등을 소개해주세요'}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
          )}

          {success && (
            <p className="text-sm text-green-600 bg-green-50 rounded-xl px-4 py-3">저장되었습니다!</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full text-white font-semibold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {saving ? '저장 중...' : '저장하기'}
          </button>
        </form>
      </div>

      {profile.role === 'seeker' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-xs font-semibold text-orange-500 mb-1">이력서</p>
              <h2 className="text-lg font-bold text-gray-900">지원용 이력서</h2>
              <p className="text-sm text-gray-500 mt-1">PDF, DOC, DOCX 파일을 등록해두면 지원할 때 사용할 수 있어요.</p>
            </div>
            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
              무료
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
                    <p className="text-sm font-semibold text-gray-800">등록된 이력서가 있습니다.</p>
                    <p className="text-xs text-gray-400 mt-1">
                      최근 수정 {new Date(resume.updated_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <a
                    href={resume.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:text-orange-500"
                  >
                    이력서 보기
                  </a>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-gray-800">아직 등록된 이력서가 없습니다.</p>
                  <p className="text-xs text-gray-400 mt-1">PRO 업체의 이력서 필수 공고에 지원하려면 먼저 등록해주세요.</p>
                </div>
              )}
            </div>
          )}

          {resumeError && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{resumeError}</p>
          )}

          <label className="mt-4 flex w-full cursor-pointer items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-60" style={{ backgroundColor: 'var(--brand)' }}>
            {resumeUploading ? '업로드 중...' : resume ? '이력서 교체하기' : '이력서 업로드'}
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
            <p className="text-xs font-semibold text-orange-500 mb-1">매너 리포트</p>
            <h2 className="text-lg font-bold text-gray-900">받은 후기</h2>
            <p className="text-sm text-gray-500 mt-1">면접 후 상대방이 남긴 신뢰 점수입니다.</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-extrabold text-orange-500">{mannerTemperature}°C</p>
            <p className="text-xs text-gray-400">매너온도</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-2xl bg-orange-50 px-4 py-3">
            <p className="text-xs text-orange-600 mb-1">평균 별점</p>
            <p className="text-xl font-bold text-gray-900">⭐ {averageRating}</p>
          </div>
          <div className="rounded-2xl bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">후기 수</p>
            <p className="text-xl font-bold text-gray-900">{reviews.length}개</p>
          </div>
        </div>

        {reviewsLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 py-8 text-center">
            <p className="text-3xl mb-2">🌱</p>
            <p className="text-sm font-medium text-gray-500">아직 받은 후기가 없습니다.</p>
            <p className="text-xs text-gray-400 mt-1">면접 완료 후 첫 후기를 기다려보세요.</p>
          </div>
        ) : (
          <div className="space-y-3 divide-y divide-gray-100">
            {reviews.map(review => (
              <div key={review.id} className="pt-3 first:pt-0">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{review.reviewer?.name || '익명'}</p>
                    <p className="text-xs text-gray-400">
                      {review.reviewer?.role === 'employer' ? '업체' : '구직자'} · {new Date(review.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-0.5" aria-label={`${review.rating}점`}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <span key={star} className={star <= review.rating ? 'text-orange-400' : 'text-gray-200'}>★</span>
                    ))}
                  </div>
                </div>
                <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-600">
                  {review.comment || '한줄평 없이 별점만 남겼습니다.'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My job posts link for employers */}
      {profile.role === 'employer' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-3">내 구인글 관리</h2>
          <Link
            href="/employer/jobs"
            className="flex items-center justify-between text-sm text-gray-600 hover:text-orange-500 transition-colors"
          >
            <span>등록한 구인글 보기</span>
            <span className="text-gray-400">›</span>
          </Link>
        </div>
      )}
    </div>
  )
}
