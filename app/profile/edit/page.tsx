'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const VISA_OPTIONS = ['워킹홀리데이', '학생비자', '취업비자', '영주권/시민권', '기타']

export default function EditProfilePage() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth()
  const router = useRouter()

  const [fetching, setFetching] = useState(true)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [visaType, setVisaType] = useState('')
  const [visaExpiryDate, setVisaExpiryDate] = useState('')
  const [hasSir, setHasSir] = useState(false)
  const [hasFoodsafe, setHasFoodsafe] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user || !profile) {
      router.push('/login')
      return
    }

    const fetchProfile = async () => {
      setFetching(true)
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (data) {
        const d = data as Record<string, unknown>
        setName((d.name as string) || '')
        setBio((d.bio as string) || '')
        setVisaType((d.visa_type as string) || '')
        setVisaExpiryDate((d.visa_expiry_date as string) ?? '')
        setHasSir(d.has_sir === true)
        setHasFoodsafe(d.has_foodsafe === true)
      }
      setFetching(false)
    }

    fetchProfile()
  }, [user, profile, authLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setError('')
    setSuccess(false)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = { name, bio }

    if (profile?.role === 'seeker') {
      payload.visa_type = visaType
      payload.visa_expiry_date = visaExpiryDate || null
      payload.has_sir = hasSir
      payload.has_foodsafe = hasFoodsafe
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id)

    if (updateError) {
      setError('저장에 실패했습니다: ' + updateError.message)
    } else {
      await refreshProfile()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    }
    setSaving(false)
  }

  if (authLoading || fetching) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link href="/profile" className="text-sm text-gray-500 hover:text-orange-500">&larr; 프로필로 돌아가기</Link>
        <h1 className="text-2xl font-extrabold text-gray-900 mt-2">내 정보 수정</h1>
        <p className="text-sm text-gray-500 mt-1">{profile.role === 'seeker' ? '구직자' : '업체'} 정보를 수정합니다.</p>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {profile.role === 'employer' ? '업체명' : '이름'}
            </label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
            />
          </div>

          {profile.role === 'seeker' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">비자 종류</label>
                <select value={visaType}
                  onChange={e => { setVisaType(e.target.value); if (e.target.value === '영주권/시민권') setVisaExpiryDate('') }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent bg-white"
                >
                  <option value="">선택해주세요</option>
                  {VISA_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              {visaType && visaType !== '영주권/시민권' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    비자 만료일 <span className="text-red-500">*</span>
                  </label>
                  <input type="date" value={visaExpiryDate} onChange={e => setVisaExpiryDate(e.target.value)} required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">보유 자격증</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hasSir} onChange={e => setHasSir(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                    />
                    <span className="text-sm text-gray-700">Serving It Right (SIR)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hasFoodsafe} onChange={e => setHasFoodsafe(e.target.checked)}
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
              {profile.role === 'employer' ? '업체 소개' : '자기소개'}
            </label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4}
              placeholder={profile.role === 'employer' ? '업체 업종, 위치 등을 소개해주세요' : '경력, 특기 등을 소개해주세요'}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
          {success && <p className="text-sm text-green-600 bg-green-50 rounded-xl px-4 py-3">✅ 저장되었습니다!</p>}

          <div className="flex gap-3 mt-2">
            <Link href="/profile"
              className="flex-1 text-center text-gray-600 font-medium py-3 rounded-xl border border-gray-200 bg-white transition-all hover:bg-gray-50 active:scale-95"
            >취소</Link>
            <button type="submit" disabled={saving}
              className="flex-1 text-white font-semibold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand)' }}
            >{saving ? '저장 중...' : '저장하기'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}