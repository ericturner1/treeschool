import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const curriculumNodeTypeEnum = pgEnum("curriculum_node_type", [
  "program",
  "grade",
  "subject",
  "domain",
  "cluster",
  "skill"
]);

export const uiThemeEnum = pgEnum("ui_theme", ["playful", "academic"]);

export const skillProgressStatusEnum = pgEnum("skill_progress_status", [
  "not_started",
  "in_progress",
  "mastered",
  "needs_review"
]);

export const studentVocabularyStatusEnum = pgEnum("student_vocabulary_status", [
  "candidate",
  "in_progress",
  "known",
  "blocked"
]);

export const masteryStatusEnum = pgEnum("mastery_status", [
  "LOCKED",
  "UNLOCKED",
  "REAFFIRMING",
  "MASTERED"
]);

export const accountPlanTypeEnum = pgEnum("account_plan_type", ["free", "premium"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled"
]);
export const billingSubjectTypeEnum = pgEnum("billing_subject_type", ["core", "elective"]);

export const profileRoleEnum = pgEnum("profile_role", ["PARENT", "STUDENT"]);
export const accountMemberRoleEnum = pgEnum("account_member_role", ["OWNER", "ADMIN", "TEACHER"]);
export const accountInvitationStatusEnum = pgEnum("account_invitation_status", [
  "PENDING",
  "ACCEPTED",
  "REVOKED"
]);

export const denominationTypeEnum = pgEnum("denomination_type", ["COIN", "BILL"]);

export const lessonStatusEnum = pgEnum("lesson_status", ["draft", "ready"]);
export const lessonGenerationJobStatusEnum = pgEnum("lesson_generation_job_status", [
  "queued",
  "running",
  "retry_wait",
  "failed",
  "completed"
]);

export const streakModeEnum = pgEnum("streak_mode", ["daily", "weekly"]);
export const gradingSchemeEnum = pgEnum("grading_scheme", ["us", "jp"]);
export const lessonDispositionEnum = pgEnum("lesson_disposition", [
  "include",
  "already_mastered",
  "save_for_later",
  "remove"
]);
export const workbookUnitProgressStatusEnum = pgEnum("workbook_unit_progress_status", [
  "completed",
  "mastered",
  "deferred"
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull()
});

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  planType: accountPlanTypeEnum("plan_type").notNull().default("free")
});

export const accountPreferences = pgTable("account_preferences", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, {
      onDelete: "cascade"
    }),
  preferredPrintPageSize: text("preferred_print_page_size").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const subscriptions = pgTable("subscriptions", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, {
      onDelete: "cascade"
    }),
  status: subscriptionStatusEnum("status").notNull().default("trialing"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingInterval: text("billing_interval"),
  introductoryOffer: text("introductory_offer"),
  stripeAdditionalStudentItemId: text("stripe_additional_student_item_id"),
  additionalStudentQuantity: integer("additional_student_quantity").notNull().default(0),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const currencies = pgTable("currencies", {
  code: varchar("code", { length: 3 }).primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  minorUnit: integer("minor_unit").notNull().default(2)
});

export const locales = pgTable(
  "locales",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryCode: varchar("country_code", { length: 2 }).notNull(),
    languageCode: text("language_code").notNull(),
    currencyCode: varchar("currency_code", { length: 3 })
      .notNull()
      .references(() => currencies.code, {
        onDelete: "restrict"
      })
  },
  (table) => ({
    countryLanguageUnique: unique("locales_country_language_unique").on(
      table.countryCode,
      table.languageCode
    )
  })
);

export const denominations = pgTable(
  "denominations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    currencyCode: varchar("currency_code", { length: 3 })
      .notNull()
      .references(() => currencies.code, {
        onDelete: "cascade"
      }),
    name: text("name").notNull(),
    minorValue: integer("minor_value").notNull(),
    type: denominationTypeEnum("type").notNull(),
    rank: integer("rank").notNull()
  },
  (table) => ({
    currencyRankUnique: unique("denominations_currency_rank_unique").on(
      table.currencyCode,
      table.rank
    )
  })
);

export const curriculumNodes = pgTable(
  "curriculum_nodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id").references((): AnyPgColumn => curriculumNodes.id, {
      onDelete: "cascade"
    }),
    type: curriculumNodeTypeEnum("type").notNull(),
    title: text("title").notNull(),
    order: integer("order").notNull().default(0),
    slug: text("slug"),
    introducedInWeek: integer("introduced_in_week"),
    displayOrder: integer("display_order").notNull().default(0),
    skillObjective: text("skill_objective"),
    technicalKeywords: text("technical_keywords")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    externalReference: text("external_reference")
  },
  (table) => ({
    slugUnique: unique("curriculum_nodes_slug_unique").on(table.slug)
  })
);

export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, {
      onDelete: "cascade"
    }),
  userId: uuid("user_id").references(() => users.id, {
    onDelete: "set null"
  }),
  role: profileRoleEnum("role").notNull(),
  accountRole: accountMemberRoleEnum("account_role"),
  isAdmin: boolean("is_admin").notNull().default(false),
  firstName: text("first_name").notNull(),
  slug: text("slug"),
  birthDate: date("birth_date", { mode: "date" }),
  gradeLevel: integer("grade_level"),
  accessPin: varchar("access_pin", { length: 4 }),
  avatarUrl: text("avatar_url"),
  languagePreference: text("language_preference").notNull().default("en-US"),
  localeId: uuid("locale_id").references(() => locales.id, {
    onDelete: "set null"
  }),
  currentNodeId: uuid("current_node_id").references(() => curriculumNodes.id, {
    onDelete: "set null"
  }),
  streakCount: integer("streak_count").notNull().default(0),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  gradingScheme: gradingSchemeEnum("grading_scheme").notNull().default("us"),
  learningProfileNotes: text("learning_profile_notes"),
  subjectStrengths: jsonb("subject_strengths")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  learningProfileUpdatedAt: timestamp("learning_profile_updated_at", { withTimezone: true }),
  uiTheme: uiThemeEnum("ui_theme").notNull().default("playful")
});

export const studentProfileCheckouts = pgTable(
  "student_profile_checkouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plannedProfileId: uuid("planned_profile_id").notNull(),
    profileData: jsonb("profile_data")
      .$type<{
        firstName: string;
        birthDate: string;
        gradeLevel: number;
        accessPin?: string;
        avatarUrl?: string;
        uiTheme?: "playful" | "academic";
        languagePreference?: string;
        learningProfileNotes?: string;
        subjectStrengths?: Record<string, string>;
      }>()
      .notNull(),
    status: text("status").notNull().default("pending"),
    amountInCents: integer("amount_in_cents").notNull(),
    recurringAmountInCents: integer("recurring_amount_in_cents").notNull(),
    recurringInterval: text("recurring_interval").notNull(),
    targetAdditionalStudentQuantity: integer("target_additional_student_quantity").notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    checkoutUrl: text("checkout_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    accountStatusIndex: index("student_profile_checkouts_account_status_idx").on(
      table.accountId,
      table.status,
      table.createdAt
    )
  })
);

export const accountInvitations = pgTable(
  "account_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: accountMemberRoleEnum("role").notNull().default("TEACHER"),
    status: accountInvitationStatusEnum("status").notNull().default("PENDING"),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    accountEmailUnique: unique("account_invitations_account_email_unique").on(
      table.accountId,
      table.email
    ),
    emailStatusIndex: index("account_invitations_email_status_idx").on(
      table.email,
      table.status
    )
  })
);

export const streakSettings = pgTable("streak_settings", {
  profileId: uuid("profile_id")
    .primaryKey()
    .references(() => profiles.id, {
      onDelete: "cascade"
    }),
  mode: streakModeEnum("mode").notNull().default("daily"),
  timeZone: text("time_zone").notNull().default("UTC"),
  pausedWeekdays: integer("paused_weekdays")
    .array()
    .notNull()
    .default(sql`ARRAY[]::integer[]`),
  pausedWeeks: jsonb("paused_weeks")
    .notNull()
    .default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    type: billingSubjectTypeEnum("type").notNull().default("elective"),
    priceInCents: integer("price_in_cents").notNull(),
    currencyCode: varchar("currency_code", { length: 3 })
      .notNull()
      .references(() => currencies.code, {
        onDelete: "restrict"
      }),
    stripePriceId: text("stripe_price_id"),
    checkoutUrl: text("checkout_url"),
    curriculumNodeId: uuid("curriculum_node_id").references(() => curriculumNodes.id, {
      onDelete: "set null"
    }),
    active: boolean("active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0)
  },
  (table) => ({
    slugUnique: unique("subjects_slug_unique").on(table.slug)
  })
);

export const accountPurchases = pgTable(
  "account_purchases",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade"
      }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, {
        onDelete: "cascade"
      }),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).defaultNow().notNull(),
    providerReference: text("provider_reference")
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.accountId, table.subjectId],
      name: "account_purchases_pk"
    })
  })
);

export const curriculumSubjects = pgTable(
  "curriculum_subjects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    curriculumAreaKey: text("curriculum_area_key").notNull(),
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    displayOrder: integer("display_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    keyUnique: unique("curriculum_subjects_key_unique").on(table.key),
    areaIndex: index("curriculum_subjects_area_idx").on(
      table.curriculumAreaKey,
      table.active,
      table.displayOrder
    )
  })
);

export const nativeWorkbooks = pgTable(
  "native_workbooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    curriculumSubjectId: uuid("curriculum_subject_id").references(() => curriculumSubjects.id, {
      onDelete: "set null"
    }),
    subjectKey: text("subject_key").notNull(),
    subjectLabel: text("subject_label").notNull(),
    curriculumAreaKey: text("curriculum_area_key").notNull().default("other"),
    gradeMin: integer("grade_min").notNull(),
    gradeMax: integer("grade_max").notNull(),
    languageCode: text("language_code").notNull().default("en"),
    description: text("description").notNull(),
    coverageTags: text("coverage_tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    type: billingSubjectTypeEnum("type").notNull().default("core"),
    priceInCents: integer("price_in_cents").notNull(),
    currencyCode: varchar("currency_code", { length: 3 })
      .notNull()
      .references(() => currencies.code, { onDelete: "restrict" }),
    thumbnailObjectPath: text("thumbnail_object_path").notNull(),
    prerequisiteWorkbookId: uuid("prerequisite_workbook_id").references(
      (): AnyPgColumn => nativeWorkbooks.id,
      { onDelete: "set null" }
    ),
    status: text("status").notNull().default("draft"),
    activeVersionId: uuid("active_version_id"),
    stripeProductId: text("stripe_product_id"),
    stripePriceId: text("stripe_price_id"),
    active: boolean("active").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    slugUnique: unique("native_workbooks_slug_unique").on(table.slug),
    browseIndex: index("native_workbooks_browse_idx").on(
      table.active,
      table.gradeMin,
      table.subjectKey
    ),
    curriculumAreaIndex: index("native_workbooks_curriculum_area_idx").on(
      table.active,
      table.curriculumAreaKey,
      table.gradeMin,
      table.gradeMax
    )
  })
);

export const nativeWorkbookBundles = pgTable(
  "native_workbook_bundles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    priceInCents: integer("price_in_cents").notNull(),
    currencyCode: varchar("currency_code", { length: 3 })
      .notNull()
      .references(() => currencies.code, { onDelete: "restrict" }),
    thumbnailObjectPath: text("thumbnail_object_path").notNull(),
    stripeProductId: text("stripe_product_id"),
    stripePriceId: text("stripe_price_id"),
    active: boolean("active").notNull().default(true),
    isRecommendedCurriculum: boolean("is_recommended_curriculum").notNull().default(false),
    recommendedGradeLevel: integer("recommended_grade_level"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    slugUnique: unique("native_workbook_bundles_slug_unique").on(table.slug),
    activeIndex: index("native_workbook_bundles_active_idx").on(table.active, table.createdAt),
    recommendationIndex: index("native_workbook_bundles_recommendation_idx").on(
      table.active,
      table.isRecommendedCurriculum,
      table.recommendedGradeLevel,
      table.createdAt
    )
  })
);

export const nativeWorkbookBundleItems = pgTable(
  "native_workbook_bundle_items",
  {
    bundleId: uuid("bundle_id")
      .notNull()
      .references(() => nativeWorkbookBundles.id, { onDelete: "cascade" }),
    workbookId: uuid("workbook_id")
      .notNull()
      .references(() => nativeWorkbooks.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.bundleId, table.workbookId],
      name: "native_workbook_bundle_items_pk"
    }),
    orderUnique: unique("native_workbook_bundle_items_order_unique").on(
      table.bundleId,
      table.sortOrder
    ),
    workbookIndex: index("native_workbook_bundle_items_workbook_idx").on(table.workbookId)
  })
);

export const nativeWorkbookVersions = pgTable(
  "native_workbook_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workbookId: uuid("workbook_id")
      .notNull()
      .references(() => nativeWorkbooks.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    editionLabel: text("edition_label").notNull().default("1st edition"),
    originalFilename: text("original_filename").notNull(),
    objectPath: text("object_path").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    sizeBytes: integer("size_bytes").notNull(),
    pageCount: integer("page_count").notNull().default(0),
    contentFingerprint: text("content_fingerprint"),
    analysisStatus: text("analysis_status").notNull().default("queued"),
    analysisJson: jsonb("analysis_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    curriculumCoverageProfile: jsonb("curriculum_coverage_profile")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    curriculumCoverageFrameworkVersion: text("curriculum_coverage_framework_version"),
    curriculumCoverageProfiledAt: timestamp("curriculum_coverage_profiled_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true })
  },
  (table) => ({
    workbookVersionUnique: unique("native_workbook_versions_workbook_version_unique").on(
      table.workbookId,
      table.versionNumber
    ),
    statusIndex: index("native_workbook_versions_status_idx").on(table.analysisStatus)
  })
);

export const nativeWorkbookJobs = pgTable(
  "native_workbook_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workbookVersionId: uuid("workbook_version_id")
      .notNull()
      .references(() => nativeWorkbookVersions.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    workerId: text("worker_id"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    versionUnique: unique("native_workbook_jobs_version_unique").on(table.workbookVersionId),
    queueIndex: index("native_workbook_jobs_queue_idx").on(table.status, table.availableAt)
  })
);

export const nativeWorkbookPurchases = pgTable(
  "native_workbook_purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workbookId: uuid("workbook_id")
      .notNull()
      .references(() => nativeWorkbooks.id, { onDelete: "restrict" }),
    workbookVersionId: uuid("workbook_version_id")
      .notNull()
      .references(() => nativeWorkbookVersions.id, { onDelete: "restrict" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    amountInCents: integer("amount_in_cents").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    status: text("status").notNull().default("paid"),
    deliveryStatus: text("delivery_status").notNull().default("pending"),
    deliveryError: text("delivery_error"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).defaultNow().notNull(),
    refundedAt: timestamp("refunded_at", { withTimezone: true })
  },
  (table) => ({
    checkoutWorkbookUnique: unique("native_workbook_purchases_checkout_workbook_unique").on(
      table.stripeCheckoutSessionId,
      table.workbookId
    ),
    accountIndex: index("native_workbook_purchases_account_idx").on(
      table.accountId,
      table.purchasedAt
    ),
    emailIndex: index("native_workbook_purchases_email_idx").on(table.email)
  })
);

export const nativeWorkbookDownloadLinks = pgTable(
  "native_workbook_download_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => nativeWorkbookPurchases.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    downloadCount: integer("download_count").notNull().default(0),
    lastDownloadedAt: timestamp("last_downloaded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tokenUnique: unique("native_workbook_download_links_token_unique").on(table.tokenHash),
    purchaseIndex: index("native_workbook_download_links_purchase_idx").on(table.purchaseId)
  })
);

export const skills = pgTable("skills", {
  nodeId: uuid("node_id")
    .primaryKey()
    .references(() => curriculumNodes.id, {
      onDelete: "cascade"
    }),
  difficulty: integer("difficulty").notNull(),
  masteryThreshold: real("mastery_threshold").notNull(),
  learningObjectives: text("learning_objectives").notNull(),
  pedagogicalTone: text("pedagogical_tone"),
  visualConstraint: text("visual_constraint")
});

export const localizedContent = pgTable(
  "localized_content",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => curriculumNodes.id, {
        onDelete: "cascade"
      }),
    languageCode: text("language_code").notNull(),
    contentJson: jsonb("content_json").notNull()
  },
  (table) => ({
    nodeLanguageUnique: unique("localized_content_node_language_unique").on(
      table.nodeId,
      table.languageCode
    )
  })
);

export const nodeTranslations = pgTable(
  "node_translations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => curriculumNodes.id, {
        onDelete: "cascade"
      }),
    languageCode: text("language_code").notNull(),
    title: text("title").notNull(),
    description: text("description")
  },
  (table) => ({
    nodeLanguageUnique: unique("node_translations_node_language_unique").on(
      table.nodeId,
      table.languageCode
    )
  })
);

export const skillProgress = pgTable(
  "skill_progress",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, {
        onDelete: "cascade"
      }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.nodeId, {
        onDelete: "cascade"
      }),
    status: skillProgressStatusEnum("status").notNull().default("not_started"),
    score: real("score").notNull().default(0)
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.profileId, table.skillId]
    })
  })
);

export const nodeConfigurations = pgTable(
  "node_configurations",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, {
        onDelete: "cascade"
      }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => curriculumNodes.id, {
        onDelete: "cascade"
      }),
    isDisabled: boolean("is_disabled").notNull().default(false),
    pacingMultiplier: real("pacing_multiplier").notNull().default(1)
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.profileId, table.nodeId]
    })
  })
);

export const schedules = pgTable("schedules", {
  profileId: uuid("profile_id")
    .primaryKey()
    .references(() => profiles.id, {
      onDelete: "cascade"
    }),
  weeklyPlan: jsonb("weekly_plan").notNull()
});

export const lexicon = pgTable(
  "lexicon",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    word: text("word").notNull(),
    languageCode: text("language_code").notNull(),
    introducedAtLevel: integer("introduced_at_level").notNull(),
    definitionSimple: text("definition_simple"),
    preferredSynonym: text("preferred_synonym")
  },
  (table) => ({
    wordLanguageUnique: unique("lexicon_word_language_unique").on(
      table.word,
      table.languageCode
    )
  })
);

export const studentVocabulary = pgTable(
  "student_vocabulary",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, {
        onDelete: "cascade"
      }),
    wordId: uuid("word_id")
      .notNull()
      .references(() => lexicon.id, {
        onDelete: "cascade"
      }),
    status: studentVocabularyStatusEnum("status").notNull().default("candidate"),
    manuallyOverridden: boolean("manually_overridden").notNull().default(false)
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.profileId, table.wordId]
    })
  })
);

export const studentMastery = pgTable(
  "student_mastery",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, {
        onDelete: "cascade"
      }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => skills.nodeId, {
        onDelete: "cascade"
      }),
    attemptCount: integer("attempt_count").notNull().default(0),
    smartScore: integer("smart_score").notNull().default(0),
    reaffirmationCount: integer("reaffirmation_count").notNull().default(0),
    requiredReaffirmations: integer("required_reaffirmations").notNull().default(3),
    status: masteryStatusEnum("status").notNull().default("LOCKED"),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    lastSuccessfulAt: timestamp("last_successful_at", { withTimezone: true }),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
    masteredAt: timestamp("mastered_at", { withTimezone: true })
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.profileId, table.nodeId]
    })
  })
);

export const learningActivityEvents = pgTable("learning_activity_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, {
      onDelete: "cascade"
    }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  source: text("source").notNull().default("lesson")
});

export const learningYears = pgTable("learning_years", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, {
      onDelete: "cascade"
    }),
  title: text("title").notNull(),
  totalWeeks: integer("total_weeks").notNull().default(36),
  teachingDaysPerWeek: integer("teaching_days_per_week").default(5),
  printPageSize: text("print_page_size").notNull().default("letter"),
  startDate: date("start_date", { mode: "date" }),
  endDate: date("end_date", { mode: "date" }),
  status: text("status").notNull().default("draft"),
  materialsUpdatedAt: timestamp("materials_updated_at", { withTimezone: true }).defaultNow().notNull(),
  curriculumCompletenessResult: jsonb("curriculum_completeness_result").$type<unknown>(),
  curriculumCompletenessInputFingerprint: text("curriculum_completeness_input_fingerprint"),
  curriculumCompletenessReviewedAt: timestamp("curriculum_completeness_reviewed_at", { withTimezone: true }),
  lastPlannedAt: timestamp("last_planned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const learningYearSubjectPreferences = pgTable(
  "learning_year_subject_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    learningYearId: uuid("learning_year_id")
      .notNull()
      .references(() => learningYears.id, {
        onDelete: "cascade"
      }),
    subjectId: uuid("subject_id").references(() => curriculumNodes.id, {
      onDelete: "set null"
    }),
    subjectKey: text("subject_key").notNull(),
    subjectLabel: text("subject_label").notNull(),
    daysPerWeek: integer("days_per_week"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    learningYearSubjectUnique: unique("learning_year_subject_preferences_year_subject_unique").on(
      table.learningYearId,
      table.subjectKey
    )
  })
);

export const learningYearMaterialSets = pgTable("learning_year_material_sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  learningYearId: uuid("learning_year_id")
    .notNull()
    .references(() => learningYears.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  prerequisiteMaterialSetId: uuid("prerequisite_material_set_id").references(
    (): AnyPgColumn => learningYearMaterialSets.id,
    { onDelete: "set null" }
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const contentDocuments = pgTable("content_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  learningYearId: uuid("learning_year_id")
    .notNull()
    .references(() => learningYears.id, {
      onDelete: "cascade"
    }),
  materialSetId: uuid("material_set_id")
    .notNull()
    .references(() => learningYearMaterialSets.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  subjectId: uuid("subject_id").references(() => curriculumNodes.id, {
    onDelete: "set null"
  }),
  subjectLabel: text("subject_label"),
  documentRole: text("document_role").notNull().default("student"),
  originalFilename: text("original_filename").notNull(),
  objectPath: text("object_path").notNull(),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  sourceKind: text("source_kind").notNull().default("pdf"),
  nativeWorkbookVersionId: uuid("native_workbook_version_id").references(
    () => nativeWorkbookVersions.id,
    { onDelete: "restrict" }
  ),
  clientUploadId: text("client_upload_id"),
  sizeBytes: integer("size_bytes").notNull(),
  pageCount: integer("page_count").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  parentNotes: text("parent_notes"),
  analysisStatus: text("analysis_status").notNull().default("pending"),
  analysisJson: jsonb("analysis_json")
    .notNull()
    .default(sql`'{}'::jsonb`),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  retainedUntil: timestamp("retained_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  learningYearClientUploadUnique: unique("content_documents_learning_year_client_upload_unique").on(
    table.learningYearId,
    table.clientUploadId
  )
}));

export const planGenerationEvents = pgTable("plan_generation_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  learningYearId: uuid("learning_year_id")
    .notNull()
    .references(() => learningYears.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("initial"),
  allowanceSource: text("allowance_source").notNull().default("initial"),
  periodKey: text("period_key"),
  status: text("status").notNull().default("queued"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true })
});

export const planVersions = pgTable("plan_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  learningYearId: uuid("learning_year_id")
    .notNull()
    .references(() => learningYears.id, { onDelete: "cascade" }),
  generationEventId: uuid("generation_event_id").references(() => planGenerationEvents.id, {
    onDelete: "set null"
  }),
  status: text("status").notNull().default("generating"),
  sourceDocumentIds: jsonb("source_document_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  snapshotJson: jsonb("snapshot_json").notNull().default(sql`'{}'::jsonb`),
  metadataQualityStatus: text("metadata_quality_status").notNull().default("pending"),
  metadataQualityReport: jsonb("metadata_quality_report")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  metadataQualityCheckedAt: timestamp("metadata_quality_checked_at", { withTimezone: true }),
  restoreUntil: timestamp("restore_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true })
});

export const planVersionWeeks = pgTable(
  "plan_version_weeks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planVersionId: uuid("plan_version_id")
      .notNull()
      .references(() => planVersions.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    weekJson: jsonb("week_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    versionWeekUnique: unique("plan_version_weeks_version_week_unique").on(
      table.planVersionId,
      table.weekNumber
    )
  })
);

export const paperDocumentJobs = pgTable(
  "paper_document_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => contentDocuments.id, {
        onDelete: "cascade"
      }),
    status: text("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    workerId: text("worker_id"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    documentUnique: unique("paper_document_jobs_document_unique").on(table.documentId)
  })
);

export const weeklyPlans = pgTable(
  "weekly_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    learningYearId: uuid("learning_year_id")
      .notNull()
      .references(() => learningYears.id, {
        onDelete: "cascade"
      }),
    weekNumber: integer("week_number").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    status: text("status").notNull().default("planned"),
    grade: integer("grade"),
    parentNotes: text("parent_notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    learningYearWeekUnique: unique("weekly_plans_learning_year_week_unique").on(
      table.learningYearId,
      table.weekNumber
    )
  })
);

export const weeklyPlanJobs = pgTable(
  "weekly_plan_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    learningYearId: uuid("learning_year_id")
      .notNull()
      .references(() => learningYears.id, {
        onDelete: "cascade"
      }),
    planVersionId: uuid("plan_version_id").references(() => planVersions.id, {
      onDelete: "cascade"
    }),
    weekNumber: integer("week_number").notNull(),
    status: text("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    workerId: text("worker_id"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    learningYearWeekUnique: unique("weekly_plan_jobs_learning_year_week_unique").on(
      table.learningYearId,
      table.weekNumber
    )
  })
);

export const planGenerationDiagnostics = pgTable("plan_generation_diagnostics", {
  id: uuid("id").defaultRandom().primaryKey(),
  learningYearId: uuid("learning_year_id")
    .notNull()
    .references(() => learningYears.id, { onDelete: "cascade" }),
  weeklyPlanJobId: uuid("weekly_plan_job_id").references(() => weeklyPlanJobs.id, {
    onDelete: "set null"
  }),
  planVersionId: uuid("plan_version_id").references(() => planVersions.id, {
    onDelete: "set null"
  }),
  weekNumber: integer("week_number"),
  attemptNumber: integer("attempt_number"),
  stage: text("stage").notNull(),
  provider: text("provider"),
  model: text("model"),
  errorName: text("error_name"),
  errorMessage: text("error_message").notNull(),
  errorDetails: jsonb("error_details")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  willRetry: boolean("will_retry").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const modelUsageEvents = pgTable(
  "model_usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null"
    }),
    learningYearId: uuid("learning_year_id").references(() => learningYears.id, {
      onDelete: "set null"
    }),
    planGenerationEventId: uuid("plan_generation_event_id").references(
      () => planGenerationEvents.id,
      { onDelete: "set null" }
    ),
    planVersionId: uuid("plan_version_id").references(() => planVersions.id, {
      onDelete: "set null"
    }),
    contentDocumentId: uuid("content_document_id").references(() => contentDocuments.id, {
      onDelete: "set null"
    }),
    paperDocumentJobId: uuid("paper_document_job_id").references(() => paperDocumentJobs.id, {
      onDelete: "set null"
    }),
    nativeWorkbookVersionId: uuid("native_workbook_version_id").references(
      () => nativeWorkbookVersions.id,
      { onDelete: "set null" }
    ),
    nativeWorkbookJobId: uuid("native_workbook_job_id").references(
      () => nativeWorkbookJobs.id,
      { onDelete: "set null" }
    ),
    weeklyPlanJobId: uuid("weekly_plan_job_id").references(() => weeklyPlanJobs.id, {
      onDelete: "set null"
    }),
    feature: text("feature").notNull().default("lesson_plan"),
    operation: text("operation").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull().default("succeeded"),
    providerRequestId: text("provider_request_id"),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    toolTokens: integer("tool_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    providerUsageJson: jsonb("provider_usage_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    generationEventCreatedIndex: index("model_usage_events_generation_event_created_idx").on(
      table.planGenerationEventId,
      table.createdAt
    ),
    learningYearCreatedIndex: index("model_usage_events_learning_year_created_idx").on(
      table.learningYearId,
      table.createdAt
    ),
    accountCreatedIndex: index("model_usage_events_account_created_idx").on(
      table.accountId,
      table.createdAt
    ),
    providerModelCreatedIndex: index("model_usage_events_provider_model_created_idx").on(
      table.provider,
      table.model,
      table.createdAt
    )
  })
);

export const weeklyPlanPdfAssets = pgTable(
  "weekly_plan_pdf_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weeklyPlanId: uuid("weekly_plan_id")
      .notNull()
      .references(() => weeklyPlans.id, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull(),
    filename: text("filename").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    qualityStatus: text("quality_status").notNull().default("unverified"),
    qualityReport: jsonb("quality_report").$type<Record<string, unknown>>().notNull().default({}),
    qualityCheckedAt: timestamp("quality_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    weeklyPlanUnique: unique("weekly_plan_pdf_assets_weekly_plan_unique").on(table.weeklyPlanId)
  })
);

export const weeklyPlanDayPdfAssets = pgTable(
  "weekly_plan_day_pdf_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weeklyPlanId: uuid("weekly_plan_id")
      .notNull()
      .references(() => weeklyPlans.id, { onDelete: "cascade" }),
    dayNumber: integer("day_number").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    objectPath: text("object_path").notNull(),
    filename: text("filename").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    qualityStatus: text("quality_status").notNull().default("unverified"),
    qualityReport: jsonb("quality_report").$type<Record<string, unknown>>().notNull().default({}),
    qualityCheckedAt: timestamp("quality_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    weeklyPlanDayUnique: unique("weekly_plan_day_pdf_assets_week_day_unique").on(
      table.weeklyPlanId,
      table.dayNumber
    )
  })
);

export const weeklyPlanItems = pgTable("weekly_plan_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  weeklyPlanId: uuid("weekly_plan_id")
    .notNull()
    .references(() => weeklyPlans.id, {
      onDelete: "cascade"
    }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => contentDocuments.id, {
      onDelete: "cascade"
    }),
  firstPageIndex: integer("first_page_index").notNull(),
  lastPageIndex: integer("last_page_index").notNull(),
  label: text("label").notNull(),
  dayLabel: text("day_label"),
  dayNumber: integer("day_number"),
  pageRangeCategory: text("page_range_category").notNull().default("other"),
  contentPageStart: integer("content_page_start"),
  contentPageEnd: integer("content_page_end"),
  pageSelectionAudit: jsonb("page_selection_audit").$type<Record<string, unknown>>().notNull().default({}),
  sourceUnitId: text("source_unit_id"),
  sourceUnitPartIndex: integer("source_unit_part_index"),
  conceptLabels: jsonb("concept_labels").$type<string[]>().notNull().default([]),
  conceptRedundant: boolean("concept_redundant").notNull().default(false),
  redundancyReason: text("redundancy_reason"),
  baseIncludedInPacket: boolean("base_included_in_packet").notNull().default(true),
  includedInPacket: boolean("included_in_packet").notNull().default(true),
  lessonDisposition: lessonDispositionEnum("lesson_disposition").notNull().default("include"),
  sortOrder: integer("sort_order").notNull().default(0)
});

export const studentLessonDispositions = pgTable(
  "student_lesson_dispositions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    learningYearId: uuid("learning_year_id")
      .notNull()
      .references(() => learningYears.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => contentDocuments.id, { onDelete: "cascade" }),
    sourceUnitKey: text("source_unit_key").notNull(),
    sourceUnitId: text("source_unit_id"),
    disposition: lessonDispositionEnum("disposition").notNull().default("include"),
    conceptLabels: jsonb("concept_labels").$type<string[]>().notNull().default([]),
    selectedByUserId: uuid("selected_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    selectedAt: timestamp("selected_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    lessonUnique: unique("student_lesson_dispositions_profile_document_unit_unique").on(
      table.profileId,
      table.documentId,
      table.sourceUnitKey
    ),
    learningYearIndex: index("student_lesson_dispositions_learning_year_idx").on(
      table.learningYearId
    )
  })
);

export const studentWorkbookUnitProgress = pgTable(
  "student_workbook_unit_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    nativeWorkbookVersionId: uuid("native_workbook_version_id")
      .notNull()
      .references(() => nativeWorkbookVersions.id, { onDelete: "restrict" }),
    sourceUnitId: text("source_unit_id").notNull(),
    status: workbookUnitProgressStatusEnum("status").notNull(),
    sourceLearningYearId: uuid("source_learning_year_id").references(
      () => learningYears.id,
      { onDelete: "set null" }
    ),
    sourceWeeklyPlanId: uuid("source_weekly_plan_id").references(
      () => weeklyPlans.id,
      { onDelete: "set null" }
    ),
    selectedByUserId: uuid("selected_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    unitUnique: unique("student_workbook_unit_progress_profile_version_unit_unique").on(
      table.profileId,
      table.nativeWorkbookVersionId,
      table.sourceUnitId
    ),
    profileStatusIndex: index("student_workbook_unit_progress_profile_status_idx").on(
      table.profileId,
      table.status
    ),
    versionIndex: index("student_workbook_unit_progress_version_idx").on(
      table.nativeWorkbookVersionId
    )
  })
);

export const weeklyPlanSubjectGrades = pgTable(
  "weekly_plan_subject_grades",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weeklyPlanId: uuid("weekly_plan_id")
      .notNull()
      .references(() => weeklyPlans.id, {
        onDelete: "cascade"
      }),
    subjectId: uuid("subject_id").references(() => curriculumNodes.id, {
      onDelete: "set null"
    }),
    subjectKey: text("subject_key").notNull(),
    subjectLabel: text("subject_label").notNull(),
    planTitle: text("plan_title"),
    grade: integer("grade"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    weeklyPlanSubjectUnique: unique("weekly_plan_subject_grades_week_subject_unique").on(
      table.weeklyPlanId,
      table.subjectKey
    )
  })
);

export const weeklyPlanDaySubjectGrades = pgTable(
  "weekly_plan_day_subject_grades",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weeklyPlanId: uuid("weekly_plan_id")
      .notNull()
      .references(() => weeklyPlans.id, { onDelete: "cascade" }),
    dayNumber: integer("day_number").notNull(),
    subjectId: uuid("subject_id").references(() => curriculumNodes.id, { onDelete: "set null" }),
    subjectKey: text("subject_key").notNull(),
    subjectLabel: text("subject_label").notNull(),
    title: text("title"),
    score: integer("score").notNull(),
    assessmentRecommended: boolean("assessment_recommended").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    weeklyPlanDaySubjectUnique: unique("weekly_plan_day_subject_grades_week_day_subject_unique").on(
      table.weeklyPlanId,
      table.dayNumber,
      table.subjectKey
    )
  })
);

export const attendanceEntries = pgTable(
  "attendance_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    learningYearId: uuid("learning_year_id").references(() => learningYears.id, {
      onDelete: "set null"
    }),
    weeklyPlanId: uuid("weekly_plan_id").references(() => weeklyPlans.id, {
      onDelete: "set null"
    }),
    weeklyPlanItemId: uuid("weekly_plan_item_id").references(() => weeklyPlanItems.id, {
      onDelete: "set null"
    }),
    weeklyPlanDayNumber: integer("weekly_plan_day_number"),
    attendanceDate: date("attendance_date").notNull(),
    entryKind: text("entry_kind").notNull().default("manual"),
    activityType: text("activity_type").notNull().default("lesson"),
    subjectKey: text("subject_key"),
    subjectLabel: text("subject_label"),
    title: text("title").notNull(),
    notes: text("notes"),
    minutes: integer("minutes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    planItemDateUnique: unique("attendance_entries_plan_item_date_unique").on(
      table.profileId,
      table.weeklyPlanItemId,
      table.attendanceDate
    ),
    planDayDateUnique: unique("attendance_entries_plan_day_date_unique").on(
      table.profileId,
      table.weeklyPlanId,
      table.weeklyPlanDayNumber,
      table.attendanceDate
    )
  })
);

export const attendanceEntrySubjects = pgTable(
  "attendance_entry_subjects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attendanceEntryId: uuid("attendance_entry_id")
      .notNull()
      .references(() => attendanceEntries.id, { onDelete: "cascade" }),
    subjectKey: text("subject_key").notNull(),
    subjectLabel: text("subject_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    entrySubjectUnique: unique("attendance_entry_subjects_entry_subject_unique").on(
      table.attendanceEntryId,
      table.subjectKey
    )
  })
);

export const teacherActivityEvents = pgTable(
  "teacher_activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    actorProfileId: uuid("actor_profile_id").references(() => profiles.id, {
      onDelete: "set null"
    }),
    studentProfileId: uuid("student_profile_id").references(() => profiles.id, {
      onDelete: "set null"
    }),
    weeklyPlanId: uuid("weekly_plan_id").references(() => weeklyPlans.id, {
      onDelete: "set null"
    }),
    eventType: text("event_type").notNull(),
    subjectKey: text("subject_key"),
    subjectLabel: text("subject_label"),
    score: integer("score"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    accountActorDateIndex: index("teacher_activity_events_account_actor_date_idx").on(
      table.accountId,
      table.actorProfileId,
      table.occurredAt
    ),
    studentDateIndex: index("teacher_activity_events_student_date_idx").on(
      table.studentProfileId,
      table.occurredAt
    )
  })
);

export const planPackIntakes = pgTable("plan_pack_intakes", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  provisionalUserId: uuid("provisional_user_id").references(() => users.id, {
    onDelete: "set null"
  }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, {
      onDelete: "cascade"
    }),
  studentProfileId: uuid("student_profile_id").references(() => profiles.id, {
    onDelete: "set null"
  }),
  learningYearId: uuid("learning_year_id").references(() => learningYears.id, {
    onDelete: "set null"
  }),
  stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
  status: text("status").notNull().default("draft"),
  metadataJson: jsonb("metadata_json")
    .notNull()
    .default(sql`'{}'::jsonb`),
  lastError: text("last_error"),
  premiumTrialStartedAt: timestamp("premium_trial_started_at", { withTimezone: true }),
  premiumTrialEndsAt: timestamp("premium_trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const profileCurriculumEnrollments = pgTable(
  "profile_curriculum_enrollments",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, {
        onDelete: "cascade"
      }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => curriculumNodes.id, {
        onDelete: "cascade"
      }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.profileId, table.nodeId]
    })
  })
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, {
        onDelete: "cascade"
      }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => curriculumNodes.id, {
        onDelete: "cascade"
      }),
    languageCode: text("language_code").notNull(),
    title: text("title").notNull(),
    status: lessonStatusEnum("status").notNull().default("ready"),
    promptJson: jsonb("prompt_json").notNull(),
    contentJson: jsonb("content_json").notNull(),
    generationLogs: jsonb("generation_logs")
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    profileNodeLanguageUnique: unique("lessons_profile_node_language_unique").on(
      table.profileId,
      table.nodeId,
      table.languageCode
    )
  })
);

export const lessonAttempts = pgTable("lesson_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, {
      onDelete: "cascade"
    }),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, {
      onDelete: "cascade"
    }),
  nodeId: uuid("node_id")
    .notNull()
    .references(() => curriculumNodes.id, {
      onDelete: "cascade"
    }),
  score: integer("score").notNull(),
  correctCount: integer("correct_count").notNull(),
  totalQuestions: integer("total_questions").notNull(),
  passed: boolean("passed").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const lessonGenerationJobs = pgTable(
  "lesson_generation_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, {
        onDelete: "cascade"
      }),
    status: lessonGenerationJobStatusEnum("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    workerId: text("worker_id"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    lessonUnique: unique("lesson_generation_jobs_lesson_unique").on(table.lessonId)
  })
);

export const nodeKeywords = pgTable(
  "node_keywords",
  {
    nodeId: uuid("node_id")
      .notNull()
      .references(() => curriculumNodes.id, {
        onDelete: "cascade"
      }),
    wordId: uuid("word_id")
      .notNull()
      .references(() => lexicon.id, {
        onDelete: "cascade"
      }),
    priority: integer("priority").notNull().default(0)
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.nodeId, table.wordId]
    })
  })
);

export const blogPosts = pgTable(
  "blog_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("draft"),
    languageCode: text("language_code").notNull().default("en"),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    publishedRevisionNumber: integer("published_revision_number"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    statusPublishedIndex: index("blog_posts_status_published_idx").on(
      table.status,
      table.publishedAt
    )
  })
);

export const blogPostRevisions = pgTable(
  "blog_post_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => blogPosts.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    contentHtml: text("content_html").notNull(),
    contentText: text("content_text").notNull(),
    contentSchemaVersion: integer("content_schema_version").notNull().default(1),
    seoTitle: text("seo_title"),
    metaDescription: text("meta_description"),
    canonicalUrl: text("canonical_url"),
    featuredImageUrl: text("featured_image_url"),
    featuredImageAlt: text("featured_image_alt"),
    showAuthor: boolean("show_author").notNull().default(false),
    primaryKeyword: text("primary_keyword"),
    source: text("source").notNull().default("manual"),
    generationMetadataJson: jsonb("generation_metadata_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    postRevisionUnique: unique("blog_post_revisions_post_revision_unique").on(
      table.postId,
      table.revisionNumber
    ),
    postCreatedIndex: index("blog_post_revisions_post_created_idx").on(
      table.postId,
      table.createdAt
    )
  })
);

export const blogCategories = pgTable("blog_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const blogTags = pgTable("blog_tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const blogPostCategories = pgTable(
  "blog_post_categories",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => blogPosts.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => blogCategories.id, { onDelete: "cascade" })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.categoryId] })
  })
);

export const blogPostTags = pgTable(
  "blog_post_tags",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => blogPosts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => blogTags.id, { onDelete: "cascade" })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.tagId] })
  })
);

export const blogPostSlugHistory = pgTable("blog_post_slug_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: uuid("post_id")
    .notNull()
    .references(() => blogPosts.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const blogGenerationRuns = pgTable(
  "blog_generation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id").references(() => blogPosts.id, { onDelete: "set null" }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    operation: text("operation").notNull().default("draft_article"),
    status: text("status").notNull().default("running"),
    briefJson: jsonb("brief_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    providerRequestId: text("provider_request_id"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    durationMs: integer("duration_ms"),
    outputRevisionNumber: integer("output_revision_number"),
    errorMessage: text("error_message"),
    providerUsageJson: jsonb("provider_usage_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => ({
    postCreatedIndex: index("blog_generation_runs_post_created_idx").on(
      table.postId,
      table.createdAt
    )
  })
);
