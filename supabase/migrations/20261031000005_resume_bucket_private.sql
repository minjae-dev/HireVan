-- 이력서 비공개 전환 2/2 — 공개 URL 차단.
-- 선행: 20261031000004 적용 + 서명 URL 로 여는 코드 배포 완료.
-- 이후 /storage/v1/object/public/resumes/... 는 400 을 반환하고,
-- 열람은 storage.objects SELECT 정책을 통과한 createSignedUrl 로만 가능하다.
update storage.buckets set public = false where id = 'resumes';
