CREATE TABLE IF NOT EXISTS public.curriculum_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  label text NOT NULL,
  curriculum_area_key text NOT NULL,
  aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_subjects_key_unique UNIQUE (key),
  CONSTRAINT curriculum_subjects_area_check CHECK (curriculum_area_key IN (
    'language_arts',
    'mathematics',
    'science',
    'social_studies',
    'world_languages',
    'arts_and_music',
    'physical_education_and_health',
    'technology_and_practical_skills',
    'agriculture',
    'business_and_entrepreneurship',
    'religious_studies',
    'other'
  ))
);

CREATE INDEX IF NOT EXISTS curriculum_subjects_area_idx
  ON public.curriculum_subjects(curriculum_area_key, active, display_order);

INSERT INTO public.curriculum_subjects
  (key, label, curriculum_area_key, aliases, display_order)
VALUES
  ('english-language-arts', 'English Language Arts', 'language_arts', ARRAY['ela', 'english'], 10),
  ('reading', 'Reading', 'language_arts', ARRAY['literacy'], 20),
  ('phonics', 'Phonics', 'language_arts', ARRAY['decoding'], 30),
  ('reading-comprehension', 'Reading Comprehension', 'language_arts', ARRAY['comprehension'], 40),
  ('spelling', 'Spelling', 'language_arts', ARRAY[]::text[], 50),
  ('vocabulary', 'Vocabulary', 'language_arts', ARRAY['word study'], 60),
  ('writing', 'Writing', 'language_arts', ARRAY[]::text[], 70),
  ('grammar', 'Grammar', 'language_arts', ARRAY['language conventions'], 80),
  ('writing-and-grammar', 'Writing & Grammar', 'language_arts', ARRAY['grammar and writing', 'writing and grammar'], 90),
  ('composition', 'Composition', 'language_arts', ARRAY['essay writing'], 100),
  ('handwriting', 'Handwriting', 'language_arts', ARRAY['cursive', 'penmanship'], 110),
  ('literature', 'Literature', 'language_arts', ARRAY['english literature'], 120),
  ('journalism', 'Journalism', 'language_arts', ARRAY[]::text[], 130),
  ('public-speaking-and-communication', 'Public Speaking & Communication', 'language_arts', ARRAY['speech', 'communications'], 140),

  ('mathematics', 'Mathematics', 'mathematics', ARRAY['math', 'math concepts'], 10),
  ('arithmetic', 'Arithmetic', 'mathematics', ARRAY['elementary arithmetic'], 20),
  ('pre-algebra', 'Pre-Algebra', 'mathematics', ARRAY['prealgebra'], 30),
  ('algebra-1', 'Algebra I', 'mathematics', ARRAY['algebra 1', 'elementary algebra'], 40),
  ('geometry', 'Geometry', 'mathematics', ARRAY[]::text[], 50),
  ('algebra-2', 'Algebra II', 'mathematics', ARRAY['algebra 2', 'intermediate algebra'], 60),
  ('trigonometry', 'Trigonometry', 'mathematics', ARRAY['trig'], 70),
  ('precalculus', 'Precalculus', 'mathematics', ARRAY['pre-calculus'], 80),
  ('calculus', 'Calculus', 'mathematics', ARRAY[]::text[], 90),
  ('statistics-and-probability', 'Statistics & Probability', 'mathematics', ARRAY['statistics', 'probability'], 100),
  ('discrete-mathematics', 'Discrete Mathematics', 'mathematics', ARRAY['discrete math'], 110),
  ('consumer-mathematics', 'Consumer Mathematics', 'mathematics', ARRAY['consumer math', 'business math'], 120),

  ('science', 'Science', 'science', ARRAY['integrated science', 'stem science'], 10),
  ('general-science', 'General Science', 'science', ARRAY[]::text[], 20),
  ('life-science', 'Life Science', 'science', ARRAY[]::text[], 30),
  ('earth-and-space-science', 'Earth & Space Science', 'science', ARRAY[]::text[], 40),
  ('physical-science', 'Physical Science', 'science', ARRAY[]::text[], 50),
  ('biology', 'Biology', 'science', ARRAY[]::text[], 60),
  ('chemistry', 'Chemistry', 'science', ARRAY[]::text[], 70),
  ('physics', 'Physics', 'science', ARRAY[]::text[], 80),
  ('earth-science', 'Earth Science', 'science', ARRAY['geoscience'], 90),
  ('astronomy', 'Astronomy', 'science', ARRAY['space science'], 100),
  ('environmental-science', 'Environmental Science', 'science', ARRAY['ecology'], 110),
  ('anatomy-and-physiology', 'Anatomy & Physiology', 'science', ARRAY['human anatomy', 'physiology'], 120),
  ('marine-biology', 'Marine Biology', 'science', ARRAY['ocean science'], 130),

  ('social-studies', 'Social Studies', 'social_studies', ARRAY[]::text[], 10),
  ('history', 'History', 'social_studies', ARRAY[]::text[], 20),
  ('ancient-history', 'Ancient History', 'social_studies', ARRAY['ancient civilizations'], 30),
  ('world-history', 'World History', 'social_studies', ARRAY['global history'], 40),
  ('united-states-history', 'United States History', 'social_studies', ARRAY['us history', 'american history'], 50),
  ('european-history', 'European History', 'social_studies', ARRAY[]::text[], 60),
  ('geography', 'Geography', 'social_studies', ARRAY[]::text[], 70),
  ('civics-and-government', 'Civics & Government', 'social_studies', ARRAY['civics', 'government'], 80),
  ('economics', 'Economics', 'social_studies', ARRAY[]::text[], 90),
  ('psychology', 'Psychology', 'social_studies', ARRAY[]::text[], 100),
  ('sociology', 'Sociology', 'social_studies', ARRAY[]::text[], 110),
  ('anthropology', 'Anthropology', 'social_studies', ARRAY[]::text[], 120),

  ('japanese', 'Japanese', 'world_languages', ARRAY[]::text[], 10),
  ('spanish', 'Spanish', 'world_languages', ARRAY[]::text[], 20),
  ('french', 'French', 'world_languages', ARRAY[]::text[], 30),
  ('german', 'German', 'world_languages', ARRAY[]::text[], 40),
  ('mandarin-chinese', 'Mandarin Chinese', 'world_languages', ARRAY['mandarin', 'chinese'], 50),
  ('italian', 'Italian', 'world_languages', ARRAY[]::text[], 60),
  ('portuguese', 'Portuguese', 'world_languages', ARRAY[]::text[], 70),
  ('korean', 'Korean', 'world_languages', ARRAY[]::text[], 80),
  ('arabic', 'Arabic', 'world_languages', ARRAY[]::text[], 90),
  ('russian', 'Russian', 'world_languages', ARRAY[]::text[], 100),
  ('latin', 'Latin', 'world_languages', ARRAY[]::text[], 110),
  ('ancient-greek', 'Ancient Greek', 'world_languages', ARRAY['classical greek'], 120),
  ('american-sign-language', 'American Sign Language', 'world_languages', ARRAY['asl', 'sign language'], 130),

  ('visual-arts', 'Visual Arts', 'arts_and_music', ARRAY['art', 'arts'], 10),
  ('drawing-and-painting', 'Drawing & Painting', 'arts_and_music', ARRAY['drawing', 'painting'], 20),
  ('art-history', 'Art History', 'arts_and_music', ARRAY[]::text[], 30),
  ('photography', 'Photography', 'arts_and_music', ARRAY[]::text[], 40),
  ('music', 'Music', 'arts_and_music', ARRAY[]::text[], 50),
  ('music-theory', 'Music Theory', 'arts_and_music', ARRAY[]::text[], 60),
  ('choir-and-vocal-music', 'Choir & Vocal Music', 'arts_and_music', ARRAY['choir', 'vocal music'], 70),
  ('instrumental-music', 'Instrumental Music', 'arts_and_music', ARRAY['band', 'orchestra'], 80),
  ('piano', 'Piano', 'arts_and_music', ARRAY['keyboard'], 90),
  ('guitar', 'Guitar', 'arts_and_music', ARRAY[]::text[], 100),
  ('violin', 'Violin', 'arts_and_music', ARRAY['fiddle'], 110),
  ('ukulele', 'Ukulele', 'arts_and_music', ARRAY['uke'], 120),
  ('recorder', 'Recorder', 'arts_and_music', ARRAY[]::text[], 130),
  ('drama-and-theater', 'Drama & Theater', 'arts_and_music', ARRAY['drama', 'theater', 'theatre'], 140),
  ('dance', 'Dance', 'arts_and_music', ARRAY[]::text[], 150),

  ('physical-education', 'Physical Education', 'physical_education_and_health', ARRAY['pe', 'fitness'], 10),
  ('health', 'Health', 'physical_education_and_health', ARRAY['health education'], 20),
  ('nutrition', 'Nutrition', 'physical_education_and_health', ARRAY[]::text[], 30),
  ('personal-wellness', 'Personal Wellness', 'physical_education_and_health', ARRAY['wellness'], 40),
  ('sports-and-fitness', 'Sports & Fitness', 'physical_education_and_health', ARRAY['sports', 'fitness training'], 50),
  ('martial-arts', 'Martial Arts', 'physical_education_and_health', ARRAY['karate', 'taekwondo', 'judo'], 60),

  ('computer-science', 'Computer Science', 'technology_and_practical_skills', ARRAY['computing'], 10),
  ('coding-and-programming', 'Coding & Programming', 'technology_and_practical_skills', ARRAY['coding', 'programming'], 20),
  ('robotics', 'Robotics', 'technology_and_practical_skills', ARRAY[]::text[], 30),
  ('engineering', 'Engineering', 'technology_and_practical_skills', ARRAY['engineering design'], 40),
  ('digital-literacy', 'Digital Literacy', 'technology_and_practical_skills', ARRAY['computer literacy'], 50),
  ('life-skills', 'Life Skills', 'technology_and_practical_skills', ARRAY['practical skills'], 60),
  ('home-economics', 'Home Economics', 'technology_and_practical_skills', ARRAY['family and consumer science'], 70),
  ('financial-literacy', 'Financial Literacy', 'technology_and_practical_skills', ARRAY['personal finance'], 80),
  ('career-and-technical-education', 'Career & Technical Education', 'technology_and_practical_skills', ARRAY['cte', 'vocational studies'], 100),
  ('agriculture', 'Agriculture', 'agriculture', ARRAY['agricultural science', 'farming'], 10),

  ('business-and-entrepreneurship', 'Business & Entrepreneurship', 'business_and_entrepreneurship', ARRAY['business', 'entrepreneurship'], 10),

  ('religious-studies', 'Religious Studies', 'religious_studies', ARRAY['religion', 'theology'], 10),
  ('biblical-studies', 'Biblical Studies', 'religious_studies', ARRAY['bible', 'bible studies'], 20),
  ('comparative-religion', 'Comparative Religion', 'religious_studies', ARRAY['world religions'], 30),
  ('christian-studies', 'Christian Studies', 'religious_studies', ARRAY['christian education'], 40),

  ('logic-and-critical-thinking', 'Logic & Critical Thinking', 'other', ARRAY['logic', 'critical thinking'], 10),
  ('philosophy', 'Philosophy', 'other', ARRAY[]::text[], 20),
  ('study-skills', 'Study Skills', 'other', ARRAY['learning skills'], 30),
  ('test-preparation', 'Test Preparation', 'other', ARRAY['test prep'], 40),
  ('general-enrichment', 'General Enrichment', 'other', ARRAY['enrichment'], 50)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  curriculum_area_key = EXCLUDED.curriculum_area_key,
  aliases = EXCLUDED.aliases,
  display_order = EXCLUDED.display_order,
  active = true,
  updated_at = now();

ALTER TABLE public.native_workbooks
  ADD COLUMN IF NOT EXISTS curriculum_subject_id uuid
  REFERENCES public.curriculum_subjects(id) ON DELETE SET NULL;

UPDATE public.native_workbooks
SET curriculum_area_key = 'agriculture', updated_at = now()
WHERE lower(trim(subject_key)) = 'agriculture'
   OR lower(trim(subject_label)) = 'agriculture';

UPDATE public.native_workbooks
SET curriculum_area_key = 'business_and_entrepreneurship', updated_at = now()
WHERE lower(trim(subject_key)) = 'business-and-entrepreneurship'
   OR lower(trim(subject_label)) = 'business & entrepreneurship';

UPDATE public.native_workbooks AS workbook
SET curriculum_subject_id = subject.id
FROM public.curriculum_subjects AS subject
WHERE workbook.curriculum_subject_id IS NULL
  AND subject.curriculum_area_key = workbook.curriculum_area_key
  AND (
    subject.key = lower(workbook.subject_key)
    OR lower(subject.label) = lower(trim(workbook.subject_label))
    OR EXISTS (
      SELECT 1
      FROM unnest(subject.aliases) AS alias
      WHERE lower(alias) IN (
        lower(trim(workbook.subject_label)),
        lower(trim(workbook.subject_key))
      )
    )
  );

UPDATE public.native_workbooks AS workbook
SET
  subject_key = subject.key,
  subject_label = subject.label,
  updated_at = now()
FROM public.curriculum_subjects AS subject
WHERE workbook.curriculum_subject_id = subject.id
  AND (
    workbook.subject_key IS DISTINCT FROM subject.key
    OR workbook.subject_label IS DISTINCT FROM subject.label
  );

CREATE INDEX IF NOT EXISTS native_workbooks_curriculum_subject_idx
  ON public.native_workbooks(curriculum_subject_id);

COMMENT ON TABLE public.curriculum_subjects IS
  'Curated Treeschool subject taxonomy. Subjects belong to a broad curriculum area and provide stable identifiers for catalog search, recommendations, and reporting.';

COMMENT ON COLUMN public.native_workbooks.curriculum_subject_id IS
  'Optional canonical subject. Null means the workbook deliberately retains a custom subject label that has not been promoted into the shared taxonomy.';
