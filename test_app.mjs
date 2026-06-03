import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://btqowlpcspsxbyrjyeot.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0cW93bHBjc3BzeGJ5cmp5ZW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MzE4NTksImV4cCI6MjA5NjAwNzg1OX0.rBPB2jdhe4OcWHRqKdmwv7WqAPyE2PoL7DcJAy_3EIE'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testApp() {
  console.log('🧪 HireVan 테스트 시작...\n')

  // 1. 회원가입 테스트 - 구직자
  console.log('📝 1. 구직자 계정 생성 테스트')
  const { data: seekerAuth, error: seekerError } = await supabase.auth.signUp({
    email: 'seeker@test.com',
    password: 'test12345'
  })

  if (seekerError) {
    console.log('❌ 구직자 계정 생성 실패:', seekerError.message)
  } else {
    console.log('✅ 구직자 계정 생성 성공')
    console.log('   이메일:', seekerAuth.user?.email)
    console.log('   ID:', seekerAuth.user?.id)

    // 프로필 생성
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: seekerAuth.user.id,
        role: 'seeker',
        name: '김민지',
        bio: '카페와 식당에서 일한 경험이 있습니다',
        visa_type: '워킹홀리데이'
      })

    if (profileError) {
      console.log('❌ 프로필 생성 실패:', profileError.message)
    } else {
      console.log('✅ 구직자 프로필 생성 성공')
    }
  }

  console.log()

  // 2. 회원가입 테스트 - 업체
  console.log('📝 2. 업체 계정 생성 테스트')
  const { data: employerAuth, error: employerError } = await supabase.auth.signUp({
    email: 'employer@test.com',
    password: 'test12345'
  })

  if (employerError) {
    console.log('❌ 업체 계정 생성 실패:', employerError.message)
  } else {
    console.log('✅ 업체 계정 생성 성공')
    console.log('   이메일:', employerAuth.user?.email)
    console.log('   ID:', employerAuth.user?.id)

    // 프로필 생성
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: employerAuth.user.id,
        role: 'employer',
        name: '서울 카페',
        bio: '바리스타 경험 있는 분을 찾습니다'
      })

    if (profileError) {
      console.log('❌ 프로필 생성 실패:', profileError.message)
    } else {
      console.log('✅ 업체 프로필 생성 성공')
    }
  }

  console.log()

  // 3. 구인글 등록 테스트
  if (employerAuth?.user?.id) {
    console.log('📝 3. 구인글 등록 테스트')
    const { data: job, error: jobError } = await supabase
      .from('job_posts')
      .insert({
        employer_id: employerAuth.user.id,
        title: '바리스타 모집',
        location: '다운타운',
        salary: '$17-18/hr',
        work_hours: '주 3-4일, 풀타임',
        description: '커피 추출, 음료 제조, 카운터 서빙 경험 있는 분을 찾습니다. 한국어 가능하면 좋습니다.'
      })
      .select()
      .single()

    if (jobError) {
      console.log('❌ 구인글 등록 실패:', jobError.message)
    } else {
      console.log('✅ 구인글 등록 성공')
      console.log('   공고 ID:', job.id)
      console.log('   제목:', job.title)
      console.log('   위치:', job.location)
      console.log('   급여:', job.salary)
    }
  }

  console.log()

  // 4. 프로필 조회 테스트
  console.log('📝 4. 프로필 조회 테스트')
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')

  if (profilesError) {
    console.log('❌ 프로필 조회 실패:', profilesError.message)
  } else {
    console.log('✅ 프로필 조회 성공')
    console.log(`   총 ${profiles.length}개 프로필:`)
    profiles.forEach(p => {
      console.log(`   - ${p.name} (${p.role === 'employer' ? '업체' : '구직자'})`)
    })
  }

  console.log()

  // 5. 구인글 조회 테스트
  console.log('📝 5. 구인글 목록 조회 테스트')
  const { data: jobs, error: jobsError } = await supabase
    .from('job_posts')
    .select('*, profiles(name, role)')
    .eq('status', 'open')

  if (jobsError) {
    console.log('❌ 구인글 조회 실패:', jobsError.message)
  } else {
    console.log('✅ 구인글 조회 성공')
    console.log(`   모집 중인 공고: ${jobs.length}개`)
    jobs.forEach(j => {
      console.log(`   - [${j.location}] ${j.title} (${j.profiles?.name})`)
      console.log(`     급여: ${j.salary} | 시간: ${j.work_hours}`)
    })
  }

  console.log()

  // 6. 지원하기 테스트
  if (seekerAuth?.user?.id && jobs && jobs.length > 0) {
    console.log('📝 6. 지원하기 테스트')
    const { data: application, error: appError } = await supabase
      .from('applications')
      .insert({
        job_post_id: jobs[0].id,
        seeker_id: seekerAuth.user.id
      })
      .select()
      .single()

    if (appError) {
      console.log('❌ 지원하기 실패:', appError.message)
    } else {
      console.log('✅ 지원하기 성공')
      console.log('   공고:', jobs[0].title)
      console.log('   지원자:', '김민지')
      console.log('   상태:', application.status)
    }
  }

  console.log()

  // 7. 데이터 통계
  console.log('📊 7. 데이터 통계')
  const { data: allJobs } = await supabase.from('job_posts').select('id')
  const { data: allApps } = await supabase.from('applications').select('id')
  const { data: allProfiles } = await supabase.from('profiles').select('id')

  console.log(`✅ 총 프로필: ${allProfiles?.length || 0}개`)
  console.log(`✅ 총 구인글: ${allJobs?.length || 0}개`)
  console.log(`✅ 총 지원: ${allApps?.length || 0}개`)

  console.log('\n✅ 모든 테스트 완료!')
}

testApp().catch(console.error)
