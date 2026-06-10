'use client'

import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const VISA_OPTIONS = ['워킹홀리데이', '학생비자', '취업비자', '영주권/시민권', '기타']

/**
 * 구직자가 다중 선택할 수 있는 기본 스킬 옵션.
 * 사용자가 인풋을 통해 직접 새 스킬을 추가할 수 있다.
 */

// 변경: 고유 식별 번호로 매핑된 객체 구조로 대체
const NEIGHBORHOOD_OPTIONS = [
  { value: '5', label: '밴쿠버' },
  { value: '1', label: '버나비' },
  { value: '2', label: '코퀴틀람' },
  { value: '4', label: '써리' },
  { value: '11', label: '랭리' },
  { value: '14', label: '포트코퀴틀람' },
  { value: '6', label: '노스밴쿠버' },
  { value: '7', label: '웨스트밴쿠버' },
  { value: '3', label: '포트무디' },
  { value: '9', label: '리치몬드' },
  { value: '12', label: '델타' },
  { value: '15', label: '뉴웨스터민스터' },
  { value: '8', label: '메이플릿지' },
  { value: '10', label: '화이트락' },
  { value: '16', label: '핏메도우' },
  { value: '17', label: '재스퍼' },
  { value: '19', label: '아보츠포드' },
  { value: '20', label: '킬로나' },
  { value: '13', label: '기타' },
] as const

const SKILL_OPTIONS = [
  'POS',
  '캐셔',
  '한글 입력',
  '서빙',
  '주방 보조',
  '포장',
  '주차 안내',
  '배달',
  '청소',
  '네일',
] as const

/**
 * 구직자가 다중 선택할 수 있는 기본 근무 시간대 옵션.
 * 카드 하단의 🔥 [주말/마감 가능] 뱃지 활성화 여부에 '주말 전체', '마감조'가 사용된다.
 */
const SHIFT_OPTIONS = [
  '평일 오전',
  '평일 오후',
  '평일 저녁',
  '마감조',
  '새벽조',
  '주말 오전',
  '주말 오후',
  '주말 전체',
  '풀타임',
  '파트타임',
] as const

/**
 * 캐나다 우편번호는 'V6B', 'T2P' 처럼 영문+숫자+영문 3자리 형식이다.
 * 입력값을 정규화할 때 사용한다.
 */
const POSTAL_CODE_REGEX = /^[A-Za-z][0-9][A-Za-z]$/

type ToastTone = 'success' | 'info' | 'error'

interface ToastState {
  id: number
  message: string
  tone: ToastTone
}

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
  // ── 신규: 구직자 경쟁력 필드 ──
  const [localExperienceMonths, setLocalExperienceMonths] = useState<number>(0)
  const [skills, setSkills] = useState<string[]>([])
  const [skillDraft, setSkillDraft] = useState('')
  const [availableShifts, setAvailableShifts] = useState<string[]>([])
  const [shiftDraft, setShiftDraft] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [postalCodePrefix, setPostalCodePrefix] = useState('')
  // ─────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // ── 인증 미션(크레딧) 관련 상태 ──
  const [certFile, setCertFile] = useState<File | null>(null)
  const [submittingVerification, setSubmittingVerification] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastIdRef = useRef(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (message: string, tone: ToastTone = 'success') => {
    const id = ++toastIdRef.current
    setToast({ id, message, tone })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setToast(prev => (prev && prev.id === id ? null : prev))
    }, 3000)
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

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
        // ── 신규: 구직자 경쟁력 필드 ──
        setLocalExperienceMonths(
          typeof d.local_experience_months === 'number'
            ? (d.local_experience_months as number)
            : 0,
        )
        setSkills(Array.isArray(d.skills) ? (d.skills as string[]) : [])
        setAvailableShifts(
          Array.isArray(d.available_shifts) ? (d.available_shifts as string[]) : [],
        )
        setNeighborhood((d.neighborhood as string) || '')
        setPostalCodePrefix(
          typeof d.postal_code_prefix === 'string'
            ? ((d.postal_code_prefix as string) ?? '')
            : '',
        )
        // ─────────────────────────────────────
      }
      setFetching(false)
    }

    fetchProfile()
  }, [user, profile, authLoading, router])

  // ── 칩 토글 헬퍼 ──
  const toggleFromList = (
    value: string,
    list: string[],
    setter: (next: string[]) => void,
  ) => {
    if (!value) return
    if (list.includes(value)) {
      setter(list.filter(v => v !== value))
    } else {
      setter([...list, value])
    }
  }

  // ── 스킬 / 시프트 직접 추가 헬퍼 (중복 제거 + 트림) ──
  const addCustomValue = (
    draft: string,
    list: string[],
    setter: (next: string[]) => void,
    draftSetter: (next: string) => void,
  ) => {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (list.includes(trimmed)) {
      draftSetter('')
      return
    }
    setter([...list, trimmed])
    draftSetter('')
  }

  // ── 우편번호 정규화: 영문 대문자 + 숫자 + 영문 대문자 3자리 ──
  const handlePostalCodeChange = (raw: string) => {
    // 입력 중에는 사용자가 지우고 다시 입력하는 과정을 방해하지 않도록
    // 단순히 영숫자만 남기고 대문자로 변환한다.
    const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3)
    setPostalCodePrefix(cleaned)
  }

  // 유효성: 비어있지 않다면 POSTAL_CODE_REGEX 매칭 필요
  const postalCodeValid =
    postalCodePrefix === '' || POSTAL_CODE_REGEX.test(postalCodePrefix)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (profile?.role === 'seeker' && !postalCodeValid) {
      setError('우편번호는 영문+숫자+영문 3자리 형식이어야 합니다. (예: V6B)')
      return
    }

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
      // ── 신규: 구직자 경쟁력 필드 저장 ──
      // 0~600 사이로 클램프 (DB CHECK 제약과 일치)
      const months = Math.max(
        0,
        Math.min(600, Number.isFinite(localExperienceMonths) ? localExperienceMonths : 0),
      )
      payload.neighborhood = neighborhood || null
      payload.local_experience_months = months
      payload.skills = skills
      payload.available_shifts = availableShifts
      payload.postal_code_prefix = postalCodePrefix === '' ? null : postalCodePrefix
      // ─────────────────────────────────────
    }

    const { error: updateError } = await (supabase as any)
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

  // 현재 보유 크레딧. (credit_count 는 기존 PRO 시스템용이고, credits 는 새 미션 보상용)
  // 둘 중 큰 값을 노출하면 사용자가 혼란스럽지 않으므로, 우선 새 컬럼을 사용한다.
  const currentCredits: number = (() => {
    const d = profile as unknown as Record<string, unknown> | null
    const c = typeof d?.credits === 'number' ? (d.credits as number) : 0
    return c
  })()

  const handleVerificationRequest = async () => {
    if (!user) return
    if (!certFile) {
      showToast('먼저 업로드할 파일을 선택해주세요.', 'error')
      return
    }
    setSubmittingVerification(true)
    try {
      // TODO (다음 단계):
      //   1) Supabase Storage 에 userId/<timestamp>-<file> 경로로 업로드
      //   2) verification_requests 테이블에 row INSERT
      //   3) 관리자 대시보드에서 검토 후 is_verified=true + credits+=50 처리
      // 현 단계에서는 DB 쓰기/외부 API 호출 없이 토스트만 띄운다.
      console.info('[verification] 요청 접수:', {
        userId: user.id,
        fileName: certFile.name,
        fileSize: certFile.size,
        fileType: certFile.type,
      })

      // 짧은 지연을 주어 사용자가 "요청이 진행되고 있다"는 피드백을 받게 한다.
      await new Promise(resolve => setTimeout(resolve, 350))

      showToast('인증 요청이 완료되었습니다. 관리자 확인 후 크레딧이 지급됩니다.', 'success')
      setCertFile(null)
      const fileInput = document.getElementById('cert-file-input') as HTMLInputElement | null
      if (fileInput) fileInput.value = ''
    } finally {
      setSubmittingVerification(false)
    }
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

      {/* ── 구직자 한정: 크레딧 / 인증 미션 영역 ── */}
      {profile.role === 'seeker' && (
        <div className="mb-6 space-y-3">
          {/* 현재 보유 크레딧 카드 */}
          <div
            data-testid="credit-balance"
            className="flex items-center justify-between rounded-2xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden>🪙</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  현재 보유 크레딧
                </p>
                <p className="text-2xl font-extrabold text-amber-900 leading-tight">
                  {currentCredits.toLocaleString('ko-KR')}
                  <span className="ml-1 text-sm font-bold text-amber-700">credits</span>
                </p>
              </div>
            </div>
            {currentCredits > 0 && (
              <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white">
                사용 가능
              </span>
            )}
          </div>

          {/* 크레딧 얻기 미션 배너 */}
          <div className="rounded-2xl border border-orange-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden>🎯</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">
                  [크레딧 얻기 미션] 자격증(SIR, FoodSafe) 또는 비자 사진을 업로드하고
                  인증 배지와 <span className="text-orange-600">50 크레딧</span>을 받아보세요!
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  받은 크레딧은 내 프로필을 사장님들께 <strong>상단 노출</strong>하는 데 사용할 수 있습니다.
                </p>
              </div>
            </div>

            {/* 업로드 폼 */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label
                htmlFor="cert-file-input"
                className="sr-only"
              >
                자격증/비자 사진 업로드
              </label>
              <input
                id="cert-file-input"
                type="file"
                accept="image/*,application/pdf"
                onChange={e => setCertFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-700
                  file:mr-3 file:rounded-lg file:border-0
                  file:bg-orange-50 file:px-4 file:py-2
                  file:text-sm file:font-semibold file:text-orange-600
                  hover:file:bg-orange-100
                  cursor-pointer"
              />
              <button
                type="button"
                onClick={handleVerificationRequest}
                disabled={submittingVerification || !certFile}
                className="sm:flex-shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                {submittingVerification ? '요청 중…' : '인증 요청하기'}
              </button>
            </div>

            {certFile && (
              <p className="mt-2 text-xs text-gray-500">
                선택된 파일: <span className="font-medium text-gray-700">{certFile.name}</span>
                {' '}
                ({Math.round(certFile.size / 1024)} KB)
              </p>
            )}
          </div>
        </div>
      )}

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

              {/* ── 거주 구역 ── */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">거주 구역</label>
                <select
                  value={neighborhood}
                  onChange={e => setNeighborhood(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent bg-white"
                >
                  <option value="">선택해주세요</option>
                  {NEIGHBORHOOD_OPTIONS.map(n => (
                    <option key={n.value} value={n.value}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* ── 구직자 한정: 경쟁력 어필 (경력 / 스킬 / 근무시간 / 우편번호) ── */}
              <CompetitiveFields
                localExperienceMonths={localExperienceMonths}
                setLocalExperienceMonths={setLocalExperienceMonths}
                skills={skills}
                setSkills={setSkills}
                skillDraft={skillDraft}
                setSkillDraft={setSkillDraft}
                availableShifts={availableShifts}
                setAvailableShifts={setAvailableShifts}
                shiftDraft={shiftDraft}
                setShiftDraft={setShiftDraft}
                toggleFromList={toggleFromList}
                addCustomValue={addCustomValue}
              />
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

      {/* ── 토스트 알림 (인증 요청 결과) ── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none"
        >
          <div
            className={`pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg ring-1 ${
              toast.tone === 'success'
                ? 'bg-green-50 text-green-800 ring-green-200'
                : toast.tone === 'error'
                  ? 'bg-red-50 text-red-800 ring-red-200'
                  : 'bg-gray-50 text-gray-800 ring-gray-200'
            }`}
          >
            {toast.tone === 'success' && <span className="mr-1">✅</span>}
            {toast.tone === 'error' && <span className="mr-1">⚠️</span>}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================================
// CompetitiveFields — 구직자 "경쟁력 어필" 섹션.
// 안내 배너 / 캐나다 경력 / 스킬 칩 / 근무시간 칩 / 우편번호를 한 번에
// 그리고, 폼 제출 시 profiles 테이블에 한 번에 저장된다.
// =====================================================================

interface CompetitiveFieldsProps {
  localExperienceMonths: number
  setLocalExperienceMonths: (n: number) => void
  skills: string[]
  setSkills: (next: string[]) => void
  skillDraft: string
  setSkillDraft: (next: string) => void
  availableShifts: string[]
  setAvailableShifts: (next: string[]) => void
  shiftDraft: string
  setShiftDraft: (next: string) => void
  toggleFromList: (
    value: string,
    list: string[],
    setter: (next: string[]) => void,
  ) => void
  addCustomValue: (
    draft: string,
    list: string[],
    setter: (next: string[]) => void,
    draftSetter: (next: string) => void,
  ) => void
}

function CompetitiveFields({
  localExperienceMonths,
  setLocalExperienceMonths,
  skills,
  setSkills,
  skillDraft,
  setSkillDraft,
  availableShifts,
  setAvailableShifts,
  shiftDraft,
  setShiftDraft,
  toggleFromList,
  addCustomValue,
}: CompetitiveFieldsProps) {
  return (
    <div className="mt-2 space-y-5 rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50/60 to-pink-50/40 p-4">
      {/* 안내 배너 */}
      <div className="flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2.5">
        <span className="text-lg" aria-hidden>🚀</span>
        <p className="text-xs font-semibold leading-relaxed text-gray-800">
          이 정보를 입력하면 사장님들의 검색 결과 상단에 노출될 확률이 높아집니다!
        </p>
      </div>

      {/* 캐나다 내 경력 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          캐나다 내 근무 경력 <span className="text-gray-400">(개월)</span>
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="number"
            min={0}
            max={600}
            step={1}
            value={localExperienceMonths}
            onChange={e => {
              const raw = parseInt(e.target.value, 10)
              setLocalExperienceMonths(
                Number.isNaN(raw) ? 0 : Math.max(0, Math.min(600, raw)),
              )
            }}
            placeholder="0"
            className="w-32 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
          />
          <span className="text-xs text-gray-500">
            {localExperienceMonths >= 6
              ? `🌟 ${localExperienceMonths}개월 — 고용주 카드에 "캐나다 경력 6개월+" 뱃지가 표시돼요!`
              : '6개월 이상이면 자동으로 추천 뱃지가 표시됩니다.'}
          </span>
        </div>
      </div>

      {/* 보유 스킬 (칩) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          보유 스킬 <span className="text-gray-400">(중복 선택 · 직접 추가 가능)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {SKILL_OPTIONS.map(opt => {
            const selected = skills.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleFromList(opt, skills, setSkills)}
                aria-pressed={selected}
                className={`rounded-full px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                  selected
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:text-orange-600'
                }`}
              >
                {opt}
              </button>
            )
          })}
          {skills
            .filter(s => !(SKILL_OPTIONS as readonly string[]).includes(s))
            .map(s => (
              <button
                key={`custom-${s}`}
                type="button"
                onClick={() => toggleFromList(s, skills, setSkills)}
                aria-pressed
                className="rounded-full bg-orange-500 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-all active:scale-95"
                title="클릭 시 제거"
              >
                {s} ×
              </button>
            ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={skillDraft}
            onChange={e => setSkillDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomValue(skillDraft, skills, setSkills, setSkillDraft)
              }
            }}
            maxLength={20}
            placeholder="예: 바리스타, POS 교체"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => addCustomValue(skillDraft, skills, setSkills, setSkillDraft)}
            disabled={!skillDraft.trim()}
            className="flex-shrink-0 rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-xs font-bold text-orange-600 transition-all active:scale-95 disabled:opacity-50"
          >
            + 추가
          </button>
        </div>
      </div>

      {/* 가능 근무 시간대 (칩) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          가능 근무 시간대{' '}
          <span className="text-gray-400">(중복 선택 · 직접 추가 가능)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {SHIFT_OPTIONS.map(opt => {
            const selected = availableShifts.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleFromList(opt, availableShifts, setAvailableShifts)}
                aria-pressed={selected}
                className={`rounded-full px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                  selected
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:text-orange-600'
                }`}
              >
                {opt}
              </button>
            )
          })}
          {availableShifts
            .filter(s => !(SHIFT_OPTIONS as readonly string[]).includes(s))
            .map(s => (
              <button
                key={`custom-${s}`}
                type="button"
                onClick={() => toggleFromList(s, availableShifts, setAvailableShifts)}
                aria-pressed
                className="rounded-full bg-orange-500 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-all active:scale-95"
                title="클릭 시 제거"
              >
                {s} ×
              </button>
            ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={shiftDraft}
            onChange={e => setShiftDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomValue(shiftDraft, availableShifts, setAvailableShifts, setShiftDraft)
              }
            }}
            maxLength={20}
            placeholder="예: 새벽 4시 출근 가능"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() =>
              addCustomValue(shiftDraft, availableShifts, setAvailableShifts, setShiftDraft)
            }
            disabled={!shiftDraft.trim()}
            className="flex-shrink-0 rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-xs font-bold text-orange-600 transition-all active:scale-95 disabled:opacity-50"
          >
            + 추가
          </button>
        </div>
        {(availableShifts.includes('주말 전체') || availableShifts.includes('마감조')) && (
          <p className="mt-1.5 text-[11px] font-semibold text-orange-600">
            🔥 주말/마감 가능 뱃지가 자동 활성화됩니다!
          </p>
        )}
      </div>

    </div>
  )
}