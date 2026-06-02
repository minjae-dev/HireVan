'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

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

      {/* My job posts link for employers */}
      {profile.role === 'employer' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-3">내 구인글 관리</h2>
          <a
            href="/jobs/my"
            className="flex items-center justify-between text-sm text-gray-600 hover:text-orange-500 transition-colors"
          >
            <span>등록한 구인글 보기</span>
            <span className="text-gray-400">›</span>
          </a>
        </div>
      )}
    </div>
  )
}
