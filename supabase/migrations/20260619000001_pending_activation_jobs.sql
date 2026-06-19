alter table public.job_posts
  alter column employer_id drop not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.job_posts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.job_posts drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.job_posts
  add constraint job_posts_status_check
  check (status in ('open', 'closed', 'pending_activation'));
