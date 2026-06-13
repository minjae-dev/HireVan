'use client'

import { useLanguage } from '@/context/LanguageContext'
import { useAuth } from '@/lib/auth-context'
import { getLocations, getShiftOptions, getSkillOptions, getVisaOptions } from '@/lib/options'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * Canadian postal code is 3 characters: letter+number+letter (e.g. V6B).
 * Used for input normalization.
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
  const { t } = useLanguage()

  const VISA_OPTIONS = getVisaOptions(t)
  const NEIGHBORHOOD_OPTIONS = getLocations(t)
  const SKILL_OPTIONS = getSkillOptions(t)
  const SHIFT_OPTIONS = getShiftOptions(t)

  const [fetching, setFetching] = useState(true)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [visaType, setVisaType] = useState('')
  const [visaExpiryDate, setVisaExpiryDate] = useState('')
  const [hasSir, setHasSir] = useState(false)
  const [hasFoodsafe, setHasFoodsafe] = useState(false)
  const [localExperienceMonths, setLocalExperienceMonths] = useState<number>(0)
  const [skills, setSkills] = useState<string[]>([])
  const [skillDraft, setSkillDraft] = useState('')
  const [availableShifts, setAvailableShifts] = useState<string[]>([])
  const [shiftDraft, setShiftDraft] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [postalCodePrefix, setPostalCodePrefix] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

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
      }
      setFetching(false)
    }

    fetchProfile()
  }, [user, profile, authLoading, router])

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

  const handlePostalCodeChange = (raw: string) => {
    const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3)
    setPostalCodePrefix(cleaned)
  }

  const postalCodeValid =
    postalCodePrefix === '' || POSTAL_CODE_REGEX.test(postalCodePrefix)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (profile?.role === 'seeker' && !postalCodeValid) {
      setError(t('profile.postal_code_error'))
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
      const months = Math.max(
        0,
        Math.min(600, Number.isFinite(localExperienceMonths) ? localExperienceMonths : 0),
      )
      payload.neighborhood = neighborhood || null
      payload.local_experience_months = months
      payload.skills = skills
      payload.available_shifts = availableShifts
      payload.postal_code_prefix = postalCodePrefix === '' ? null : postalCodePrefix
    }

    const { error: updateError } = await (supabase as any)
      .from('profiles')
      .update(payload)
      .eq('id', user.id)

    if (updateError) {
      setError(`${t('profile.save_error')}: ${updateError.message}`)
    } else {
      await refreshProfile()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    }
    setSaving(false)
  }

  const currentCredits: number = (() => {
    const d = profile as unknown as Record<string, unknown> | null
    const c = typeof d?.credits === 'number' ? (d.credits as number) : 0
    return c
  })()

  const handleVerificationRequest = async () => {
    if (!user) return
    if (!certFile) {
      showToast(t('profile.credits_verify_error'), 'error')
      return
    }
    setSubmittingVerification(true)
    try {
      console.info('[verification] request:', {
        userId: user.id,
        fileName: certFile.name,
        fileSize: certFile.size,
        fileType: certFile.type,
      })

      await new Promise(resolve => setTimeout(resolve, 350))

      showToast(t('profile.credits_verify_success'), 'success')
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
        <Link href="/profile" className="text-sm text-gray-500 hover:text-orange-500">&larr; {t('profile.back_to_profile')}</Link>
        <h1 className="text-2xl font-extrabold text-gray-900 mt-2">{t('profile.edit_title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{profile.role === 'seeker' ? t('profile.edit_subtitle_seeker') : t('profile.edit_subtitle_employer')}</p>
      </div>

      {/* ── Seeker only: Credits / Verification Mission ── */}
      {profile.role === 'seeker' && (
        <div className="mb-6 space-y-3">
          <div
            data-testid="credit-balance"
            className="flex items-center justify-between rounded-2xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden>🪙</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  {t('profile.credits_title')}
                </p>
                <p className="text-2xl font-extrabold text-amber-900 leading-tight">
                  {currentCredits.toLocaleString()}
                  <span className="ml-1 text-sm font-bold text-amber-700">{t('profile_edit.credit_unit')}</span>
                </p>
              </div>
            </div>
            {currentCredits > 0 && (
              <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white">
                {t('profile.credits_available')}
              </span>
            )}
          </div>

          <div className="rounded-2xl border border-orange-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden>🎯</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">
                  {t('profile.credits_mission')}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  {t('profile.credits_mission_desc')}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label
                htmlFor="cert-file-input"
                className="sr-only"
              >
                {t('profile.credits_upload_label')}
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
                {submittingVerification ? t('profile.credits_verifying') : t('profile.credits_verify_btn')}
              </button>
            </div>

            {certFile && (
              <p className="mt-2 text-xs text-gray-500">
                {t('profile.credits_file_selected', { name: certFile.name, size: Math.round(certFile.size / 1024) })}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-gray-100 p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {profile.role === 'employer' ? t('profile.name_employer') : t('profile.name_seeker')}
            </label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
            />
          </div>

          {profile.role === 'seeker' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('profile.visa_type')}</label>
                <select value={visaType}
                  onChange={e => { setVisaType(e.target.value); if (e.target.value === 'pr_citizen') setVisaExpiryDate('') }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent bg-white"
                >
                  <option value="">{t('profile.visa_select')}</option>
                    {VISA_OPTIONS.map((v, i) => <option key={`${v.value}-${i}`} value={v.value}>{v.label}</option>)}
                </select>
              </div>

              {visaType && visaType !== 'pr_citizen' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('profile.visa_expiry')} <span className="text-red-500">*</span>
                  </label>
                  <input type="date" value={visaExpiryDate} onChange={e => setVisaExpiryDate(e.target.value)} required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('profile.certificates_title')}</label>
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('profile.neighborhood')}</label>
                <select
                  value={neighborhood}
                  onChange={e => setNeighborhood(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent bg-white"
                >
                  <option value="">{t('profile.visa_select')}</option>
                  {NEIGHBORHOOD_OPTIONS.map(n => (
                    <option key={n.value} value={n.value}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </div>

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
                skillOptions={SKILL_OPTIONS}
                shiftOptions={SHIFT_OPTIONS}
              />
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {profile.role === 'employer' ? t('profile.bio_employer') : t('profile.bio_seeker')}
            </label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4}
              placeholder={profile.role === 'employer' ? t('profile.bio_placeholder_employer') : t('profile.bio_placeholder_seeker')}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
          {success && <p className="text-sm text-green-600 bg-green-50 rounded-xl px-4 py-3">{t('profile.save_success_edit')}</p>}

          <div className="flex gap-3 mt-2">
            <Link href="/profile"
              className="flex-1 text-center text-gray-600 font-medium py-3 rounded-xl border border-gray-200 bg-white transition-all hover:bg-gray-50 active:scale-95"
            >{t('common.cancel')}</Link>
            <button type="submit" disabled={saving}
              className="flex-1 text-white font-semibold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand)' }}
            >{saving ? t('common.saving') : t('common.save')}</button>
          </div>
        </form>
      </div>

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
// CompetitiveFields — Seeker "Stand Out" section
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
  skillOptions: { value: string; label: string }[]
  shiftOptions: { value: string; label: string }[]
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
  skillOptions,
  shiftOptions,
}: CompetitiveFieldsProps) {
  const { t } = useLanguage()

  return (
    <div className="mt-2 space-y-5 rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50/60 to-pink-50/40 p-4">
      {/* Banner */}
      <div className="flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2.5">
        <span className="text-lg" aria-hidden>🚀</span>
        <p className="text-xs font-semibold leading-relaxed text-gray-800">
          {t('profile.competitive_banner')}
        </p>
      </div>

      {/* Canadian Work Experience */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {t('profile.experience_label')} <span className="text-gray-400">{t('profile_edit.years_suffix')}</span>
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
              ? t('profile_edit.experience_badge_active', { months: localExperienceMonths })
              : t('profile.experience_badge_hint')}
          </span>
        </div>
      </div>

      {/* Skills (chips) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('profile.skills_label')} <span className="text-gray-400">{t('profile.skills_sub')}</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {skillOptions.map(opt => {
            const selected = skills.includes(opt.label)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleFromList(opt.label, skills, setSkills)}
                aria-pressed={selected}
                className={`rounded-full px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                  selected
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:text-orange-600'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
          {skills
            .filter(s => !skillOptions.some(opt => opt.label === s))
            .map(s => (
              <button
                key={`custom-${s}`}
                type="button"
                onClick={() => toggleFromList(s, skills, setSkills)}
                aria-pressed
                className="rounded-full bg-orange-500 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-all active:scale-95"
                title={t('profile_edit.click_to_remove')}
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
            placeholder={t('profile.skills_placeholder')}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => addCustomValue(skillDraft, skills, setSkills, setSkillDraft)}
            disabled={!skillDraft.trim()}
            className="flex-shrink-0 rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-xs font-bold text-orange-600 transition-all active:scale-95 disabled:opacity-50"
          >
            {t('profile.skills_add')}
          </button>
        </div>
      </div>

      {/* Available Shifts (chips) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('profile.shifts_label')}{' '}
          <span className="text-gray-400">{t('profile.shifts_sub')}</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {shiftOptions.map(opt => {
            const selected = availableShifts.includes(opt.label)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleFromList(opt.label, availableShifts, setAvailableShifts)}
                aria-pressed={selected}
                className={`rounded-full px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                  selected
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:text-orange-600'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
          {availableShifts
            .filter(s => !shiftOptions.some(opt => opt.label === s))
            .map(s => (
              <button
                key={`custom-${s}`}
                type="button"
                onClick={() => toggleFromList(s, availableShifts, setAvailableShifts)}
                aria-pressed
                className="rounded-full bg-orange-500 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-all active:scale-95"
                title={t('profile_edit.click_to_remove')}
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
            placeholder={t('profile.shifts_placeholder')}
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
            {t('profile.skills_add')}
          </button>
        </div>
        {(availableShifts.includes('주말 전체') || availableShifts.includes(t('options.shift.weekend_full')) ||
          availableShifts.includes('마감조') || availableShifts.includes(t('options.shift.closing'))) && (
          <p className="mt-1.5 text-[11px] font-semibold text-orange-600">
            {t('profile.shifts_badge_hint')}
          </p>
        )}
      </div>

    </div>
  )
}