-- Phase 2 RLS bootstrap for the family account model.
-- Apply in Supabase SQL editor after the tables exist in production.

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_parent_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT p.account_id
  FROM profiles p
  WHERE p.user_id = auth.uid()
    AND p.role = 'PARENT'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_ids_for_account()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  SELECT p.id
  FROM profiles p
  WHERE p.account_id = public.current_parent_account_id()
$$;

DROP POLICY IF EXISTS accounts_parent_select ON accounts;
CREATE POLICY accounts_parent_select
ON accounts
FOR SELECT
USING (id = public.current_parent_account_id());

DROP POLICY IF EXISTS profiles_parent_crud ON profiles;
CREATE POLICY profiles_parent_crud
ON profiles
FOR ALL
USING (account_id = public.current_parent_account_id())
WITH CHECK (account_id = public.current_parent_account_id());

DROP POLICY IF EXISTS profiles_student_self_select ON profiles;
CREATE POLICY profiles_student_self_select
ON profiles
FOR SELECT
USING (id IN (SELECT public.current_profile_ids_for_account()));

DROP POLICY IF EXISTS student_vocabulary_parent_crud ON student_vocabulary;
CREATE POLICY student_vocabulary_parent_crud
ON student_vocabulary
FOR ALL
USING (profile_id IN (SELECT public.current_profile_ids_for_account()))
WITH CHECK (profile_id IN (SELECT public.current_profile_ids_for_account()));

DROP POLICY IF EXISTS student_vocabulary_student_self_select ON student_vocabulary;
CREATE POLICY student_vocabulary_student_self_select
ON student_vocabulary
FOR SELECT
USING (
  profile_id IN (
    SELECT p.id
    FROM profiles p
    WHERE p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS skill_progress_parent_crud ON skill_progress;
CREATE POLICY skill_progress_parent_crud
ON skill_progress
FOR ALL
USING (profile_id IN (SELECT public.current_profile_ids_for_account()))
WITH CHECK (profile_id IN (SELECT public.current_profile_ids_for_account()));

DROP POLICY IF EXISTS skill_progress_student_self_select ON skill_progress;
CREATE POLICY skill_progress_student_self_select
ON skill_progress
FOR SELECT
USING (
  profile_id IN (
    SELECT p.id
    FROM profiles p
    WHERE p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS node_configurations_parent_crud ON node_configurations;
CREATE POLICY node_configurations_parent_crud
ON node_configurations
FOR ALL
USING (profile_id IN (SELECT public.current_profile_ids_for_account()))
WITH CHECK (profile_id IN (SELECT public.current_profile_ids_for_account()));

DROP POLICY IF EXISTS schedules_parent_crud ON schedules;
CREATE POLICY schedules_parent_crud
ON schedules
FOR ALL
USING (profile_id IN (SELECT public.current_profile_ids_for_account()))
WITH CHECK (profile_id IN (SELECT public.current_profile_ids_for_account()));
