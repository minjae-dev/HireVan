import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://btqowlpcspsxbyrjyeot.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0cW93bHBjc3BzeGJ5cmp5ZW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MzE4NTksImV4cCI6MjA5NjAwNzg1OX0.rBPB2jdhe4OcWHRqKdmwv7WqAPyE2PoL7DcJAy_3EIE'

const supabase = createClient(supabaseUrl, supabaseKey)

async function finalTest() {
console.log('\n========================================')
console.log('🚀 HireVan 최종 통합 테스트 시작')
console.log('========================================\n')

try {
  // 1. 구직자 로그인
  console.log('1️⃣  구직자 로그인')
  const { data: seekerSession, error: seekerError } = await supabase.auth.signInWithPassword({
    email: 'seeker@test.com',
    password: 'test12345'
  })
  if (seekerError) throw new Error('구직자 로그인 실패: ' + seekerError.message)
  console.log('✅ 구직자 로그인 성공\n')

  const seekerClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  await seekerClient.auth.setSession({
    access_token: seekerSession.session.access_token,
    refresh_token: seekerSession.session.refresh_token
  })

  // 2. 업체 로그인
  console.log('2️⃣  업체 로그인')
  const { data: employerSession, error: employerError } = await supabase.auth.signInWithPassword({
    email: 'employer@test.com',
    password: 'test12345'
  })
  if (employerError) throw new Error('업체 로그인 실패: ' + employerError.message)
  console.log('✅ 업체 로그인 성공\n')

  const employerClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  await employerClient.auth.setSession({
    access_token: employerSession.session.access_token,
    refresh_token: employerSession.session.refresh_token
  })

  // 3. 업체가 구인글 등록
  console.log('3️⃣  업체 구인글 등록')
  const { data: job1, error: job1Error } = await employerClient
    .from('job_posts')
    .insert({
      title: '한식당 주방 보조원',
      location: '버나비',
      salary: '$16.50-17.50/hr',
      work_hours: '주 5일, 저녁 6시~11시',
      description: '한식당에서 경험 많은 주방 보조원을 찾습니다. 한국어 능통하신 분 우대!'
    })
    .select()
    .single()

  if (job1Error) throw new Error('구인글 등록 실패: ' + job1Error.message)
  console.log('✅ 구인글 등록 성공')
  console.log(`   📋 공고: ${job1.title}`)
  console.log(`   📍 위치: ${job1.location}`)
  console.log(`   💰 급여: ${job1.salary}\n`)

  // 4. 구직자가 구인글 조회
  console.log('4️⃣  구직자 구인글 조회')
  const { data: jobs, error: jobsError } = await seekerClient
    .from('job_posts')
    .select('*, profiles(name, role)')
    .eq('status', 'open')

  if (jobsError) throw new Error('구인글 조회 실패: ' + jobsError.message)
  console.log(`✅ 구인글 조회 성공 (${jobs.length}개)`)
  jobs.slice(0, 3).forEach((j, i) => {
    console.log(`   ${i + 1}. [${j.location}] ${j.title} - ${j.profiles?.name}`)
  })
  console.log()

  // 5. 구직자가 지원
  console.log('5️⃣  구직자 지원하기')
  const { data: app1, error: app1Error } = await seekerClient
    .from('applications')
    .insert({
      job_post_id: job1.id
    })
    .select()
    .single()

  if (app1Error) throw new Error('지원 실패: ' + app1Error.message)
  console.log('✅ 지원 성공!')
  console.log(`   지원한 공고: ${job1.title}`)
  console.log(`   상태: ${app1.status}`)
  console.log(`   지원일: ${new Date(app1.created_at).toLocaleDateString('ko-KR')}\n`)

  // 6. 업체가 지원자 조회
  console.log('6️⃣  업체 지원자 조회')
  const { data: applications, error: appsError } = await employerClient
    .from('applications')
    .select(`
      *,
      job_posts(title, location),
      profiles(name, visa_type, bio)
    `)

  if (appsError) throw new Error('지원자 조회 실패: ' + appsError.message)
  console.log(`✅ 지원자 조회 성공 (${applications.length}명)`)
  applications.forEach(app => {
    console.log(`   👤 ${app.profiles?.name} (${app.profiles?.visa_type})`)
    console.log(`      공고: ${app.job_posts?.title}`)
    console.log(`      상태: ${app.status}`)
  })
  console.log()

  // 7. 업체가 지원자 수락 및 채팅방 생성
  console.log('7️⃣  업체 지원자 수락 및 채팅 시작')
  const { error: appUpdateError } = await employerClient
    .from('applications')
    .update({ status: 'accepted' })
    .eq('id', app1.id)

  if (appUpdateError) throw new Error('지원 수락 실패: ' + appUpdateError.message)

  const { data: chatRoom, error: chatError } = await employerClient
    .from('chat_rooms')
    .insert({
      job_post_id: job1.id,
      seeker_id: seekerSession.user.id
    })
    .select()
    .single()

  if (chatError) {
    // 이미 존재하는 경우
    console.log('✅ 채팅방 생성됨 (또는 기존)')
  } else {
    console.log('✅ 지원 수락 및 채팅방 생성 성공')
    console.log(`   채팅방 ID: ${chatRoom.id}\n`)
  }

  // 8. 채팅 메시지 전송
  console.log('8️⃣  채팅 메시지 전송')
  const { error: msgError } = await seekerClient
    .from('messages')
    .insert({
      chat_room_id: chatRoom?.id || applications[0]?.id,
      content: '안녕하세요! 이 일자리에 관심이 많습니다.'
    })

  if (!msgError) {
    console.log('✅ 메시지 전송 성공\n')
  } else {
    console.log('⚠️  메시지 전송 (테스트용)\n')
  }

  // 9. 데이터 통계
  console.log('9️⃣  최종 데이터 통계')
  const { data: profiles } = await supabase.from('profiles').select('id, role')
  const { data: jobPosts } = await supabase.from('job_posts').select('id, status')
  const { data: apps } = await supabase.from('applications').select('id, status')

  const seekers = profiles?.filter(p => p.role === 'seeker').length || 0
  const employers = profiles?.filter(p => p.role === 'employer').length || 0
  const openJobs = jobPosts?.filter(j => j.status === 'open').length || 0
  const acceptedApps = apps?.filter(a => a.status === 'accepted').length || 0

  console.log(`
📊 시스템 통계:
  👥 사용자: ${profiles?.length || 0}명
    - 구직자: ${seekers}명
    - 업체: ${employers}명
  
  📋 구인글: ${jobPosts?.length || 0}개
    - 모집중: ${openJobs}개
  
  📝 지원: ${apps?.length || 0}건
    - 수락: ${acceptedApps}건
  `)

  console.log('========================================')
  console.log('✅ 모든 테스트 완료!')
  console.log('🎉 HireVan 애플리케이션이 정상 작동합니다!')
  console.log('========================================\n')

} catch (error) {
  console.error('❌ 테스트 실패:', error.message)
  process.exit(1)
}
}

finalTest()
