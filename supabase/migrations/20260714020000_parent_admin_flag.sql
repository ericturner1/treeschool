ALTER TABLE profiles
  ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_admin_parent_check
  CHECK (NOT is_admin OR role = 'PARENT');

UPDATE profiles
SET is_admin = true
WHERE role = 'PARENT'
  AND user_id IN (
    SELECT id
    FROM users
    WHERE lower(email) = 'ericsturner1@gmail.com'
  );
