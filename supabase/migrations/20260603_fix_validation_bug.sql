-- [긴급] 구인글 지원 조건 검증을 위한 필수 컬럼 추가
-- 이 SQL을 실행해야 이력서 필수/커스텀 질문 검증이 작동합니다

-- 1. job_posts 테이블에 지원 조건 컬럼 추가
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS require_resume boolean NOT NULL DEFAULT false;
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS custom_questions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. applications 테이블에 지원 응답 컬럼 추가
ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_url text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS custom_answers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. applications 테이블에 무결성 검증 함수 생성
-- 이력서 필수 구인글에 이력서 없이 지원하면 에러 발생
CREATE OR REPLACE FUNCTION validate_application_insert()
RETURNS TRIGGER AS $$
DECLARE
  job_require_resume boolean;
  job_custom_questions jsonb;
BEGIN
  -- 구인글 정보 가져오기
  SELECT require_resume, custom_questions 
  INTO job_require_resume, job_custom_questions
  FROM job_posts 
  WHERE id = NEW.job_post_id;

  -- 이력서 필수 구인글인데 이력서 없으면 에러
  IF job_require_resume AND (NEW.resume_url IS NULL OR NEW.resume_url = '') THEN
    RAISE EXCEPTION '이 구인글은 이력서 제출이 필수입니다. resume_url을 제공해야 합니다.';
  END IF;

  -- 커스텀 질문이 있는데 답변이 없거나 개수가 다르면 에러
  IF jsonb_array_length(job_custom_questions) > 0 THEN
    IF NEW.custom_answers IS NULL OR jsonb_array_length(NEW.custom_answers) = 0 THEN
      RAISE EXCEPTION '모든 사전 질문에 답변해야 합니다. custom_answers를 제공해야 합니다.';
    END IF;
    
    IF jsonb_array_length(NEW.custom_answers) != jsonb_array_length(job_custom_questions) THEN
      RAISE EXCEPTION '질문 개수(%)와 답변 개수(%)가 일치하지 않습니다.', 
        jsonb_array_length(job_custom_questions),
        jsonb_array_length(NEW.custom_answers);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. 트리거 생성 (insert/update 시 검증)
DROP TRIGGER IF EXISTS validate_application_before_insert ON applications;
CREATE TRIGGER validate_application_before_insert
  BEFORE INSERT ON applications
  FOR EACH ROW
  EXECUTE FUNCTION validate_application_insert();

DROP TRIGGER IF EXISTS validate_application_before_update ON applications;
CREATE TRIGGER validate_application_before_update
  BEFORE UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION validate_application_insert();