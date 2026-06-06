-- BUG-3: match_seekers_to_job RPC 수정
-- WHERE c.id IN (SELECT certs FROM req) → WHERE c.id = ANY(SELECT unnest(certs) FROM req)
-- certs가 uuid[] 타입이므로 IN (SELECT ...) 대신 = ANY(unnest(...)) 사용 필요

-- 기존 함수 삭제 후 재생성 (또는 CREATE OR REPLACE FUNCTION)
-- 정확한 함수 시그니처는 database.types.ts의 match_seekers_to_job 참조

-- 이 마이그레이션은 실제 DB에서 함수를 찾아서 수정해야 함
-- 참고용으로만 작성 (실제 적용 시에는 기존 함수 정의 확인 후 수정)

-- 예: CREATE OR REPLACE FUNCTION match_seekers_to_job(p_job_id uuid)
-- RETURNS SETOF ... LANGUAGE sql AS $$
-- SELECT ... WHERE c.id = ANY(SELECT unnest(req.required_certificate_ids) FROM job_post_requirements req WHERE req.job_id = p_job_id)
-- $$;