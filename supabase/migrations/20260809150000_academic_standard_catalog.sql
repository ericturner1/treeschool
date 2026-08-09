CREATE TABLE public.academic_standards (
  key text PRIMARY KEY,
  label text NOT NULL,
  country_code text NOT NULL,
  default_language_code text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.academic_standard_languages (
  academic_standard_key text NOT NULL
    REFERENCES public.academic_standards(key) ON DELETE CASCADE,
  language_code text NOT NULL,
  label text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (academic_standard_key, language_code)
);

CREATE TABLE public.academic_standard_curriculum_areas (
  academic_standard_key text NOT NULL
    REFERENCES public.academic_standards(key) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (academic_standard_key, key)
);

INSERT INTO public.academic_standards
  (key, label, country_code, default_language_code, display_order)
VALUES
  ('us', 'United States', 'US', 'en', 10),
  ('japan', 'Japan', 'JP', 'ja', 20);

INSERT INTO public.academic_standard_languages
  (academic_standard_key, language_code, label, display_order)
VALUES
  ('us', 'en', 'English', 10),
  ('us', 'es', 'Spanish', 20),
  ('us', 'fr', 'French', 30),
  ('us', 'de', 'German', 40),
  ('us', 'ja', 'Japanese', 50),
  ('japan', 'ja', 'Japanese', 10),
  ('japan', 'en', 'English', 20);

INSERT INTO public.academic_standard_curriculum_areas
  (academic_standard_key, key, label, display_order)
VALUES
  ('us', 'language_arts', 'Language Arts', 10),
  ('us', 'mathematics', 'Mathematics', 20),
  ('us', 'science', 'Science', 30),
  ('us', 'social_studies', 'Social Studies', 40),
  ('us', 'world_languages', 'World Languages', 50),
  ('us', 'arts_and_music', 'Arts & Music', 60),
  ('us', 'physical_education_and_health', 'Physical Education & Health', 70),
  ('us', 'technology_and_practical_skills', 'Technology & Practical Skills', 80),
  ('us', 'agriculture', 'Agriculture', 90),
  ('us', 'business_and_entrepreneurship', 'Business & Entrepreneurship', 100),
  ('us', 'religious_studies', 'Religious Studies', 110),
  ('us', 'other', 'Other', 120),
  ('japan', 'language_arts', 'Japanese Language (国語)', 10),
  ('japan', 'mathematics', 'Mathematics (算数・数学)', 20),
  ('japan', 'science', 'Science (理科)', 30),
  ('japan', 'social_studies', 'Social Studies (社会)', 40),
  ('japan', 'life_environment_studies', 'Life Environment Studies (生活)', 50),
  ('japan', 'world_languages', 'Foreign Languages (外国語)', 60),
  ('japan', 'arts_and_music', 'Arts & Music (図工・美術・音楽)', 70),
  ('japan', 'physical_education_and_health', 'Physical Education & Health (体育・保健)', 80),
  ('japan', 'technology_and_practical_skills', 'Technology & Home Economics (技術・家庭)', 90),
  ('japan', 'moral_education', 'Moral Education (道徳)', 100),
  ('japan', 'integrated_studies', 'Integrated Studies (総合)', 110),
  ('japan', 'special_activities', 'Special Activities (特別活動)', 120),
  ('japan', 'other', 'Other', 130);

ALTER TABLE public.curriculum_subjects
  ADD COLUMN academic_standard_key text NOT NULL DEFAULT 'us'
  REFERENCES public.academic_standards(key) ON DELETE RESTRICT;

ALTER TABLE public.curriculum_subjects
  DROP CONSTRAINT IF EXISTS curriculum_subjects_key_unique,
  DROP CONSTRAINT IF EXISTS curriculum_subjects_area_check;

ALTER TABLE public.curriculum_subjects
  ADD CONSTRAINT curriculum_subjects_standard_key_unique
    UNIQUE (academic_standard_key, key),
  ADD CONSTRAINT curriculum_subjects_standard_area_fkey
    FOREIGN KEY (academic_standard_key, curriculum_area_key)
    REFERENCES public.academic_standard_curriculum_areas(academic_standard_key, key)
    ON DELETE RESTRICT;

DROP INDEX IF EXISTS public.curriculum_subjects_area_idx;
CREATE INDEX curriculum_subjects_standard_area_idx
  ON public.curriculum_subjects(
    academic_standard_key,
    curriculum_area_key,
    active,
    display_order
  );

INSERT INTO public.curriculum_subjects
  (academic_standard_key, key, label, curriculum_area_key, aliases, display_order)
VALUES
  ('japan', 'kokugo', 'Japanese Language (国語)', 'language_arts', ARRAY['国語', 'japanese language'], 10),
  ('japan', 'shosha', 'Japanese Handwriting (書写)', 'language_arts', ARRAY['書写', 'handwriting'], 20),
  ('japan', 'sansu', 'Elementary Mathematics (算数)', 'mathematics', ARRAY['算数', 'elementary mathematics'], 10),
  ('japan', 'sugaku', 'Secondary Mathematics (数学)', 'mathematics', ARRAY['数学', 'secondary mathematics'], 20),
  ('japan', 'rika', 'Science (理科)', 'science', ARRAY['理科'], 10),
  ('japan', 'shakai', 'Social Studies (社会)', 'social_studies', ARRAY['社会'], 10),
  ('japan', 'seikatsu', 'Life Environment Studies (生活)', 'life_environment_studies', ARRAY['生活'], 10),
  ('japan', 'gaikokugo', 'Foreign Languages (外国語)', 'world_languages', ARRAY['外国語', 'english'], 10),
  ('japan', 'ongaku', 'Music (音楽)', 'arts_and_music', ARRAY['音楽'], 10),
  ('japan', 'zukou', 'Arts & Crafts (図画工作)', 'arts_and_music', ARRAY['図画工作', '図工'], 20),
  ('japan', 'bijutsu', 'Fine Arts (美術)', 'arts_and_music', ARRAY['美術'], 30),
  ('japan', 'taiiku', 'Physical Education (体育)', 'physical_education_and_health', ARRAY['体育'], 10),
  ('japan', 'hoken-taiiku', 'Health & Physical Education (保健体育)', 'physical_education_and_health', ARRAY['保健体育'], 20),
  ('japan', 'kateika', 'Home Economics (家庭)', 'technology_and_practical_skills', ARRAY['家庭', '家庭科'], 10),
  ('japan', 'gijutsu-kateika', 'Technology & Home Economics (技術・家庭)', 'technology_and_practical_skills', ARRAY['技術・家庭', '技術家庭'], 20),
  ('japan', 'dotoku', 'Moral Education (道徳)', 'moral_education', ARRAY['道徳'], 10),
  ('japan', 'sougou', 'Integrated Studies (総合)', 'integrated_studies', ARRAY['総合', '総合的な学習'], 10),
  ('japan', 'tokubetsu-katsudou', 'Special Activities (特別活動)', 'special_activities', ARRAY['特別活動', '特活'], 10);

ALTER TABLE public.native_workbooks
  ADD COLUMN academic_standard_key text NOT NULL DEFAULT 'us'
  REFERENCES public.academic_standards(key) ON DELETE RESTRICT;

ALTER TABLE public.native_workbooks
  DROP CONSTRAINT IF EXISTS native_workbooks_curriculum_area_key_check;

ALTER TABLE public.native_workbooks
  ADD CONSTRAINT native_workbooks_standard_area_fkey
    FOREIGN KEY (academic_standard_key, curriculum_area_key)
    REFERENCES public.academic_standard_curriculum_areas(academic_standard_key, key)
    ON DELETE RESTRICT;

CREATE INDEX native_workbooks_standard_browse_idx
  ON public.native_workbooks(
    academic_standard_key,
    active,
    curriculum_area_key,
    grade_min,
    grade_max
  );

ALTER TABLE public.workbook_curricula
  ADD COLUMN academic_standard_key text NOT NULL DEFAULT 'us'
  REFERENCES public.academic_standards(key) ON DELETE RESTRICT;

COMMENT ON TABLE public.academic_standards IS
  'School-system profiles that drive the workbook taxonomy and default language. Specific frameworks such as Common Core or MEXT remain workbook curriculum metadata.';

COMMENT ON COLUMN public.workbook_curricula.standard_code IS
  'Optional specific framework code within the selected academic standard, for example CCSS or MEXT.';

COMMENT ON COLUMN public.native_workbooks.academic_standard_key IS
  'Academic standard profile used to resolve valid curriculum areas, subjects, and authoring languages.';
