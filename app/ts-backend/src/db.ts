import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import * as schema from "ts-db";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3001),
  GOOGLE_AI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  WORKBOOK_STUDIO_MODEL: z.string().min(1).default("claude-sonnet-4-20250514"),
  GENNY_LOVO_API_KEY: z.string().min(1).optional(),
  GCS_BUCKET_NAME: z.string().min(1).optional(),
  GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().min(1).optional(),
  GOOGLE_APPLICATION_CREDENTIALS_JSON_B64: z.string().min(1).optional(),
  GCP_PROJECT_ID: z.string().min(1).optional(),
  GCP_REGION: z.string().min(1).optional(),
  GCP_PROCESSOR_JOB_NAME: z.string().min(1).optional(),
  PROCESSOR_MAX_JOBS: z.coerce.number().int().positive().default(25),
  PROCESSOR_MAX_RUNTIME_SECONDS: z.coerce.number().int().positive().default(3300),
  INTERNAL_API_SECRET: z.string().min(24).optional(),
  ADMIN_ALERT_WEBHOOK_URL: z.string().url().optional(),
  MAINTENANCE_JOB_SECRET: z.string().min(1).optional(),
  MAINTENANCE_STALE_LESSON_MINUTES: z.coerce.number().int().positive().default(5),
  MAINTENANCE_ERROR_RETRY_MINUTES: z.coerce.number().int().positive().default(5),
  BILLING_GUARD_ENABLED: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  STRIPE_CHECKOUT_MONTHLY_URL: z.string().url().optional(),
  STRIPE_CHECKOUT_YEARLY_URL: z.string().url().optional(),
  STRIPE_CUSTOMER_PORTAL_URL: z.string().url().optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PLAN_PACK_PRICE_ID: z.string().min(1).optional(),
  STRIPE_SINGLE_MONTHLY_PRICE_ID: z.string().min(1).optional(),
  STRIPE_SINGLE_YEARLY_PRICE_ID: z.string().min(1).optional(),
  STRIPE_MONTHLY_PRICE_ID: z.string().min(1).optional(),
  STRIPE_YEARLY_PRICE_ID: z.string().min(1).optional(),
  STRIPE_ADDITIONAL_STUDENT_MONTHLY_PRICE_ID: z.string().min(1).optional(),
  STRIPE_ADDITIONAL_STUDENT_YEARLY_PRICE_ID: z.string().min(1).optional(),
  META_PIXEL_ID: z.string().min(1).optional(),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v25.0"),
  META_CONVERSIONS_API_ACCESS_TOKEN: z.string().min(1).optional(),
  META_CONVERSIONS_API_TEST_EVENT_CODE: z.string().min(1).optional(),
  PUBLIC_APP_URL: z.string().url().optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value !== "false"),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional()
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  PORT: process.env.PORT,
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  WORKBOOK_STUDIO_MODEL: process.env.WORKBOOK_STUDIO_MODEL,
  GENNY_LOVO_API_KEY: process.env.GENNY_LOVO_API_KEY,
  GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME,
  GOOGLE_APPLICATION_CREDENTIALS_JSON: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
  GOOGLE_APPLICATION_CREDENTIALS_JSON_B64: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_B64,
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
  GCP_REGION: process.env.GCP_REGION,
  GCP_PROCESSOR_JOB_NAME: process.env.GCP_PROCESSOR_JOB_NAME,
  PROCESSOR_MAX_JOBS: process.env.PROCESSOR_MAX_JOBS,
  PROCESSOR_MAX_RUNTIME_SECONDS: process.env.PROCESSOR_MAX_RUNTIME_SECONDS,
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
  ADMIN_ALERT_WEBHOOK_URL: process.env.ADMIN_ALERT_WEBHOOK_URL,
  MAINTENANCE_JOB_SECRET: process.env.MAINTENANCE_JOB_SECRET,
  MAINTENANCE_STALE_LESSON_MINUTES: process.env.MAINTENANCE_STALE_LESSON_MINUTES,
  MAINTENANCE_ERROR_RETRY_MINUTES: process.env.MAINTENANCE_ERROR_RETRY_MINUTES,
  BILLING_GUARD_ENABLED: process.env.BILLING_GUARD_ENABLED,
  STRIPE_CHECKOUT_MONTHLY_URL: process.env.STRIPE_CHECKOUT_MONTHLY_URL,
  STRIPE_CHECKOUT_YEARLY_URL: process.env.STRIPE_CHECKOUT_YEARLY_URL,
  STRIPE_CUSTOMER_PORTAL_URL: process.env.STRIPE_CUSTOMER_PORTAL_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PLAN_PACK_PRICE_ID: process.env.STRIPE_PLAN_PACK_PRICE_ID,
  STRIPE_SINGLE_MONTHLY_PRICE_ID: process.env.STRIPE_SINGLE_MONTHLY_PRICE_ID,
  STRIPE_SINGLE_YEARLY_PRICE_ID: process.env.STRIPE_SINGLE_YEARLY_PRICE_ID,
  STRIPE_MONTHLY_PRICE_ID: process.env.STRIPE_MONTHLY_PRICE_ID,
  STRIPE_YEARLY_PRICE_ID: process.env.STRIPE_YEARLY_PRICE_ID,
  STRIPE_ADDITIONAL_STUDENT_MONTHLY_PRICE_ID: process.env.STRIPE_ADDITIONAL_STUDENT_MONTHLY_PRICE_ID,
  STRIPE_ADDITIONAL_STUDENT_YEARLY_PRICE_ID: process.env.STRIPE_ADDITIONAL_STUDENT_YEARLY_PRICE_ID,
  META_PIXEL_ID: process.env.META_PIXEL_ID,
  META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION,
  META_CONVERSIONS_API_ACCESS_TOKEN: process.env.META_CONVERSIONS_API_ACCESS_TOKEN,
  META_CONVERSIONS_API_TEST_EVENT_CODE: process.env.META_CONVERSIONS_API_TEST_EVENT_CODE,
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  SMTP_FROM: process.env.SMTP_FROM
});

export const client = postgres(env.DATABASE_URL, {
  max: 1,
  prepare: false
});

export const db = drizzle(client, {
  schema
});
