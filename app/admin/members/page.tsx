'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toggleAdminStatus, deleteUser } from '../actions'

type Member = {
  id: string
  name: string
  role: string
  is_admin: boolean
  created_at: string
}

export default function AdminMembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRole, setFilterRole] = useState<'all' | 'employer' | 'seeker'>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role, is_admin, created_at')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setMembers(data as Member[])
    }
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      await fetchMembers()
    }
    init()
  }, [])

  // 토스트 메시지 자동 사라지기
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const handleToggleAdmin = async (member: Member) => {
    setActionLoading(member.id)
    const result = await toggleAdminStatus(member.id, !member.is_admin)
    if (result.success) {
      setToast({ message: result.message, type: 'success' })
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, is_admin: !m.is_admin } : m))
      )
    } else {
      setToast({ message: result.message, type: 'error' })
    }
    setActionLoading(null)
  }

  const handleDeleteUser = async (member: Member) => {
    if (!confirm(`정말로 "${member.name}" 회원을 탈퇴시키겠습니까?`)) return

    setActionLoading(member.id)
    const result = await deleteUser(member.id)
    if (result.success) {
      setToast({ message: result.message, type: 'success' })
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
    } else {
      setToast({ message: result.message, type: 'error' })
    }
    setActionLoading(null)
  }

  // 필터링된 회원 목록
  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      !searchQuery ||
      member.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = filterRole === 'all' || member.role === filterRole
    return matchesSearch && matchesRole
  })

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">회원 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          전체 회원 목록을 관리합니다. ({members.length}명)
        </p>
      </div>

      {/* 필터 & 검색 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text"
            placeholder="이름으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as 'all' | 'employer' | 'seeker')}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <option value="all">전체 역할</option>
          <option value="employer">구인자</option>
          <option value="seeker">구직자</option>
        </select>
      </div>

      {/* 회원 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">회원 데이터를 불러오는 중...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">이름</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">역할</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">관리자</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">가입일</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr
                    key={member.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{member.name}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          member.role === 'employer'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-green-50 text-green-600'
                        }`}
                      >
                        {member.role === 'employer' ? '구인자' : '구직자'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          member.is_admin
                            ? 'bg-purple-50 text-purple-600'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {member.is_admin ? '관리자' : '일반'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {new Date(member.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleAdmin(member)}
                          disabled={actionLoading === member.id}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            member.is_admin
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                          } disabled:opacity-50`}
                        >
                          {member.is_admin ? '권한 회수' : '관리자 부여'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(member)}
                          disabled={actionLoading === member.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-all disabled:opacity-50"
                        >
                          탈퇴
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredMembers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-400">
                      {searchQuery || filterRole !== 'all'
                        ? '검색 결과가 없습니다.'
                        : '회원이 없습니다.'}
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