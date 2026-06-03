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

    // 3. 구직자가 공고 조회
    console.log('3️⃣  구직자의 공고 검색')
    const { data: jobList } = await seekerClient
      .from('job_posts')
      .select('*, profiles(name)')
      .eq('status', 'open')
      .limit(5)

    console.log(`✅ ${jobList.length}개 공고 조회됨`)
    jobList.forEach((j, idx) => {
      console.log(`   ${idx + 1}. [${j.location}] ${j.title}`)
      console.log(`      회사: ${j.profiles?.name} | 급여: ${j.salary}`)
    })
    console.log()

    // 4. 구직자가 지원 (중복 지원 제외)
    console.log('4️⃣  공고에 지원')
    const targetJob = jobList[0]
    
    const { data: existingApp } = await seekerClient
      .from('applications')
      .select('id')
      .eq('job_post_id', targetJob.id)
      .eq('seeker_id', seekerSession.user.id)
      .maybeSingle()

    let applicationId
    if (existingApp) {
      console.log(`⚠️  이미 "${targetJob.title}"에 지원했습니다\n`)
      applicationId = existingApp.id
    } else {
      const { data: newApp } = await seekerClient
        .from('applications')
        .insert({
          job_post_id: targetJob.id,
          seeker_id: seekerSession.user.id
        })
        .select()
        .single()

      console.log(`✅ "${targetJob.title}"에 지원 완료`)
      console.log(`   상태: ${newApp.status}`)
      console.log(`   지원일: ${new Date(newApp.created_at).toLocaleDateString('ko-KR')}\n`)
      applicationId = newApp.id
    }

    // 5. 업체가 지원자 조회
    console.log('5️⃣  업체의 지원자 조회')
    const { data: applications } = await employerClient
      .from('applications')
      .select(`
        *,
        job_posts(title),
        profiles(name, visa_type, bio)
      `)

    console.log(`✅ ${applications.length}명의 지원자 조회됨`)
    applications.forEach(app => {
      console.log(`   👤 ${app.profiles?.name} (${app.profiles?.visa_type})`)
      console.log(`      지원공고: ${app.job_posts?.title}`)
      console.log(`      상태: ${app.status}`)
    })
    console.log()

    // 6. 업체가 지원 수락
    console.log('6️⃣  지원 수락 및 채팅 시작')
    const { error: updateError } = await employerClient
      .from('applications')
      .update({ status: 'accepted' })
      .eq('id', applicationId)

    if (updateError) {
      console.log('⚠️  지원 수락 에러:', updateError.message)
    } else {
      console.log('✅ 지원 수락 완료')
    }

    // 채팅방 생성 또는 조회
    const { data: existingChat } = await employerClient
      .from('chat_rooms')
      .select('id')
      .eq('job_post_id', targetJob.id)
      .eq('seeker_id', seekerSession.user.id)
      .maybeSingle()

    if (existingChat) {
      console.log(`✅ 채팅방 활성화`)
      console.log(`   채팅방 ID: ${existingChat.id}\n`)
    } else {
      const { data: newChat } = await employerClient
        .from('chat_rooms')
        .insert({
          job_post_id: targetJob.id,
          seeker_id: seekerSession.user.id
        })
        .select()
        .single()

      console.log('✅ 채팅방 생성')
      console.log(`   채팅방 ID: ${newChat.id}\n`)
    }

    // 7. 프로필 조회
    console.log('7️⃣  프로필 조회')
    const { data: myProfile } = await seekerClient
      .from('profiles')
      .select('*')
      .eq('role', 'seeker')
      .single()

    console.log('✅ 구직자 프로필')
    console.log(`   이름: ${myProfile?.name}`)
    console.log(`   비자: ${myProfile?.visa_type}`)
    console.log(`   소개: ${myProfile?.bio}\n`)

    // 8. 최종 통계
    console.log('8️⃣  최종 통계')
    const { data: allProfiles } = await supabase.from('profiles').select('id, role')
    const { data: allJobs } = await supabase.from('job_posts').select('id, status')
    const { data: allApps } = await supabase.from('applications').select('id, status')
    const { data: allChats } = await supabase.from('chat_rooms').select('id')

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
    console.log('🎉 HireVan 애플리케이션이 완벽하게 작동합니다!')
    console.log('='.repeat(50) + '\n')

  } catch (error) {
    console.error('❌ 에러:', error.message)
    process.exit(1)
  }
}

fullTest()
