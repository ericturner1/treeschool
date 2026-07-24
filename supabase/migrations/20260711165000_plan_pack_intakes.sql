CREATE TABLE IF NOT EXISTS "plan_pack_intakes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "provisional_user_id" uuid,
  "account_id" uuid NOT NULL,
  "student_profile_id" uuid,
  "learning_year_id" uuid,
  "stripe_checkout_session_id" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "plan_pack_intakes_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id"),
  CONSTRAINT "plan_pack_intakes_provisional_user_id_users_id_fk"
    FOREIGN KEY ("provisional_user_id") REFERENCES "users"("id") ON DELETE set null,
  CONSTRAINT "plan_pack_intakes_account_id_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade,
  CONSTRAINT "plan_pack_intakes_student_profile_id_profiles_id_fk"
    FOREIGN KEY ("student_profile_id") REFERENCES "profiles"("id") ON DELETE set null,
  CONSTRAINT "plan_pack_intakes_learning_year_id_learning_years_id_fk"
    FOREIGN KEY ("learning_year_id") REFERENCES "learning_years"("id") ON DELETE set null
);
