'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

const LOCATION_OPTIONS = ['다운타운', '버나비', '서리', '코퀴틀람', '리치몬드', '노스밴쿠버', '기타']

export default function NewJobPage() {
  const { user, profile } = useAuth()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [salary, setSalary] = useState('')
  const [workHours, setWorkHours] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

    const { data, error } = await supabase
      .from('job_posts')
      .insert({
        employer_id: user.id,
        title,
        location,
        salary,
        work_hours: workHours,
        description,
        status: 'open',
      })
      .select()
      .single()

    if (error || !data) {
      setError('구인글 등록에 실패했습니다.')
      setLoading(false)
      return
    }

    router.push(`/jobs/${data.id}`)
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">구인글 등록</h1>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              공고 제목 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              placeholder="예: 한식당 주방 보조 구합니다"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              근무 위치 <span className="text-red-400">*</span>
            </label>
            <select
              value={location}
              onChange={e => setLocation(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent bg-white"
            >
              <option value="">선택해주세요</option>
              {LOCATION_OPTIONS.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                시급 / 급여
              </label>
              <input
                type="text"
                value={salary}
                onChange={e => setSalary(e.target.value)}
                placeholder="예: $17/hr"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                근무 시간
              </label>
              <input
                type="text"
                value={workHours}
                onChange={e => setWorkHours(e.target.value)}
                placeholder="예: 주 3~4일, 풀타임"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              상세 내용
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={6}
              placeholder="업무 내용, 필요 조건, 복리후생 등을 자세히 작성해주세요"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-semibold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-60 mt-2"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {loading ? '등록 중...' : '구인글 등록하기'}
          </button>
        </form>
      </div>
    </div>
  )
}
