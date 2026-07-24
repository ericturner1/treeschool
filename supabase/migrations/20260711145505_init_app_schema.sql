CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

--
-- PostgreSQL database dump
--


-- Dumped from database version 15.17
-- Dumped by pg_dump version 15.17

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: account_plan_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_plan_type AS ENUM (
    'free',
    'premium'
);


--
-- Name: billing_subject_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_subject_type AS ENUM (
    'core',
    'elective'
);


--
-- Name: curriculum_node_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.curriculum_node_type AS ENUM (
    'program',
    'grade',
    'subject',
    'domain',
    'cluster',
    'skill'
);


--
-- Name: denomination_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.denomination_type AS ENUM (
    'COIN',
    'BILL'
);


--
-- Name: grading_scheme; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.grading_scheme AS ENUM (
    'us',
    'jp'
);


--
-- Name: lesson_generation_job_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lesson_generation_job_status AS ENUM (
    'queued',
    'running',
    'retry_wait',
    'failed',
    'completed'
);


--
-- Name: lesson_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lesson_status AS ENUM (
    'draft',
    'ready'
);


--
-- Name: mastery_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mastery_status AS ENUM (
    'LOCKED',
    'UNLOCKED',
    'REAFFIRMING',
    'MASTERED'
);


--
-- Name: profile_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.profile_role AS ENUM (
    'PARENT',
    'STUDENT'
);


--
-- Name: skill_progress_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.skill_progress_status AS ENUM (
    'not_started',
    'in_progress',
    'mastered',
    'needs_review'
);


--
-- Name: streak_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.streak_mode AS ENUM (
    'daily',
    'weekly'
);


--
-- Name: student_vocabulary_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.student_vocabulary_status AS ENUM (
    'candidate',
    'in_progress',
    'known',
    'blocked'
);


--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled'
);


--
-- Name: ui_theme; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ui_theme AS ENUM (
    'playful',
    'academic'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_purchases (
    account_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    purchased_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_reference text
);


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    plan_type public.account_plan_type DEFAULT 'free'::public.account_plan_type NOT NULL
);


--
-- Name: content_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    learning_year_id uuid NOT NULL,
    label text NOT NULL,
    document_role text DEFAULT 'student'::text NOT NULL,
    original_filename text NOT NULL,
    object_path text NOT NULL,
    mime_type text DEFAULT 'application/pdf'::text NOT NULL,
    size_bytes integer NOT NULL,
    page_count integer NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    analysis_status text DEFAULT 'pending'::text NOT NULL,
    analysis_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_notes text,
    subject_label text,
    source_kind text DEFAULT 'pdf'::text NOT NULL,
    subject_id uuid
);


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    code character varying(3) NOT NULL,
    name text NOT NULL,
    symbol text NOT NULL,
    minor_unit integer DEFAULT 2 NOT NULL
);


--
-- Name: curriculum_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curriculum_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    type public.curriculum_node_type NOT NULL,
    title text NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    slug text,
    introduced_in_week integer,
    display_order integer DEFAULT 0 NOT NULL,
    skill_objective text,
    technical_keywords text[] DEFAULT ARRAY[]::text[] NOT NULL,
    external_reference text
);


--
-- Name: denominations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.denominations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    currency_code character varying(3) NOT NULL,
    name text NOT NULL,
    minor_value integer NOT NULL,
    type public.denomination_type NOT NULL,
    rank integer NOT NULL
);


--
-- Name: learning_activity_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_activity_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'lesson'::text NOT NULL
);


--
-- Name: learning_years; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_years (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    title text NOT NULL,
    total_weeks integer DEFAULT 36 NOT NULL,
    start_date date,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lesson_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    node_id uuid NOT NULL,
    score integer NOT NULL,
    correct_count integer NOT NULL,
    total_questions integer NOT NULL,
    passed boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lesson_generation_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_generation_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    status public.lesson_generation_job_status DEFAULT 'queued'::public.lesson_generation_job_status NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    worker_id text,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    node_id uuid NOT NULL,
    language_code text NOT NULL,
    title text NOT NULL,
    status public.lesson_status DEFAULT 'ready'::public.lesson_status NOT NULL,
    prompt_json jsonb NOT NULL,
    content_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    generation_logs jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: lexicon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lexicon (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    word text NOT NULL,
    language_code text NOT NULL,
    introduced_at_level integer NOT NULL,
    definition_simple text,
    preferred_synonym text
);


--
-- Name: locales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character varying(2) NOT NULL,
    language_code text NOT NULL,
    currency_code character varying(3) NOT NULL
);


--
-- Name: localized_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.localized_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    node_id uuid NOT NULL,
    language_code text NOT NULL,
    content_json jsonb NOT NULL
);


--
-- Name: node_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_configurations (
    profile_id uuid NOT NULL,
    node_id uuid NOT NULL,
    is_disabled boolean DEFAULT false NOT NULL,
    pacing_multiplier real DEFAULT 1 NOT NULL
);


--
-- Name: node_keywords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_keywords (
    node_id uuid NOT NULL,
    word_id uuid NOT NULL,
    priority integer DEFAULT 0 NOT NULL
);


--
-- Name: node_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_translations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    node_id uuid NOT NULL,
    language_code text NOT NULL,
    title text NOT NULL,
    description text
);


--
-- Name: paper_document_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_document_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    worker_id text,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_curriculum_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_curriculum_enrollments (
    profile_id uuid NOT NULL,
    node_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    user_id uuid,
    role public.profile_role NOT NULL,
    first_name text NOT NULL,
    grade_level integer,
    access_pin character varying(4),
    avatar_url text,
    language_preference text DEFAULT 'en-US'::text NOT NULL,
    current_node_id uuid,
    streak_count integer DEFAULT 0 NOT NULL,
    last_active_at timestamp with time zone,
    ui_theme public.ui_theme DEFAULT 'playful'::public.ui_theme NOT NULL,
    birth_date date,
    locale_id uuid,
    grading_scheme public.grading_scheme DEFAULT 'us'::public.grading_scheme NOT NULL
);


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedules (
    profile_id uuid NOT NULL,
    weekly_plan jsonb NOT NULL
);


--
-- Name: skill_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_progress (
    profile_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    status public.skill_progress_status DEFAULT 'not_started'::public.skill_progress_status NOT NULL,
    score real DEFAULT 0 NOT NULL
);


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    node_id uuid NOT NULL,
    difficulty integer NOT NULL,
    mastery_threshold real NOT NULL,
    learning_objectives text NOT NULL,
    pedagogical_tone text,
    visual_constraint text
);


--
-- Name: streak_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.streak_settings (
    profile_id uuid NOT NULL,
    mode public.streak_mode DEFAULT 'daily'::public.streak_mode NOT NULL,
    time_zone text DEFAULT 'UTC'::text NOT NULL,
    paused_weekdays integer[] DEFAULT ARRAY[]::integer[] NOT NULL,
    paused_weeks jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: student_mastery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_mastery (
    profile_id uuid NOT NULL,
    node_id uuid NOT NULL,
    smart_score integer DEFAULT 0 NOT NULL,
    reaffirmation_count integer DEFAULT 0 NOT NULL,
    required_reaffirmations integer DEFAULT 3 NOT NULL,
    status public.mastery_status DEFAULT 'LOCKED'::public.mastery_status NOT NULL,
    last_attempted_at timestamp with time zone,
    last_successful_at timestamp with time zone,
    unlocked_at timestamp with time zone,
    mastered_at timestamp with time zone,
    attempt_count integer DEFAULT 0 NOT NULL
);


--
-- Name: student_vocabulary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_vocabulary (
    profile_id uuid NOT NULL,
    word_id uuid NOT NULL,
    status public.student_vocabulary_status DEFAULT 'candidate'::public.student_vocabulary_status NOT NULL,
    manually_overridden boolean DEFAULT false NOT NULL
);


--
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    type public.billing_subject_type DEFAULT 'elective'::public.billing_subject_type NOT NULL,
    price_in_cents integer NOT NULL,
    currency_code character varying(3) NOT NULL,
    stripe_price_id text,
    checkout_url text,
    curriculum_node_id uuid,
    active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    account_id uuid NOT NULL,
    status public.subscription_status DEFAULT 'trialing'::public.subscription_status NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: weekly_plan_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_plan_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    weekly_plan_id uuid NOT NULL,
    document_id uuid NOT NULL,
    first_page_index integer NOT NULL,
    last_page_index integer NOT NULL,
    label text NOT NULL,
    day_label text,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: weekly_plan_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_plan_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    learning_year_id uuid NOT NULL,
    week_number integer NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    worker_id text,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: weekly_plan_subject_grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_plan_subject_grades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    weekly_plan_id uuid NOT NULL,
    subject_id uuid,
    subject_key text NOT NULL,
    subject_label text NOT NULL,
    grade integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: weekly_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    learning_year_id uuid NOT NULL,
    week_number integer NOT NULL,
    title text NOT NULL,
    summary text,
    status text DEFAULT 'planned'::text NOT NULL,
    grade integer,
    parent_notes text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account_purchases account_purchases_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_purchases
    ADD CONSTRAINT account_purchases_pk PRIMARY KEY (account_id, subject_id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: content_documents content_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_documents
    ADD CONSTRAINT content_documents_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (code);


--
-- Name: curriculum_nodes curriculum_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_nodes
    ADD CONSTRAINT curriculum_nodes_pkey PRIMARY KEY (id);


--
-- Name: curriculum_nodes curriculum_nodes_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_nodes
    ADD CONSTRAINT curriculum_nodes_slug_unique UNIQUE (slug);


--
-- Name: denominations denominations_currency_rank_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.denominations
    ADD CONSTRAINT denominations_currency_rank_unique UNIQUE (currency_code, rank);


--
-- Name: denominations denominations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.denominations
    ADD CONSTRAINT denominations_pkey PRIMARY KEY (id);


--
-- Name: learning_activity_events learning_activity_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activity_events
    ADD CONSTRAINT learning_activity_events_pkey PRIMARY KEY (id);


--
-- Name: learning_years learning_years_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_years
    ADD CONSTRAINT learning_years_pkey PRIMARY KEY (id);


--
-- Name: lesson_attempts lesson_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_attempts
    ADD CONSTRAINT lesson_attempts_pkey PRIMARY KEY (id);


--
-- Name: lesson_generation_jobs lesson_generation_jobs_lesson_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_generation_jobs
    ADD CONSTRAINT lesson_generation_jobs_lesson_unique UNIQUE (lesson_id);


--
-- Name: lesson_generation_jobs lesson_generation_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_generation_jobs
    ADD CONSTRAINT lesson_generation_jobs_pkey PRIMARY KEY (id);


--
-- Name: lessons lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);


--
-- Name: lessons lessons_profile_node_language_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_profile_node_language_unique UNIQUE (profile_id, node_id, language_code);


--
-- Name: lexicon lexicon_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lexicon
    ADD CONSTRAINT lexicon_pkey PRIMARY KEY (id);


--
-- Name: lexicon lexicon_word_language_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lexicon
    ADD CONSTRAINT lexicon_word_language_unique UNIQUE (word, language_code);


--
-- Name: locales locales_country_language_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locales
    ADD CONSTRAINT locales_country_language_unique UNIQUE (country_code, language_code);


--
-- Name: locales locales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locales
    ADD CONSTRAINT locales_pkey PRIMARY KEY (id);


--
-- Name: localized_content localized_content_node_language_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.localized_content
    ADD CONSTRAINT localized_content_node_language_unique UNIQUE (node_id, language_code);


--
-- Name: localized_content localized_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.localized_content
    ADD CONSTRAINT localized_content_pkey PRIMARY KEY (id);


--
-- Name: node_configurations node_configurations_profile_id_node_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_configurations
    ADD CONSTRAINT node_configurations_profile_id_node_id_pk PRIMARY KEY (profile_id, node_id);


--
-- Name: node_keywords node_keywords_node_id_word_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_keywords
    ADD CONSTRAINT node_keywords_node_id_word_id_pk PRIMARY KEY (node_id, word_id);


--
-- Name: node_translations node_translations_node_language_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_translations
    ADD CONSTRAINT node_translations_node_language_unique UNIQUE (node_id, language_code);


--
-- Name: node_translations node_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_translations
    ADD CONSTRAINT node_translations_pkey PRIMARY KEY (id);


--
-- Name: paper_document_jobs paper_document_jobs_document_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_document_jobs
    ADD CONSTRAINT paper_document_jobs_document_unique UNIQUE (document_id);


--
-- Name: paper_document_jobs paper_document_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_document_jobs
    ADD CONSTRAINT paper_document_jobs_pkey PRIMARY KEY (id);


--
-- Name: profile_curriculum_enrollments profile_curriculum_enrollments_profile_id_node_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_curriculum_enrollments
    ADD CONSTRAINT profile_curriculum_enrollments_profile_id_node_id_pk PRIMARY KEY (profile_id, node_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (profile_id);


--
-- Name: skill_progress skill_progress_profile_id_skill_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_progress
    ADD CONSTRAINT skill_progress_profile_id_skill_id_pk PRIMARY KEY (profile_id, skill_id);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (node_id);


--
-- Name: streak_settings streak_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streak_settings
    ADD CONSTRAINT streak_settings_pkey PRIMARY KEY (profile_id);


--
-- Name: student_mastery student_mastery_profile_id_node_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_mastery
    ADD CONSTRAINT student_mastery_profile_id_node_id_pk PRIMARY KEY (profile_id, node_id);


--
-- Name: student_vocabulary student_vocabulary_profile_id_word_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_vocabulary
    ADD CONSTRAINT student_vocabulary_profile_id_word_id_pk PRIMARY KEY (profile_id, word_id);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- Name: subjects subjects_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_slug_unique UNIQUE (slug);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (account_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: weekly_plan_items weekly_plan_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plan_items
    ADD CONSTRAINT weekly_plan_items_pkey PRIMARY KEY (id);


--
-- Name: weekly_plan_jobs weekly_plan_jobs_learning_year_week_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plan_jobs
    ADD CONSTRAINT weekly_plan_jobs_learning_year_week_unique UNIQUE (learning_year_id, week_number);


--
-- Name: weekly_plan_jobs weekly_plan_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plan_jobs
    ADD CONSTRAINT weekly_plan_jobs_pkey PRIMARY KEY (id);


--
-- Name: weekly_plan_subject_grades weekly_plan_subject_grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plan_subject_grades
    ADD CONSTRAINT weekly_plan_subject_grades_pkey PRIMARY KEY (id);


--
-- Name: weekly_plan_subject_grades weekly_plan_subject_grades_week_subject_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plan_subject_grades
    ADD CONSTRAINT weekly_plan_subject_grades_week_subject_unique UNIQUE (weekly_plan_id, subject_key);


--
-- Name: weekly_plans weekly_plans_learning_year_week_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plans
    ADD CONSTRAINT weekly_plans_learning_year_week_unique UNIQUE (learning_year_id, week_number);


--
-- Name: weekly_plans weekly_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plans
    ADD CONSTRAINT weekly_plans_pkey PRIMARY KEY (id);


--
-- Name: account_purchases account_purchases_account_id_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_purchases
    ADD CONSTRAINT account_purchases_account_id_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: account_purchases account_purchases_subject_id_subjects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_purchases
    ADD CONSTRAINT account_purchases_subject_id_subjects_id_fk FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: content_documents content_documents_learning_year_id_learning_years_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_documents
    ADD CONSTRAINT content_documents_learning_year_id_learning_years_id_fk FOREIGN KEY (learning_year_id) REFERENCES public.learning_years(id) ON DELETE CASCADE;


--
-- Name: content_documents content_documents_subject_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_documents
    ADD CONSTRAINT content_documents_subject_id_curriculum_nodes_id_fk FOREIGN KEY (subject_id) REFERENCES public.curriculum_nodes(id) ON DELETE SET NULL;


--
-- Name: curriculum_nodes curriculum_nodes_parent_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_nodes
    ADD CONSTRAINT curriculum_nodes_parent_id_curriculum_nodes_id_fk FOREIGN KEY (parent_id) REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE;


--
-- Name: denominations denominations_currency_code_currencies_code_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.denominations
    ADD CONSTRAINT denominations_currency_code_currencies_code_fk FOREIGN KEY (currency_code) REFERENCES public.currencies(code) ON DELETE CASCADE;


--
-- Name: learning_activity_events learning_activity_events_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activity_events
    ADD CONSTRAINT learning_activity_events_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: learning_years learning_years_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_years
    ADD CONSTRAINT learning_years_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: lesson_attempts lesson_attempts_lesson_id_lessons_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_attempts
    ADD CONSTRAINT lesson_attempts_lesson_id_lessons_id_fk FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: lesson_attempts lesson_attempts_node_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_attempts
    ADD CONSTRAINT lesson_attempts_node_id_curriculum_nodes_id_fk FOREIGN KEY (node_id) REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE;


--
-- Name: lesson_attempts lesson_attempts_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_attempts
    ADD CONSTRAINT lesson_attempts_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: lesson_generation_jobs lesson_generation_jobs_lesson_id_lessons_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_generation_jobs
    ADD CONSTRAINT lesson_generation_jobs_lesson_id_lessons_id_fk FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: lessons lessons_node_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_node_id_curriculum_nodes_id_fk FOREIGN KEY (node_id) REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE;


--
-- Name: lessons lessons_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: locales locales_currency_code_currencies_code_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locales
    ADD CONSTRAINT locales_currency_code_currencies_code_fk FOREIGN KEY (currency_code) REFERENCES public.currencies(code) ON DELETE RESTRICT;


--
-- Name: localized_content localized_content_node_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.localized_content
    ADD CONSTRAINT localized_content_node_id_curriculum_nodes_id_fk FOREIGN KEY (node_id) REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE;


--
-- Name: node_configurations node_configurations_node_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_configurations
    ADD CONSTRAINT node_configurations_node_id_curriculum_nodes_id_fk FOREIGN KEY (node_id) REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE;


--
-- Name: node_configurations node_configurations_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_configurations
    ADD CONSTRAINT node_configurations_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: node_keywords node_keywords_node_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_keywords
    ADD CONSTRAINT node_keywords_node_id_curriculum_nodes_id_fk FOREIGN KEY (node_id) REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE;


--
-- Name: node_keywords node_keywords_word_id_lexicon_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_keywords
    ADD CONSTRAINT node_keywords_word_id_lexicon_id_fk FOREIGN KEY (word_id) REFERENCES public.lexicon(id) ON DELETE CASCADE;


--
-- Name: node_translations node_translations_node_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_translations
    ADD CONSTRAINT node_translations_node_id_curriculum_nodes_id_fk FOREIGN KEY (node_id) REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE;


--
-- Name: paper_document_jobs paper_document_jobs_document_id_content_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_document_jobs
    ADD CONSTRAINT paper_document_jobs_document_id_content_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.content_documents(id) ON DELETE CASCADE;


--
-- Name: profile_curriculum_enrollments profile_curriculum_enrollments_node_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_curriculum_enrollments
    ADD CONSTRAINT profile_curriculum_enrollments_node_id_curriculum_nodes_id_fk FOREIGN KEY (node_id) REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE;


--
-- Name: profile_curriculum_enrollments profile_curriculum_enrollments_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_curriculum_enrollments
    ADD CONSTRAINT profile_curriculum_enrollments_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_account_id_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_account_id_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_current_node_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_current_node_id_curriculum_nodes_id_fk FOREIGN KEY (current_node_id) REFERENCES public.curriculum_nodes(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_locale_id_locales_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_locale_id_locales_id_fk FOREIGN KEY (locale_id) REFERENCES public.locales(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: schedules schedules_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: skill_progress skill_progress_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_progress
    ADD CONSTRAINT skill_progress_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: skill_progress skill_progress_skill_id_skills_node_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_progress
    ADD CONSTRAINT skill_progress_skill_id_skills_node_id_fk FOREIGN KEY (skill_id) REFERENCES public.skills(node_id) ON DELETE CASCADE;


--
-- Name: skills skills_node_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_node_id_curriculum_nodes_id_fk FOREIGN KEY (node_id) REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE;


--
-- Name: streak_settings streak_settings_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streak_settings
    ADD CONSTRAINT streak_settings_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: student_mastery student_mastery_node_id_skills_node_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_mastery
    ADD CONSTRAINT student_mastery_node_id_skills_node_id_fk FOREIGN KEY (node_id) REFERENCES public.skills(node_id) ON DELETE CASCADE;


--
-- Name: student_mastery student_mastery_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_mastery
    ADD CONSTRAINT student_mastery_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: student_vocabulary student_vocabulary_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_vocabulary
    ADD CONSTRAINT student_vocabulary_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: student_vocabulary student_vocabulary_word_id_lexicon_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_vocabulary
    ADD CONSTRAINT student_vocabulary_word_id_lexicon_id_fk FOREIGN KEY (word_id) REFERENCES public.lexicon(id) ON DELETE CASCADE;


--
-- Name: subjects subjects_currency_code_currencies_code_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_currency_code_currencies_code_fk FOREIGN KEY (currency_code) REFERENCES public.currencies(code) ON DELETE RESTRICT;


--
-- Name: subjects subjects_curriculum_node_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_curriculum_node_id_curriculum_nodes_id_fk FOREIGN KEY (curriculum_node_id) REFERENCES public.curriculum_nodes(id) ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_account_id_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_account_id_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: weekly_plan_items weekly_plan_items_document_id_content_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plan_items
    ADD CONSTRAINT weekly_plan_items_document_id_content_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.content_documents(id) ON DELETE CASCADE;


--
-- Name: weekly_plan_items weekly_plan_items_weekly_plan_id_weekly_plans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plan_items
    ADD CONSTRAINT weekly_plan_items_weekly_plan_id_weekly_plans_id_fk FOREIGN KEY (weekly_plan_id) REFERENCES public.weekly_plans(id) ON DELETE CASCADE;


--
-- Name: weekly_plan_jobs weekly_plan_jobs_learning_year_id_learning_years_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plan_jobs
    ADD CONSTRAINT weekly_plan_jobs_learning_year_id_learning_years_id_fk FOREIGN KEY (learning_year_id) REFERENCES public.learning_years(id) ON DELETE CASCADE;


--
-- Name: weekly_plan_subject_grades weekly_plan_subject_grades_subject_id_curriculum_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plan_subject_grades
    ADD CONSTRAINT weekly_plan_subject_grades_subject_id_curriculum_nodes_id_fk FOREIGN KEY (subject_id) REFERENCES public.curriculum_nodes(id) ON DELETE SET NULL;


--
-- Name: weekly_plan_subject_grades weekly_plan_subject_grades_weekly_plan_id_weekly_plans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plan_subject_grades
    ADD CONSTRAINT weekly_plan_subject_grades_weekly_plan_id_weekly_plans_id_fk FOREIGN KEY (weekly_plan_id) REFERENCES public.weekly_plans(id) ON DELETE CASCADE;


--
-- Name: weekly_plans weekly_plans_learning_year_id_learning_years_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plans
    ADD CONSTRAINT weekly_plans_learning_year_id_learning_years_id_fk FOREIGN KEY (learning_year_id) REFERENCES public.learning_years(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--
