-- RLS/권한 감사(2026-10-30, 운영 DB 기준) 에서 확인된 권한 상승·데이터 노출 차단.
--
-- 1) profiles: 본인 row UPDATE 정책이 컬럼 제한 없이 열려 있어
--    로그인 사용자가 is_admin / pro_subscriber / plan / credit_count 를 직접 수정 가능.
--    → 클라이언트가 실제로 쓰는 컬럼만 INSERT/UPDATE 권한 부여.
--    (Stripe webhook·관리자 액션·SECURITY DEFINER 함수는 service_role/owner 라 영향 없음)
-- 2) SECURITY DEFINER RPC 가 anon 에게도 실행 허용 + 호출자 검증 없음
--    (아무 구직자의 노쇼 카운트 증가, 임의 employer 명의 메시지 작성, 알림 스팸 등)
-- 3) free_pro_employers 뷰(owner 권한 실행)가 anon 에게 Stripe ID 노출
-- 4) 노쇼 신고: 클라이언트가 타인 profiles 를 UPDATE 하던 경로(RLS 로 0건 처리되어 동작 안 함)를
--    호출자 검증 + 메시지당 1회 보장 RPC 로 교체
-- 5) resumes 버킷: public SELECT 정책으로 anon 이 전체 이력서 목록 조회 가능

-- ─────────────────────────────────────────────────────────────
-- 1) profiles 컬럼 권한
-- ─────────────────────────────────────────────────────────────
revoke insert, update on public.profiles from anon, authenticated;

-- signup / auth / claim 페이지의 insert 컬럼
grant insert (id, role, name, bio, visa_type, visa_expiry_date, has_sir, has_foodsafe, neighborhood)
  on public.profiles to authenticated;

-- profile 편집 화면(app/profile, app/profile/edit, lib/profile.ts) 의 update 컬럼
grant update (name, bio, avatar_url, visa_type, visa_status, visa_expiry, visa_expiry_date,
              has_sir, has_foodsafe, neighborhood, availability, english_level,
              local_experience_months, skills, available_shifts, postal_code_prefix)
  on public.profiles to authenticated;

-- qual 이 (is_admin = true) 라서 "호출자가 관리자" 가 아니라
-- "대상 row 가 관리자" 이면 누구나 ALL 허용되던 정책
drop policy if exists "Admin full access" on public.profiles;
-- permissive 라 다른 UPDATE 정책과 OR 되어 아무것도 막지 못함 (컬럼 권한으로 대체)
drop policy if exists "Users cannot self-set is_verified" on public.profiles;

-- ─────────────────────────────────────────────────────────────
-- 2) SECURITY DEFINER RPC 실행 권한 축소 (앱 코드는 service_role 로만 호출)
-- ─────────────────────────────────────────────────────────────
revoke execute on function public.increment_no_show_count(uuid) from public, anon, authenticated;
revoke execute on function public.report_seeker_no_show(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.notify_new_job_matches(uuid) from public, anon, authenticated;
revoke execute on function public.match_jobs_to_seeker(uuid, integer) from public, anon, authenticated;
revoke execute on function public.has_employer_viewed_seeker(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_pro_employer(uuid) from public, anon, authenticated;

grant execute on function public.increment_no_show_count(uuid) to service_role;
grant execute on function public.report_seeker_no_show(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.notify_new_job_matches(uuid) to service_role;
grant execute on function public.match_jobs_to_seeker(uuid, integer) to service_role;
grant execute on function public.has_employer_viewed_seeker(uuid, uuid) to service_role;
grant execute on function public.is_pro_employer(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- 3) free_pro_employers 뷰 비공개
-- ─────────────────────────────────────────────────────────────
revoke all on public.free_pro_employers from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4) 노쇼 신고 RPC
-- ─────────────────────────────────────────────────────────────
create table if not exists public.no_show_reports (
  message_id uuid primary key references public.messages (id) on delete cascade,
  chat_room_id uuid not null references public.chat_rooms (id) on delete cascade,
  seeker_id uuid not null,
  employer_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.no_show_reports enable row level security;
revoke all on public.no_show_reports from anon, authenticated;

create or replace function public.report_no_show(p_chat_room_id uuid, p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room record;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select seeker_id, employer_id into v_room from chat_rooms where id = p_chat_room_id;
  if not found or v_room.employer_id is distinct from v_uid then
    raise exception 'not_room_employer' using errcode = '42501';
  end if;

  if not exists (select 1 from messages where id = p_message_id and chat_room_id = p_chat_room_id) then
    raise exception 'message_not_in_room' using errcode = '22023';
  end if;

  -- 같은 면접 제안에 대한 중복 신고(더블클릭/동시 요청)는 1회만 반영
  insert into no_show_reports (message_id, chat_room_id, seeker_id, employer_id)
  values (p_message_id, p_chat_room_id, v_room.seeker_id, v_uid)
  on conflict (message_id) do nothing;
  if not found then
    return false;
  end if;

  update profiles set no_show_count = coalesce(no_show_count, 0) + 1 where id = v_room.seeker_id;
  return true;
end;
$$;

revoke execute on function public.report_no_show(uuid, uuid) from public, anon;
grant execute on function public.report_no_show(uuid, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 5) resumes 버킷 목록 조회 차단
--    public 버킷의 /object/public URL 은 정책과 무관하게 동작하므로 기존 이력서 링크는 유지된다.
--    storage.objects 는 supabase_storage_admin 소유라 권한이 없으면 NOTICE 만 남기고 넘어간다
--    (그 경우 Dashboard → Storage → Policies 에서 수동 처리).
-- ─────────────────────────────────────────────────────────────
do $$
begin
  drop policy if exists "Public can read resume files" on storage.objects;
  drop policy if exists "Users can read own resume files" on storage.objects;
  create policy "Users can read own resume files" on storage.objects
    for select to authenticated
    using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
exception when insufficient_privilege then
  raise notice 'storage.objects 정책 변경 권한 없음 — Dashboard 에서 "Public can read resume files" 정책을 삭제하세요';
end
$$;
