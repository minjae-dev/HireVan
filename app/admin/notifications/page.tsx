'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sendBulkNotification, type BulkNotificationTarget } from '../actions'

type Notification = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  created_at: string
  read_at: string | null
}

export default function AdminNotificationsPage() {
  // ── 목록 상태 ──
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // ── 발송 폼 상태 ──
  const [target, setTarget] = useState<BulkNotificationTarget>('all')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // ── 토스트 ──
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // ── 데이터 조회 ──
  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, user_id, type, title, body, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error && data) {
      setNotifications(data as Notification[])
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      await fetchNotifications()
    }
    init()
    return () => { cancelled = true }
  }, [])

  // ── 고유 타입 목록 ──
  const types = ['all', ...Array.from(new Set(notifications.map((n) => n.type)))]

  // ── 필터링 ──
  const filteredNotifications = notifications.filter((n) => {
    const matchesType = filterType === 'all' || n.type === filterType
    const matchesSearch =
      !searchQuery ||
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.body && n.body.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesType && matchesSearch
  })

  // ── 발송 핸들러 ──
  const handleSend = async () => {
    if (!title.trim()) {
      setToast({ message: '제목을 입력해주세요.', type: 'error' })
      return
    }
    if (!body.trim()) {
      setToast({ message: '내용을 입력해주세요.', type: 'error' })
      return
    }

    setSending(true)
    try {
      const result = await sendBulkNotification({
        target,
        title: title.trim(),
        body: body.trim(),
        type: 'admin_broadcast',
      })

      if (result.success) {
        setToast({ message: result.message, type: 'success' })
        setTitle('')
        setBody('')
        setShowForm(false)
        // 목록 새로고침
        await fetchNotifications()
      } else {
        setToast({ message: result.message, type: 'error' })
      }
    } catch {
      setToast({ message: '알림 발송 중 오류가 발생했습니다.', type: 'error' })
    } finally {
      setSending(false)
    }
  }

  const targetLabels: Record<BulkNotificationTarget, string> = {
    all: '전체 회원',
    employer: '채용자만',
    seeker: '구직자만',
  }

  const typeColors: Record<string, string> = {
    admin_broadcast: 'bg-purple-50 text-purple-600',
    job_match: 'bg-blue-50 text-blue-600',
    seeker_match: 'bg-green-50 text-green-600',
    payment_failed: 'bg-red-50 text-red-600',
    subscription_canceled: 'bg-orange-50 text-orange-600',
    subscription_recovered: 'bg-green-50 text-green-600',
    grace_period_started: 'bg-yellow-50 text-yellow-600',
    grace_period_ended: 'bg-gray-100 text-gray-600',
    welcome_credit: 'bg-purple-50 text-purple-600',
  }

  return (
    <div className="space-y-6">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">알림 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            회원들에게 알림을 발송하고 발송 내역을 확인합니다. ({notifications.length}건)
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          <span>{showForm ? '▲ 닫기' : '🔔 알림 발송'}</span>
        </button>
      </div>

      {/* ── 토스트 ── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none"
        >
          <div
            className={`pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg ring-1 ${
              toast.type === 'success'
                ? 'bg-green-50 text-green-800 ring-green-200'
                : 'bg-red-50 text-red-800 ring-red-200'
            }`}
          >
            <span className="mr-1">{toast.type === 'success' ? '✅' : '⚠️'}</span>
            {toast.message}
          </div>
        </div>
      )}

      {/* ── 발송 폼 ── */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
          <h2 className="text-lg font-bold text-gray-900">알림 발송</h2>

          {/* 타겟 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              발송 대상
            </label>
            <div className="flex gap-2">
              {(Object.keys(targetLabels) as BulkNotificationTarget[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTarget(key)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    target === key
                      ? 'bg-orange-50 text-orange-600 ring-2 ring-orange-300'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {targetLabels[key]}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {target === 'all'
                ? '모든 회원에게 발송됩니다.'
                : target === 'employer'
                  ? '채용자(employer)에게만 발송됩니다.'
                  : '구직자(seeker)에게만 발송됩니다.'}
            </p>
          </div>

          {/* 제목 */}
          <div>
            <label htmlFor="notif-title" className="block text-sm font-medium text-gray-700 mb-1.5">
              제목
            </label>
            <input
              id="notif-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 서비스 점검 안내"
              maxLength={100}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          {/* 내용 */}
          <div>
            <label htmlFor="notif-body" className="block text-sm font-medium text-gray-700 mb-1.5">
              내용
            </label>
            <textarea
              id="notif-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="회원들에게 전달할 내용을 입력하세요."
              rows={4}
              maxLength={500}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{body.length}/500</p>
          </div>

          {/* 발송 버튼 */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !title.trim() || !body.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              {sending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  발송 중...
                </>
              ) : (
                '🔔 발송하기'
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-6 py-3 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* ── 필터 & 검색 ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text"
            placeholder="제목 또는 내용으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {type === 'all' ? '전체 타입' : type}
            </option>
          ))}
        </select>
      </div>

      {/* ── 알림 목록 ── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">알림을 불러오는 중...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">타입</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">제목</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">내용</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">읽음</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">발송일</th>
                </tr>
              </thead>
              <tbody>
                {filteredNotifications.map((notification) => (
                  <tr
                    key={notification.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          typeColors[notification.type] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {notification.type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900 max-w-[200px] truncate">
                        {notification.title}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-gray-600 max-w-[250px] truncate">
                        {notification.body || ''}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {notification.read_at ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600">
                          읽음
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
                          안 읽음
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {new Date(notification.created_at).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                ))}
                {filteredNotifications.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-400">
                      {searchQuery || filterType !== 'all'
                        ? '검색 결과가 없습니다.'
                        : '알림이 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}