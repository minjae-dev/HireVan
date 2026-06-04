# 🚨 [긴급] 구인글 등록 불가 - DB 컬럼 누락

## 문제 상황

**DB에 `category` 컬럼이 없어서 구인글 등록이 완전히 불가능합니다.**

에러 메시지:
```
구인글 등록에 실패했습니다: Could not find the 'category' column of 'job_posts' in the schema cache
```

## 🔧 즉시 해결 방법 (1분 소요)

### 1️⃣ Supabase 대시보드 열기
👉 [https://supabase.com/dashboard/project/btqowlpcspsxbyrjyeot/editor](https://supabase.com/dashboard/project/btqowlpcspsxbyrjyeot/editor)

### 2️⃣ SQL 실행
1. 왼쪽 메뉴에서 **SQL Editor** 클릭
2. **New query** 버튼 클릭
3. 아래 SQL을 복사해서 붙여넣기
4. **Run** 버튼 클릭

```sql
-- 구인글 등록을 위한 category 컬럼 추가 (필수!)
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS category text DEFAULT '';
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS deadline date;

-- 업종 옵션 업데이트
ALTER TABLE job_posts DROP CONSTRAINT IF EXISTS job_posts_category_check;
ALTER TABLE job_posts ADD CONSTRAINT job_posts_category_check 
CHECK (category IN ('카페', '식당', '네일숍', '편의점', '소매점', '청소용역', '배송', '기타', ''));
```

### 3️⃣ 성공 확인
- `ALTER TABLE` 메시지가 3번 표시되면 ✅ 성공
- 이제 구인글 등록 페이지에서 정상적으로 등록 가능

## ❓ 왜 이런 문제가 발생했나요?

`supabase/migrations/20260602_add_category_deadline.sql` 파일이 생성되어 있지만, **실제 Supabase DB에는 적용되지 않았습니다.**

마이크레이션 파일을 Supabase에 적용하는 방법:
1. **Supabase 대시보드에서 SQL 실행** (가장 쉬움) ← 지금 하고 있는 방법
2. Supabase CLI 사용: `supabase db push`
3. GitHub 연동으로 자동 배포

## 📞 문제가 계속되면?

1. 브라우저 콘솔(F12)에서 에러 메시지 캡처
2. Supabase 대시보드에서 실제로 컬럼이 추가되었는지 확인:
   - **Table Editor** → `job_posts` 테이블 클릭 → Columns 탭에서 `category` 확인

## ✅ 확인 사항

SQL 실행 후:
1. 구인글 등록 페이지(`/employer/jobs/new`)로 이동
2.適当な 내용으로 테스트 등록
3. 정상적으로 등록되고 목록 페이지로 이동하면 성공!