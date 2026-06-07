'use client'

import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

type AuthType = 'seeker' | 'employer'

const COPY: Record<AuthType, { emoji: string; title: string; desc: string; accent: string; soft: string; cta: string }> = {
  seeker: {
    emoji: '🧑‍🍳',
    title: '구직자로 가입하기',
    desc: '간단한 정보만 입력하면 가입 완료!',
    accent: '#FF6B35',
    soft: '#FFF0EB',
    cta: '구직자 가입하기',
  },
  employer: {
    emoji: '🏪',
    title: '채용자로 가입하기',
    desc: '가게 정보로 간단하게 가입하세요.',
    accent: '#2563EB',
    soft: '#EFF6FF',
    cta: '채용자 가입하기',
  },
}

function AuthInner() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawType = searchParams.get('type')
  const type: AuthType = rawType === 'employer' ? 'employer' : 'seeker'
  const copy = COPY[type]

  const [formData, setFormData] = useState({
    nameOrShop: '', // 이름 또는 업체명
    email: '',
    password: '',
  })

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); // 폼 제출 시 페이지 새로고침 방지

    if (!formData.nameOrShop || !formData.email || !formData.password) {
      alert('모든 정보를 입력해주세요.')
      return
    }

    try {
      setLoading(true); // 로딩 상태 시작 (필요 시)

      // 1. Supabase Auth 회원가입 호출
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            nameOrShop: formData.nameOrShop,
            type: type, // 'employer' 또는 'seeker'
          },
        },
      });

      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('회원가입에 실패했습니다.');

      console.log('가입 성공:', data);
      alert(`${type === 'employer' ? '사장님' : '구직자'}님, 환영합니다!`);

      router.push('/login');
      
    } catch (error: any) {
      console.error('가입 에러:', error);
      alert(error.message || '가입 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false); // 로딩 상태 종료
    }
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mb-6" style={{ backgroundColor: copy.soft }}>{copy.emoji}</div>
      <h1 className="text-2xl font-extrabold mb-2">{copy.title}</h1>
      <p className="text-gray-500 mb-8">{copy.desc}</p>

      <div className="w-full max-w-sm space-y-3">
        <input 
          placeholder={type === 'employer' ? '업체명' : '이름'} 
          className="w-full p-4 rounded-2xl border"
          onChange={(e) => setFormData({...formData, nameOrShop: e.target.value})}
        />
        <input 
          type="email" placeholder="이메일(example@email.com)"
          required
          className="w-full p-4 rounded-2xl border"
          onChange={(e) => setFormData({...formData, email: e.target.value})}
        />
        <input 
          type="password"
          minLength={6}
          placeholder="비밀번호(6자 이상 입력해주세요)"
          className="w-full p-4 rounded-2xl border"
          onChange={(e) => setFormData({...formData, password: e.target.value})}
        />
      </div>

      <button
        onClick={handleSignUp}
        className="w-full max-w-sm mt-6 py-4 rounded-2xl text-white font-bold"
        style={{ backgroundColor: copy.accent }}
      >
        {copy.cta}
      </button>

      <Link href="/" className="mt-6 text-sm text-gray-400">← 처음으로 돌아가기</Link>
    </div>
  )
}

export default function AuthPage() {
  return <Suspense fallback={<div>Loading...</div>}><AuthInner /></Suspense>
}