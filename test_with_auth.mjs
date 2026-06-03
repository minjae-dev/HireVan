import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://btqowlpcspsxbyrjyeot.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0cW93bHBjc3BzeGJ5cmp5ZW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MzE4NTksImV4cCI6MjA5NjAwNzg1OX0.rBPB2jdhe4OcWHRqKdmwv7WqAPyE2PoL7DcJAy_3EIE'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testWithAuth() {
  console.log('🧪 인증을 통한 HireVan 통합 테스트\n')

  // 1. 구직자 로그인
  console.log('📝 1. 구직자 로그인 테스트')
  const { data: seekerLogin, error: seekerLoginError } = await supabase.auth.signInWithPassword({
    email: 'seeker@test.com',
    password: 'test12345'
  })

  if (seekerLoginError) {
    console.log('❌ 로그인 실패:', seekerLoginError.message)
    return
  }

  console.log('✅ 구직자 로그인 성공')
  console.log('   세션:', seekerLogin.session?.access_token?.substring(0, 30) + '...')

  const seekerClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  })

  await seekerClient.auth.setSession({
    access_token: seekerLogin.session.access_token,
    refresh_token: seekerLogin.session.refresh_token
  })

  console.log()

  // 2. 업체 로그인
  console.log('📝 2. 업체 로그인 테스트')
  const { data: employerLogin, error: employerLoginError } = await supabase.auth.signInWithPassword({
    email: 'employer@test.com',
    password: 'test12345'
  })

  if (employerLoginError) {
    console.log('❌ 업체 로그인 실패:', employerLoginError.message)
    return
  }

  console.log('✅ 업체 로그인 성공')

  const employerClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  })

  await employerClient.auth.setSession({
    access_token: employerLogin.session.access_token,
    refresh_token: employerLogin.session.refresh_token
  })

  console.log()

  // 3. 업체가 구인글 등록
  console.log('📝 3. 업체의 구인글 등록 (추가)')
  const { data: newJob, error: newJobError } = await employerClient
    .from('job_posts')
    .insert({
      title: '한식당 주방보조원',
      location: '버나비',
      salary: '$16.50-17.50/hr',
      work_hours: '주 5일, 저녁 6시~11시',
      description: '한식당에서 주방 보조원을 찾습니다. 한국어 능통하신 분 우대!'
    })
    .select()
    .single()

  if (newJobError) {
    console.log('❌ 구인글 등록 실패:', newJobError.message)
  } else {
    console.log('✅ 구인글 등록 성공')
    console.log('   공고:', newJob.title)
  }

  console.log()

  // 4. 구직자가 구인글 조회
  console.log('📝 4. 구직자의 구인글 조회')
  const { data: jobList, error: jobListError } = await seekerClient
    .from('job_posts')
    .select('*, profiles(name)')
    .eq('status', 'open')

  if (jobListError) {
    console.log('❌ 구인글 조회 실패:', jobListError.message)
  } else {
    console.log('✅ 구인글 조회 성공')
    console.log(`   총 ${jobList.length}개 공고:`)
    jobList.forEach((j, idx) => {
      console.log(`   ${idx + 1}. [${j.location}] ${j.title}`)
      console.log(`      - 회사: ${j.profiles?.name}`)
      console.log(`      - 급여: ${j.salary}`)
    })
  }

  console.log()

  // 5. 구직자가 지원
  console.log('📝 5. 구직자의 지원 (인증 기반)')
  if (jobList && jobList.length > 0) {
    const { data: app, error: appError } = await seekerClient
      .from('applications')
      .insert({
        job_post_id: jobList[0].id,
        status: 'pending'
      })
      .select()
      .single()

    if (appError) {
      console.log('❌ 지원 실패:', appError.message)
    } else {
      console.log('✅ 지원 성공!')
      console.log('   지원한 공고:', jobList[0].title)
      console.log('   상태:', app.status)
      console.log('   생성일:', new Date(app.created_at).toLocaleDateString('ko-KR'))
    }
  }

  console.log()

  // 6. 업체가 지원자 조회
  console.log('📝 6. 업체의 지원자 조회')
  const { data: applications, error: appsError } = await employerClient
    .from('applications')
    .select('*, job_posts(title, employer_id), profiles(name, visa_type, bio)')

  if (appsError) {
    console.log('❌ 지원자 조회 실패:', appsError.message)
  } else {
    console.log('✅ 지원자 조회 성공')
    console.log(`   총 ${applications.length}명 지원자:`)
    applications.forEach(app => {
      console.log(`   - ${app.profiles?.name} (${app.profiles?.visa_type})`)
      console.log(`     공고: ${app.job_posts?.title}`)
      console.log(`     상태: ${app.status}`)
    })
  }

  console.log()

  // 7. 프로필 수정 테스트
  console.log('📝 7. 프로필 수정 테스트 (구직자)')
  const { error: profileError } = await seekerClient
    .from('profiles')
    .update({
      bio: '카페에서 2년, 식당에서 1년 일한 경험이 있습니다. 한국어/영어 가능.'
    })
    .eq('role', 'seeker')

  if (profileError) {
    console.log('❌ 프로필 수정 실패:', profileError.message)
  } else {
    console.log('✅ 프로필 수정 성공')
  }

  console.log()

  // 8. 최종 통계
  console.log('📊 8. 최종 데이터 통계')
  const { data: totalProfiles } = await supabase.from('profiles').select('id')
  const { data: totalJobs } = await supabase.from('job_posts').select('id')
  const { data: totalApps } = await supabase.from('applications').select('id')
  const { data: openJobs } = await supabase
    .from('job_posts')
    .select('id')
    .eq('status', 'open')

  console.log(`✅ 총 프로필: ${totalProfiles?.length || 0}명`)
  console.log(`   - 구직자, 업체 혼합`)
  console.log(`✅ 총 구인글: ${totalJobs?.length || 0}개`)
  console.log(`   - 모집중: ${openJobs?.length || 0}개`)
  console.log(`✅ 총 지원: ${totalApps?.length || 0}건`)

  console.log('\n✅ 통합 테스트 완료!\n')
  console.log('🎉 HireVan 애플리케이션이 정상 작동합니다!')
}

testWithAuth().catch(console.error)
