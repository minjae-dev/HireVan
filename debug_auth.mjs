import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://btqowlpcspsxbyrjyeot.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0cW93bHBjc3BzeGJ5cmp5ZW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MzE4NTksImV4cCI6MjA5NjAwNzg1OX0.rBPB2jdhe4OcWHRqKdmwv7WqAPyE2PoL7DcJAy_3EIE'

const supabase = createClient(supabaseUrl, supabaseKey)

async function debug() {
  console.log('🔍 인증 디버깅\n')

  // 업체 로그인
  const { data: employerSession } = await supabase.auth.signInWithPassword({
    email: 'employer@test.com',
    password: 'test12345'
  })

  console.log('업체 정보:')
  console.log('  ID:', employerSession.user.id)
  console.log('  Email:', employerSession.user.email)
  console.log()

  const employerClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  await employerClient.auth.setSession({
    access_token: employerSession.session.access_token,
    refresh_token: employerSession.session.refresh_token
  })

  // 업체의 프로필 확인
  console.log('프로필 데이터:')
  const { data: profile } = await employerClient
    .from('profiles')
    .select('*')
    .eq('role', 'employer')
    .single()

  console.log('  ID:', profile?.id)
  console.log('  Name:', profile?.name)
  console.log('  Role:', profile?.role)
  console.log()

  // 직접 INSERT 시도
  console.log('구인글 INSERT 시도:')
  console.log('  employer_id를 프로필 ID로 설정:', profile?.id)

  const { data, error } = await employerClient
    .from('job_posts')
    .insert({
      employer_id: profile?.id,
      title: '테스트 공고',
      location: '다운타운',
      salary: '$17/hr'
    })
    .select()

  if (error) {
    console.log('  ❌ 실패:', error.message)
    console.log('  에러 상세:', error.details)
  } else {
    console.log('  ✅ 성공!')
    console.log('  데이터:', data)
  }
}

debug().catch(console.error)
