'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { updateJobStatus } from '../actions'

type Job = {
  id: string
  title: string
  location: string
  category: string
  salary: string
  status: 'open' | 'closed' | 'pending_activation'
  employer_id: string
  created_at: string
}

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'closed' | 'pending_activation'>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fetchJobs = async () => {
    const { data, error } = await supabase
      .from('job_posts')
      .select('id, title, location, category, salary, status, employer_id, created_at')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setJobs(data as Job[])
    }
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      await fetchJobs()
    }
    init()
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const handleToggleStatus = async (job: Job) => {
    const newStatus = job.status === 'open' ? 'closed' : 'open'
    setActionLoading(job.id)
    const result = await updateJobStatus(job.id, newStatus)
    if (result.success) {
      setToast({ message: result.message, type: 'success' })
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status: newStatus } : j))
      )
    } else {
      setToast({ message: result.message, type: 'error' })
    }
    setActionLoading(null)
  }

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      !searchQuery ||
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = filterStatus === 'all' || job.status === filterStatus
    return matchesSearch && matchesStatus
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
        <h1 className="text-2xl font-bold text-gray-900">채용 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          전체 채용공고를 관리합니다. ({jobs.length}개)
        </p>
      </div>

      {/* 필터 & 검색 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text"
            placeholder="제목 또는 장소로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'all' | 'open' | 'closed' | 'pending_activation')}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <option value="all">전체 상태</option>
          <option value="open">활성</option>
          <option value="pending_activation">대기 활성화</option>
          <option value="closed">마감</option>
        </select>
      </div>

      {/* 채용공고 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">채용공고를 불러오는 중...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">제목</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">장소</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">카테고리</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">급여</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">상태</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">등록일</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900 max-w-[200px] truncate">
                        {job.title}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{job.location}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {job.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{job.salary}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          job.status === 'open'
                            ? 'bg-green-50 text-green-600'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {job.status === 'open' || job.status === 'pending_activation' ? '활성' : '마감'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {new Date(job.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleStatus(job)}
                          disabled={actionLoading === job.id}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            job.status === 'open'
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-green-50 text-green-600 hover:bg-green-100'
                          } disabled:opacity-50`}
                        >
                          {job.status === 'open' ? '마감 처리' : '활성화'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredJobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      {searchQuery || filterStatus !== 'all'
                        ? '검색 결과가 없습니다.'
                        : '채용공고가 없습니다.'}
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