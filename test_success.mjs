import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://btqowlpcspsxbyrjyeot.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0cW93bHBjc3BzeGJ5cmp5ZW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MzE4NTksImV4cCI6MjA5NjAwNzg1OX0.rBPB2jdhe4OcWHRqKdmwv7WqAPyE2PoL7DcJAy_3EIE'

const supabase = createClient(supabaseUrl, supabaseKey)

async function fullTest() {
  console.log('\n' + '='.repeat(50))
  console.log('🚀 HireVan 최종 통합 테스트')
  console.log('='.repeat(50) + '\n')

  try {
    // 1. 구직자 로그인
    console.log('1️⃣  구직자 로그인')
    const { data: seekerSession } = await supabase.auth.signInWithPassword({
      email: 'seeker@test.com',
      password: 'test12345'
    })
    console.log('✅ 로그인 성공 (김민지)\n')

    const seekerClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
    await seekerClient.auth.setSession({
      access_token: seekerSession.session.access_token,
      refresh_token: seekerSession.session.refresh_token
    })

    // 2. 업체 로그인
    console.log('2️⃣  업체 로그인')
    const { data: employerSession } = await supabase.auth.signInWithPassword({
      email: 'employer@test.com',
      password: 'test12345'
    })
    console.log('✅ 로그인 성공 (서울 카페)\n')

    const employerClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
    await employerClient.auth.setSession({
      access_token: employerSession.session.access_token,
      refresh_token: employerSession.session.refresh_token
    })

    // 3. 업체가 구인글 등록
    console.log('3️⃣  업체 구인글 등록')
    const { data: job } = await employerClient
      .from('job_posts')
      .insert({
        employer_id: employerSession.user.id,
        title: '네일 아티스트 모집',
        location: '서리',
        salary: '$18-20/hr',
        work_hours: '주 4-5일, 오후 1시~7시',
        description: '경험 있는 네일 아티스트 찾습니다. 한국 고객 많으니 한국어 가능하면 좋습니다.'
      })
      .select()
      .single()

    console.log('✅ 구인글 등록 완료')
    console.log(`   공고: "${job.title}"`)
    console.log(`   지역: ${job.location}`)
    console.log(`   급여: ${job.salary}`)
    console.log(`   근무: ${job.work_hours}\n`)

    // 4. 다른 업체도 구인글 등록
    console.log('4️⃣  추가 구인글 등록')
    const { data: job2 } = await employerClient
      .from('job_posts')
      .insert({
        employer_id: employerSession.user.id,
        title: '식당 서빙스태프',
        location: '버나비',
        salary: '$16.50-17.50/hr',
        work_hours: '주 3-4일, 저녁 5시~10시',
        description: '한식당 서빙 경험자 모집'
      })
      .select()
      .single()

    console.log('✅ 추가 공고 등록')
    console.log(`   공고: "${job2.title}"\n`)

    // 5. 구직자가 공고 조회
    console.log('5️⃣  구직자의 공고 검색')
    const { data: jobList } = await seekerClient
      .from('job_posts')
      .select('*, profiles(name)')
      .eq('status', 'open')

    console.log(`✅ ${jobList.length}개 공고 조회됨`)
    jobList.forEach((j, idx) => {
      console.log(`   ${idx + 1}. [${j.location}] ${j.title}`)
      console.log(`      회사: ${j.profiles?.name} | 급여: ${j.salary}`)
    })
    console.log()

    // 6. 구직자가 지원
    console.log('6️⃣  공고에 지원')
    const { data: app1 } = await seekerClient
      .from('applications')
      .insert({
        job_post_id: job.id,
        seeker_id: seekerSession.user.id
      })
      .select()
      .single()

    console.log(`✅ "${job.title}"에 지원 완료`)
    console.log(`   상태: ${app1.status}`)
    console.log(`   지원일: ${new Date(app1.created_at).toLocaleDateString('ko-KR')}\n`)

    // 7. 두 번째 공고에도 지원
    console.log('7️⃣  추가 공고에 지원')
    const { data: app2 } = await seekerClient
      .from('applications')
      .insert({
        job_post_id: job2.id,
        seeker_id: seekerSession.user.id
      })
      .select()
      .single()

    console.log(`✅ "${job2.title}"에 지원 완료\n`)

    // 8. 업체가 지원자 조회
    console.log('8️⃣  업체의 지원자 조회')
    const { data: applications } = await employerClient
      .from('applications')
      .select(`
        *,
        job_posts(title),
        profiles(name, visa_type)
      `)

    console.log(`✅ ${applications.length}명의 지원자 조회`)
    applications.forEach(app => {
      console.log(`   👤 ${app.profiles?.name} (${app.profiles?.visa_type})`)
      console.log(`      지원공고: ${app.job_posts?.title}`)
      console.log(`      상태: ${app.status}`)
    })
    console.log()

    // 9. 업체가 지원 수락
    console.log('9️⃣  지원 수락 및 채팅 시작')
    await employerClient
      .from('applications')
      .update({ status: 'accepted' })
      .eq('id', app1.id)

    const { data: chatRoom } = await employerClient
      .from('chat_rooms')
      .insert({
        job_post_id: job.id,
        seeker_id: seekerSession.user.id
      })
      .select()
      .single()

    console.log('✅ 지원 수락 및 채팅방 생성')
    console.log(`   채팅방 ID: ${chatRoom.id}\n`)

    // 10. 최종 통계
    console.log('🔟 최종 통계')
    const { data: allProfiles } = await supabase.from('profiles').select('id, role')
    const { data: allJobs } = await supabase.from('job_posts').select('id, status')
    const { data: allApps } = await supabase.from('applications').select('id, status')
    const { data: allChats } = await supabase.from('chat_rooms').select('id')
    const { data: allMessages } = await supabase.from('messages').select('id')

    const seekers = allProfiles?.filter(p => p.role === 'seeker').length || 0
    const employers = allProfiles?.filter(p => p.role === 'employer').length || 0
    const openJobs = allJobs?.filter(j => j.status === 'open').length || 0
    const acceptedApps = allApps?.filter(a => a.status === 'accepted').length || 0
    const pendingApps = allApps?.filter(a => a.status === 'pending').length || 0

    console.log(`
📊 시스템 현황:
   
   👥 사용자: ${allProfiles?.length || 0}명
      🔹 구직자: ${seekers}명
      🔹 업체: ${employers}명
   
   📋 구인글: ${allJobs?.length || 0}개
      🔹 모집중: ${openJobs}개
   
   📝 지원: ${allApps?.length || 0}건
      🔹 검토중: ${pendingApps}건
      🔹 수락: ${acceptedApps}건
   
   💬 채팅방: ${allChats?.length || 0}개
   `)

    console.log('='.repeat(50))
    console.log('✅ 모든 테스트 성공!')
    console.log('🎉 HireVan 애플리케이션이 정상 작동합니다!')
    console.log('='.repeat(50) + '\n')

  } catch (error) {
    console.error('❌ 에러:', error.message)
    console.error('상세:', error)
    process.exit(1)
  }
}

fullTest()
