/*
  # Seed Test Data for HireVan

  ## What this does
  - Creates test auth users: employer@test.com / seeker@test.com (password: test12345)
  - Adds profiles for both users
  - Adds sample job posts by the employer
  - Adds sample applications by the seeker
  - Adds a chat room with sample messages
  - Adds sample reviews

  ## Important Notes
  1. Uses ON CONFLICT DO NOTHING so re-running is safe
  2. Fixed UUIDs for reproducibility
  3. Password hashes are bcrypt for "test12345"
*/

-- ============================================================
-- 1. AUTH USERS
-- ============================================================

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmation_token, email_change,
  email_change_token_new, recovery_token, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) VALUES
  (
    'e1000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'employer@test.com',
    '$2a$06$ehBCUOXTcioKwu.WJ6.O0.9oBEBlTxUhLj6HVS3SOF8SY0LSippem',
    now(), '', '', '', '', now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"sub":"e1000000-0000-0000-0000-000000000001","email":"employer@test.com","email_verified":true,"phone_verified":false}'
  ),
  (
    'e2000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'seeker@test.com',
    '$2a$06$8h2SXrRKBXLzPUwkPjGVe.koynV5KkVD3mO12Vjmx6CDayiLEcEFm',
    now(), '', '', '', '', now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"sub":"e2000000-0000-0000-0000-000000000002","email":"seeker@test.com","email_verified":true,"phone_verified":false}'
  )
ON CONFLICT (id) DO NOTHING;

-- Add identities
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, last_sign_in_at,
  created_at, updated_at, identity_data
) VALUES
  (
    'e1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'employer@test.com',
    'email',
    now(), now(), now(),
    '{"sub":"e1000000-0000-0000-0000-000000000001","email":"employer@test.com","email_verified":true,"phone_verified":false}'
  ),
  (
    'e2000000-0000-0000-0000-000000000002',
    'e2000000-0000-0000-0000-000000000002',
    'seeker@test.com',
    'email',
    now(), now(), now(),
    '{"sub":"e2000000-0000-0000-0000-000000000002","email":"seeker@test.com","email_verified":true,"phone_verified":false}'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. PROFILES
-- ============================================================

INSERT INTO profiles (id, role, name, bio, visa_type) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'employer', '테스트 카페', '다운타운에 위치한 한식 카페입니다. 정직하게 일하실 분 환영!', ''),
  ('e2000000-0000-0000-0000-000000000002', 'seeker', '김구직', '열심히 일할 준비가 되어있는 구직자입니다.', '워킹홀리데이')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. JOB_POSTS
-- ============================================================

INSERT INTO job_posts (id, employer_id, title, location, category, salary, work_hours, description, status) VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    '카페 서빙 아르바이트',
    '서울 강남구',
    '카페',
    '시급 12,000원',
    '평일 10:00-15:00',
    '강남역 근처 카페에서 서빙 아르바이트생을 모집합니다. 친절하신 분 환영!',
    'open'
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    'e1000000-0000-0000-0000-000000000001',
    '주방 보조 구인',
    '서울 마포구',
    '식당',
    '시급 15,000원',
    '주 5일 09:00-18:00',
    '한식당 주방 보조를 찾습니다. 기본적인 식재료 손질 가능하신 분 우대.',
    'open'
  ),
  (
    'a1000000-0000-0000-0000-000000000003',
    'e1000000-0000-0000-0000-000000000001',
    '편의점 야간 근무',
    '서울 동대문구',
    '편의점',
    '시급 11,000원',
    '야간 22:00-06:00',
    '24시간 편의점에서 야간 근무자를 모집합니다. 책임감 있으신 분 환영!',
    'open'
  ),
  (
    'a1000000-0000-0000-0000-000000000004',
    'e1000000-0000-0000-0000-000000000001',
    '네일숍 보조',
    '서울 송파구',
    '네일숍',
    '시급 13,000원',
    '평일 11:00-19:00',
    '네일숍에서 보조 스태프를 모집합니다. 관심 있으신 분 지원해주세요!',
    'open'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. APPLICATIONS
-- ============================================================

INSERT INTO applications (id, job_post_id, seeker_id, status) VALUES
  (
    'b1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002',
    'accepted'
  ),
  (
    'b1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000002',
    'e2000000-0000-0000-0000-000000000002',
    'pending'
  ),
  (
    'b1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000003',
    'e2000000-0000-0000-0000-000000000002',
    'pending'
  ),
  (
    'b1000000-0000-0000-0000-000000000004',
    'a1000000-0000-0000-0000-000000000004',
    'e2000000-0000-0000-0000-000000000002',
    'rejected'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. CHAT_ROOMS
-- ============================================================

INSERT INTO chat_rooms (id, job_post_id, employer_id, seeker_id, interview_completed) VALUES
  (
    'c1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002',
    true
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. MESSAGES
-- ============================================================

INSERT INTO messages (id, chat_room_id, sender_id, content) VALUES
  (
    'd1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    '안녕하세요! 카페 서빙 아르바이트에 관심 가져주셔서 감사합니다. 내일 오전 10시에 매장에서 면접 가능하실까요?'
  ),
  (
    'd1000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002',
    '네! 내일 10시에 방문하겠습니다. 감사합니다!'
  ),
  (
    'd1000000-0000-0000-0000-000000000003',
    'c1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    '네, 강남역 3번 출구에서 5분 거리입니다. "테스트 카페" 간판 보이시면 들어오시면 됩니다!'
  ),
  (
    'd1000000-0000-0000-0000-000000000004',
    'c1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002',
    '잘 찾아가겠습니다. 뵙겠습니다!'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 7. REVIEWS
-- ============================================================

INSERT INTO reviews (id, chat_room_id, reviewer_id, reviewee_id, rating, comment) VALUES
  (
    'f1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002',
    'e1000000-0000-0000-0000-000000000001',
    5,
    '친절하게 면접 봐주셔서 감사합니다. 근무 환경도 좋아 보였어요!'
  ),
  (
    'f1000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002',
    4,
    '면접 때 인상이 좋았습니다. 성실해 보이는 구직자네요.'
  )
ON CONFLICT (id) DO NOTHING;
