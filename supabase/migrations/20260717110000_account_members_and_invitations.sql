CREATE TYPE public.account_member_role AS ENUM ('OWNER', 'ADMIN', 'TEACHER');
CREATE TYPE public.account_invitation_status AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

ALTER TABLE public.profiles
  ADD COLUMN account_role public.account_member_role;

UPDATE public.profiles
SET account_role = 'OWNER'
WHERE role = 'PARENT';

CREATE TABLE public.account_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  role public.account_member_role NOT NULL DEFAULT 'TEACHER',
  status public.account_invitation_status NOT NULL DEFAULT 'PENDING',
  invited_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT account_invitations_account_email_unique UNIQUE (account_id, email),
  CONSTRAINT account_invitations_normalized_email CHECK (email = lower(trim(email))),
  CONSTRAINT account_invitations_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE INDEX account_invitations_email_status_idx
  ON public.account_invitations(email, status);

COMMENT ON COLUMN public.profiles.account_role IS
  'Household permission role. Separate from profiles.role (parent/student) and profiles.is_admin (Treeschool system administrator).';

