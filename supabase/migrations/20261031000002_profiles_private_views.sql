-- profiles 읽기 범위 축소 1/2 — 추가만 (기존 코드에 영향 없음).
-- 코드가 my_profile / search_seekers 로 전환된 뒤 20261031000003 에서 권한을 회수한다.

-- ─────────────────────────────────────────────────────────────
-- 1) 본인 전체 행
--    select * 는 생성 시점 컬럼으로 고정된다 — profiles 에 컬럼 추가 시 이 뷰를 재생성할 것
-- ─────────────────────────────────────────────────────────────
create or replace view public.my_profile
  with (security_invoker = false, security_barrier = true)
as
  select * from public.profiles where id = auth.uid();

revoke all on public.my_profile from anon, authenticated;
grant select on public.my_profile to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) 구직자 브라우징
-- ─────────────────────────────────────────────────────────────

create or replace function public.search_seekers(
  p_neighborhood text default null,
  p_cert text default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pro boolean;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select coalesce(pro_subscriber, false) or coalesce(grace_period_active, false)
    into v_pro
  from profiles
  where id = v_uid and role = 'employer';

  if not found then
    raise exception 'not_employer' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(row order by created_at desc)
    from (
      select
        p.created_at,
        case
          when v_pro or exists (
            select 1 from employer_seeker_views v
            where v.employer_id = v_uid and v.seeker_id = p.id
          ) then to_jsonb(p)
          -- 비열람: 카드 상단(항상 보임) 필드만
          else jsonb_build_object(
            'id', p.id, 'role', p.role, 'name', p.name, 'avatar_url', p.avatar_url,
            'bio', p.bio, 'no_show_count', p.no_show_count, 'created_at', p.created_at
          )
        end as row
      from profiles_public p
      where (p_neighborhood is null or p.neighborhood = p_neighborhood)
        and (p_cert is null
             or (p_cert = 'sir' and p.has_sir)
             or (p_cert = 'foodsafe' and p.has_foodsafe))
      order by p.created_at desc
      limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) s
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.search_seekers(text, text, integer) from public, anon;
grant execute on function public.search_seekers(text, text, integer) to authenticated, service_role;
