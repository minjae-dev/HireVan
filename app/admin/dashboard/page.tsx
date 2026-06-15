'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type Stats = {
  totalUsers: number
  totalEmployers: number
  totalSeekers: number
  totalJobs: number
  openJobs: number
  recentUsers: { id: string; name: string; role: string; created_at: string }[]
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const fetchStats = async () => {
      const [
        { count: totalUsers },
        { count: totalEmployers },
        { count: totalSeekers },
        { count: totalJobs },
        { count: openJobs },
        { data: recentUsers },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'employer'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'seeker'),
        supabase.from('job_posts').select('*', { count: 'exact', head: true }),
        supabase.from('job_posts').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabase
          .from('profiles')
          .select('id, name, role, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      setStats({
        totalUsers: totalUsers ?? 0,
        totalEmployers: totalEmployers ?? 0,
        totalSeekers: totalSeekers ?? 0,
        totalJobs: totalJobs ?? 0,
        openJobs: openJobs ?? 0,
        recentUsers: recentUsers ?? [],
      })
      setLoading(false)
      }

      await fetchStats()
    }
    init()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">HireVan 시스템 현황</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="전체 회원" value={stats?.totalUsers ?? 0} icon="👥" />
        <StatCard label="구인자 (Employer)" value={stats?.totalEmployers ?? 0} icon="🏢" />
        <StatCard label="구직자 (Seeker)" value={stats?.totalSeekers ?? 0} icon="🔍" />
        <StatCard label="전체 채용공고" value={stats?.totalJobs ?? 0} icon="💼" />
        <StatCard label="활성 채용공고" value={stats?.openJobs ?? 0} icon="✅" />
        <StatCard
          label="전환율"
          value={
            stats?.totalUsers
              ? `${((stats.totalEmployers / stats.totalUsers) * 100).toFixed(1)}%`
              : '0%'
          }
          icon="📈"
        />
      </div>

      {/* 최근 가입 회원 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">최근 가입 회원</h2>
          <Link
            href="/admin/members"
            className="text-sm text-orange-500 hover:text-orange-600 font-medium"
          >
            전체보기 →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-2 text-gray-500 font-medium">이름</th>
                <th className="text-left py-3 px-2 text-gray-500 font-medium">역할</th>
                <th className="text-left py-3 px-2 text-gray-500 font-medium">가입일</th>
              </tr>
            </thead>
            <tbody>
              {stats?.recentUsers.map((user) => (
                <tr key={user.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 px-2 font-medium text-gray-900">{user.name}</td>
                  <td className="py-3 px-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'employer'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-green-50 text-green-600'
                      }`}
                    >
                      {user.role === 'employer' ? '구인자' : '구직자'}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-gray-500">
                    {new Date(user.created_at).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
              {(!stats?.recentUsers || stats.recentUsers.length === 0) && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-gray-400">
                    가입한 회원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: number | string
  icon: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
      <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-xl shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}