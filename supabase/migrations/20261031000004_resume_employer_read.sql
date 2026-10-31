-- 이력서 비공개 전환 1/2 — 추가만 (공개 버킷 상태에서도 무해).
--
-- 서명 URL(createSignedUrl) 발급은 storage.objects SELECT 정책을 따른다.
-- 본인 정책("Users can read own resume files", 20261031000001) 에 더해
-- 그 구직자가 지원한 공고의 사장님도 열람 가능하게 한다.
-- 경로 규칙: resumes/<seeker_id>/<timestamp>-<filename>
create policy "Employers can read applicant resume files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resumes'
    and exists (
      select 1
      from public.applications a
      join public.job_posts j on j.id = a.job_post_id
      where j.employer_id = auth.uid()
        and a.seeker_id::text = (storage.foldername(name))[1]
    )
  );
