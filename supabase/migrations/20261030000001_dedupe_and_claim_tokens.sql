-- 중복 수집/중복 발송/중복 채팅방 race 를 DB 제약으로 차단하고,
-- 크롤링 공고 claim 용 일회용 토큰 테이블을 추가한다.
--
-- ⚠️ 적용 전: 아래 "기존 중복 정리" 블록이 중복 행을 지운다.
--    먼저 SELECT 로 대상 건수를 확인한 뒤 실행할 것.

-- ─────────────────────────────────────────────────────────────
-- 1) 전화번호 정규화 (claim 비교와 형식을 맞춤: 10자리 숫자)
-- ─────────────────────────────────────────────────────────────
update public.job_posts
set contact_phone = case
    when length(regexp_replace(contact_phone, '\D', '', 'g')) = 11
     and regexp_replace(contact_phone, '\D', '', 'g') like '1%'
      then substr(regexp_replace(contact_phone, '\D', '', 'g'), 2)
    else regexp_replace(contact_phone, '\D', '', 'g')
  end
where contact_phone is not null
  and contact_phone ~ '\D';

-- ─────────────────────────────────────────────────────────────
-- 2) 기존 중복 정리 (가장 오래된 1건만 남김)
-- ─────────────────────────────────────────────────────────────
-- 확인용: select source_url, count(*) from public.job_posts
--         where source_url is not null group by 1 having count(*) > 1;
delete from public.job_posts a
using public.job_posts b
where a.source_url is not null
  and a.source_url = b.source_url
  and a.employer_id is null            -- 이미 사장님이 claim 한 행은 건드리지 않음
  and not exists (select 1 from public.applications ap where ap.job_post_id = a.id)
  -- 지원이 달린 중복이 남아 있으면 아래 unique index 생성이 실패하므로 수동 병합 필요
  and (a.created_at, a.id) > (b.created_at, b.id);

delete from public.notification_logs a
using public.notification_logs b
where a.dedupe_key is not null
  and a.dedupe_key = b.dedupe_key
  and (a.created_at, a.id) > (b.created_at, b.id);

-- chat_rooms 중복은 메시지가 달려 있을 수 있어 자동 삭제하지 않는다.
-- 아래 결과가 0건이 아니면 수동 병합 후 인덱스를 만들 것:
--   select job_post_id, seeker_id, count(*) from public.chat_rooms
--   group by 1, 2 having count(*) > 1;

-- ─────────────────────────────────────────────────────────────
-- 3) unique 제약
-- ─────────────────────────────────────────────────────────────
-- upsert(onConflict) 가 추론할 수 있도록 partial 이 아닌 일반 unique 로 만든다
-- (NULL 은 서로 충돌하지 않으므로 source_url/dedupe_key 가 null 인 행은 영향 없음)
create unique index if not exists job_posts_source_url_key
  on public.job_posts (source_url);

create unique index if not exists notification_logs_dedupe_key_key
  on public.notification_logs (dedupe_key);

create unique index if not exists chat_rooms_job_post_seeker_key
  on public.chat_rooms (job_post_id, seeker_id);

-- ─────────────────────────────────────────────────────────────
-- 4) claim 토큰 — RLS 활성 + 정책 없음 = service role 만 접근 가능
--    (job_posts 컬럼으로 두면 anon 의 select('*') 로 노출된다)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.job_claim_tokens (
  job_post_id uuid primary key references public.job_posts (id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now()
);

alter table public.job_claim_tokens enable row level security;
revoke all on public.job_claim_tokens from anon, authenticated;
