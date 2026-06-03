'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

const LOCATION_OPTIONS = ['다운타운', '버나비', '서리', '코퀴틀람', '리치몬드', '노스밴쿠버', '기타']
const JOB_TYPE_OPTIONS = ['카페', '식당', '네일숍', '편의점', '소매점', '청소용역', '배송', '기타']

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

    setSubmitting(true)
    setError('')

    try {
      const { data, error: insertError } = await supabase
        .from('job_posts')
        .insert({
          employer_id: user.id,
          title: formData.title,
          location: formData.location,
          salary: formData.salary,
          work_hours: formData.workHours,
          description: formData.description,
          status: 'open',
        })
        .select()
        .single()

      if (insertError || !data) {
        setError('구인글 등록에 실패했습니다. 다시 시도해주세요.')
        setSubmitting(false)
        return
      }

      // 성공 후 목록 페이지로 이동
      router.push('/employer/jobs')
    } catch (err) {
      setError('오류가 발생했습니다. 다시 시도해주세요.')
      setSubmitting(false)
    }
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
