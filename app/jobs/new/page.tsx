'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

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

    const { data, error: insertError } = await supabase
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
      })
      .select()
      .single()

    if (insertError || !data) {
      setError('구인글 등록에 실패했습니다. 다시 시도해주세요.')
      setLoading(false)
      return
    }

    router.push(`/jobs/${data.id}`)
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
