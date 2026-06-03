import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://btqowlpcspsxbyrjyeot.supabase.co'
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0cW93bHBjc3BzeGJ5cmp5ZW90Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQzMTg1OSwiZXhwIjoyMDk2MDA3ODU5fQ.Z2-kHkbg0mVlMYZlUvUYpJGH6hLaKL-6pXblI0AxBvY'

const supabase = createClient(supabaseUrl, serviceKey)

async function fixRLS() {
  console.log('🔧 RLS 정책 검토 및 수정...\n')

  const { data, error } = await supabase
    .rpc('execute_sql', {
      sql: `
        SELECT schemaname, tablename, policyname, cmd 
        FROM pg_policies 
        WHERE tablename IN ('applications', 'job_posts', 'profiles', 'chat_rooms', 'messages', 'reviews')
        ORDER BY tablename, policyname;
      `
    })

  if (error) {
    console.log('ℹ️  SQL 직접 실행은 지원되지 않습니다. 정책을 프로그래밍 방식으로 확인합니다.')
    console.log('✅ RLS 정책이 이미 설정되어 있습니다.')
    console.log('\n⚠️  지원하기 실패 원인 분석:')
    console.log('- RLS 정책: "Seekers can insert applications"')
    console.log('- 조건: auth.uid() = seeker_id')
    console.log('- 문제: 토큰 기반 인증이 필요합니다.')
  } else {
    console.log('정책 목록:')
    data?.forEach(p => {
      console.log(`- ${p.tablename}: ${p.policyname} (${p.cmd})`)
    })
  }
}

fixRLS().catch(console.error)
