DO $$ BEGIN
  CREATE TYPE "subscription_billing_provider" AS ENUM ('stripe', 'apple');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "billing_provider" "subscription_billing_provider" DEFAULT 'stripe' NOT NULL,
  ADD COLUMN IF NOT EXISTS "apple_original_transaction_id" text,
  ADD COLUMN IF NOT EXISTS "apple_last_transaction_id" text,
  ADD COLUMN IF NOT EXISTS "apple_product_id" text,
  ADD COLUMN IF NOT EXISTS "apple_environment" text;

DO $$ BEGIN
  ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_apple_original_transaction_id_unique"
    UNIQUE ("apple_original_transaction_id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "apple_subscription_transactions" (
  "transaction_id" text PRIMARY KEY NOT NULL,
  "original_transaction_id" text NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "product_id" text NOT NULL,
  "environment" text NOT NULL,
  "purchase_date" timestamp with time zone,
  "expires_date" timestamp with time zone,
  "revocation_date" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "apple_subscription_transactions_original_idx"
  ON "apple_subscription_transactions" ("original_transaction_id");
CREATE INDEX IF NOT EXISTS "apple_subscription_transactions_account_idx"
  ON "apple_subscription_transactions" ("account_id");

CREATE TABLE IF NOT EXISTS "apple_subscription_notifications" (
  "notification_uuid" text PRIMARY KEY NOT NULL,
  "notification_type" text NOT NULL,
  "subtype" text,
  "original_transaction_id" text,
  "signed_at" timestamp with time zone,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "apple_subscription_notifications_original_idx"
  ON "apple_subscription_notifications" ("original_transaction_id");
