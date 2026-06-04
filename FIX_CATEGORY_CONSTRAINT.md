# 🚨 구인글 등록 오류 수정 (필수)

## 문제 원인

**DB에 `category` 컬럼이 존재하지 않습니다.** 

마이크레이션 파일은 있지만 Supabase에 아직 적용되지 않았습니다. 이로 인해 구인글 등록 시 다음과 같은 에러가 발생합니다:

```
구인글 등록에 실패했습니다: Could not find the 'category' column of 'job_posts' in the schema cache
```

## 🔧 해결 방법 (필수)

Supabase 대시보드에서 아래 SQL을 실행하여 누락된 컬럼을 추가하세요:

### 1단계: Supabase 대시보드 접속

1. [Supabase 대시보드](https://supabase.com/dashboard) 접속
2. 프로젝트 선택 (`btqowlpcspsxbyrjyeot` - HireVan)
3. 왼쪽 메뉴에서 **SQL Editor** 클릭
4. **New query** 버튼 클릭

### 2단계: SQL 실행

아래 SQL을 복사하여 붙여넣고 **Run**을 클릭하세요:

```sql
-- Fix missing category and deadline columns in job_posts table
-- Add category column (if not exists)
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS category text DEFAULT '';

-- Add deadline column (if not exists)  
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS deadline date;

-- Update the CHECK constraint to include all job types
ALTER TABLE job_posts DROP CONSTRAINT IF EXISTS job_posts_category_check;

ALTER TABLE job_posts ADD CONSTRAINT job_posts_category_check 
CHECK (category IN ('카페', '식당', '네일숍', '편의점', '소매점', '청소용역', '배송', '기타', ''));
```

### 3단계: 성공 확인

다음과 같은 메시지가 표시되면 성공입니다:
- `ALTER TABLE` (3번 표시)
- `No rows returned`

## ✅ 확인 방법

1. 구인글 등록 페이지(`/employer/jobs/new`)로 이동
2. 모든 필드를 입력하고 '소매점', '청소용역', '배송' 등의 업종으로 테스트
3. 정상적으로 등록되면 성공!

## 📝 추가 정보

- **왜 이 문제가 발생했나요?**: `20260602_add_category_deadline.sql` 마이그레이션 파일이 Supabase에 적용되지 않았습니다.
- **CHECK 제약조건은 무엇인가요?**: `category` 컬럼에 허용된 값만 저장되도록 제한하는 규칙입니다.
- **왜 '소매점', '청소용역', '배송'을 추가했나요?**: UI에서 제공하는 모든 업종 옵션을 DB에서도 허용하도록 업데이트했습니다.

## 📁 관련 파일

- `supabase/migrations/20260603_apply_category_deadline_fixed.sql` - 위 SQL과 동일한 마이그레이션 파일
- `app/employer/jobs/new/page.tsx` - 디버깅 로그 추가됨 (브라우저 콘솔에서 확인 가능)