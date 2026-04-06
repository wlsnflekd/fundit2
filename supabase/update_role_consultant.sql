-- update_role_consultant.sql
-- 목적: role CHECK 제약에서 'staff' 제거, 'consultant' 추가
--       기존 'staff' 데이터를 'consultant'로 일괄 변환

-- 기존 제약 제거
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 기존 'staff' 값 → 'consultant' 변환
UPDATE profiles SET role = 'consultant' WHERE role = 'staff';

-- 새 제약 추가
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'consultant'));
