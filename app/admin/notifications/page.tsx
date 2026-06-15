'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

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
    const init = async () => {
      await fetchNotifications()
    }
    init()
  }, [])

  // 고유 타입 목록
  const types = ['all', ...Array.from(new Set(notifications.map((n) => n.type)))]

  const filteredNotifications = notifications.filter((n) => {
    const matchesType = filterType === 'all' || n.type === filterType
    const matchesSearch =
      !searchQuery ||
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.body && n.body.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesType && matchesSearch
  })

  const typeColors: Record<string, string> = {
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">알림 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          시스템에서 발송된 알림 목록입니다. ({notifications.length}건)
        </p>
      </div>

      {/* 필터 & 검색 */}
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

      {/* 알림 목록 */}
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