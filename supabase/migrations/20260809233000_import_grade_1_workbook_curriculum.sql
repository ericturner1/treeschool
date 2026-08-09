-- Import the reconstructed Grade 1 baseline from the sibling
-- treeschool-workbooks repository. This is a curriculum plan only: the shipped
-- legacy PDFs remain unchanged and are not converted into Studio revisions.

do $$
declare
  classic_theme_version_id uuid;
  grade_1_curriculum_id uuid;
  grade_1_revision_id uuid := '42000000-0000-4000-8000-000000000103';
begin
  select published_version_id
  into classic_theme_version_id
  from public.workbook_themes
  where slug = 'classic';

  if classic_theme_version_id is null then
    raise exception 'The published Classic workbook theme is required before importing Grade 1.';
  end if;

  insert into public.workbook_curricula (
    id,
    slug,
    name,
    academic_standard_key,
    standard_code,
    standard_label,
    grade_level,
    language_code,
    status,
    default_theme_version_id
  )
  values (
    '42000000-0000-4000-8000-000000000003',
    'imported-us-grade-1-core',
    'United States · Grade 1 Core',
    'us',
    'CCSS + NGSS',
    'US Common Core and Next Generation Science Standards',
    1,
    'en',
    'review',
    classic_theme_version_id
  )
  on conflict (slug) do nothing;

  select id
  into grade_1_curriculum_id
  from public.workbook_curricula
  where slug = 'imported-us-grade-1-core';

  insert into public.workbook_courses (
    id,
    curriculum_id,
    stable_key,
    curriculum_subject_id,
    status,
    academic_standard_override_key,
    standard_code,
    standard_label,
    boundary_notes,
    coverage_notes,
    pipeline_key
  )
  select
    seed.id::uuid,
    grade_1_curriculum_id,
    seed.stable_key,
    subject.id,
    'new',
    nullif(seed.academic_standard_override_key, ''),
    nullif(seed.standard_code, ''),
    nullif(seed.standard_label, ''),
    seed.boundary_notes,
    seed.coverage_notes,
    seed.pipeline_key
  from (values
    (
      '43000000-0000-4000-8000-000000000101', 'mathematics', 'us', 'mathematics',
      '', 'CCSS', 'US Common Core',
      'Money is intentionally deferred to Grade 2; it is not a Grade 1 Common Core requirement.',
      'Covers every Grade 1 Common Core Mathematics domain: 1.OA, 1.NBT, 1.MD, and 1.G.',
      'math'
    ),
    (
      '43000000-0000-4000-8000-000000000102', 'reading', 'us', 'reading',
      '', 'CCSS', 'US Common Core',
      'Reading owns comprehension of leveled texts; Phonics owns decoding and Writing & Grammar owns composition.',
      'Covers Grade 1 RL/RI comprehension through the Fountas and Pinnell D–I progression.',
      'leveled-reader'
    ),
    (
      '43000000-0000-4000-8000-000000000103', 'phonics', 'us', 'phonics',
      '', '', 'Typical US Grade 1–2 foundational-skills scope',
      'Phonics owns decoding mechanics, not extended reading comprehension or composition.',
      'Continues Kindergarten Phonics A with blends, digraphs, vowel patterns, multisyllable words, sight words, spelling, and fluency.',
      'general'
    ),
    (
      '43000000-0000-4000-8000-000000000104', 'spelling', 'us', 'spelling',
      '', '', 'Typical US Grade 1 homeschool scope',
      'Spelling owns encoding, not decoding or composition and grammar instruction.',
      'Covers blends, digraphs, silent-e and long vowels, simple endings, plurals, and irregular sight words.',
      'general'
    ),
    (
      '43000000-0000-4000-8000-000000000105', 'writing-and-grammar', 'us', 'writing-and-grammar',
      '', 'CCSS', 'US Common Core',
      'Excludes handwriting and spelling-pattern instruction, which belong to Phonics and Spelling.',
      'Covers Grade 1 L.1 grammar and mechanics plus W.1 opinion, informative, narrative, revision, and collaborative writing.',
      'general'
    ),
    (
      '43000000-0000-4000-8000-000000000106', 'science', 'us', 'science',
      '', 'NGSS', 'Next Generation Science Standards',
      'Science owns the physical, life, and Earth-system scope described in the shipped outline.',
      'Covers Grade 1 NGSS 1-PS4, 1-LS1, 1-LS3, and 1-ESS1.',
      'general'
    ),
    (
      '43000000-0000-4000-8000-000000000107', 'social-studies', 'us', 'social-studies',
      '', '', 'Typical US Grade 1 homeschool scope',
      'Owns economic concepts such as trading, earning, and saving; Mathematics owns currency arithmetic.',
      'Covers citizenship, rules, cooperation, geography, historical change, needs, wants, and work.',
      'general'
    ),
    (
      '43000000-0000-4000-8000-000000000108', 'kokugo', 'japan', 'kokugo',
      'japan', 'MEXT', 'Japanese Course of Study (学習指導要領)',
      'Japanese native-language literacy is distinct from English Language Arts and the separate Japanese-as-a-foreign-language elective.',
      'Covers hiragana, katakana, and all 80 Grade 1 kyoiku-kanji across the shipped A–D series.',
      'foreign-language'
    )
  ) as seed(
    id,
    stable_key,
    subject_standard_key,
    subject_key,
    academic_standard_override_key,
    standard_code,
    standard_label,
    boundary_notes,
    coverage_notes,
    pipeline_key
  )
  join public.curriculum_subjects subject
    on subject.academic_standard_key = seed.subject_standard_key
   and subject.key = seed.subject_key
  on conflict (curriculum_id, curriculum_subject_id) do nothing;

  if (
    select count(*)
    from public.workbook_courses
    where curriculum_id = grade_1_curriculum_id
  ) <> 8 then
    raise exception 'The Grade 1 import requires exactly eight curriculum courses.';
  end if;

  insert into public.workbook_curriculum_revisions (
    id,
    curriculum_id,
    revision_number,
    source,
    plan_json,
    validation_json
  )
  values (
    grade_1_revision_id,
    grade_1_curriculum_id,
    1,
    'imported',
    $json$
    {
      "schemaVersion": 2,
      "curriculumName": "United States · Grade 1 Core",
      "courses": [
        {
          "stableKey": "mathematics",
          "subjectKey": "mathematics",
          "subjectLabel": "Mathematics",
          "status": "new",
          "academicStandardOverrideKey": null,
          "standardCode": "CCSS",
          "standardLabel": "US Common Core",
          "themeOverrideVersionId": null,
          "boundaryNotes": "Money is intentionally deferred to Grade 2; it is not a Grade 1 Common Core requirement.",
          "coverageNotes": "Covers every Grade 1 Common Core Mathematics domain: 1.OA, 1.NBT, 1.MD, and 1.G.",
          "pipelineKey": "math",
          "workbooks": [
            {
              "stableKey": "1-math-1",
              "title": "Grade 1 Mathematics",
              "domains": [
                "Arithmetic Foundations: Addition to 20 and Subtraction to 20",
                "Place Value & Number Sense: Place Value to 120",
                "Measurement: Length and Time",
                "Data & Graphing: Simple Graphs",
                "Geometry & Shape Fractions: Shapes and Halves"
              ],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "en",
              "localeCode": null,
              "layoutProfile": "standard",
              "scriptProfile": "latin"
            }
          ]
        },
        {
          "stableKey": "reading",
          "subjectKey": "reading",
          "subjectLabel": "Reading",
          "status": "new",
          "academicStandardOverrideKey": null,
          "standardCode": "CCSS",
          "standardLabel": "US Common Core",
          "themeOverrideVersionId": null,
          "boundaryNotes": "Reading owns comprehension of leveled texts; Phonics owns decoding and Writing & Grammar owns composition.",
          "coverageNotes": "Covers Grade 1 RL/RI comprehension through the Fountas and Pinnell D–I progression.",
          "pipelineKey": "leveled-reader",
          "workbooks": [
            {
              "stableKey": "1-reading-level-d",
              "title": "Grade 1 Reader · Level D",
              "domains": ["Fountas and Pinnell Level D guided reading and comprehension"],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "en",
              "localeCode": null,
              "layoutProfile": "reader",
              "scriptProfile": "latin"
            },
            {
              "stableKey": "1-reading-level-e",
              "title": "Grade 1 Reader · Level E",
              "domains": ["Fountas and Pinnell Level E guided reading and comprehension"],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "en",
              "localeCode": null,
              "layoutProfile": "reader",
              "scriptProfile": "latin"
            },
            {
              "stableKey": "1-reading-level-f",
              "title": "Grade 1 Reader · Level F",
              "domains": ["Fountas and Pinnell Level F guided reading and comprehension"],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "en",
              "localeCode": null,
              "layoutProfile": "reader",
              "scriptProfile": "latin"
            },
            {
              "stableKey": "1-reading-level-g",
              "title": "Grade 1 Reader · Level G",
              "domains": ["Fountas and Pinnell Level G guided reading and comprehension"],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "en",
              "localeCode": null,
              "layoutProfile": "reader",
              "scriptProfile": "latin"
            },
            {
              "stableKey": "1-reading-level-h",
              "title": "Grade 1 Reader · Level H",
              "domains": ["Fountas and Pinnell Level H guided reading and comprehension"],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "en",
              "localeCode": null,
              "layoutProfile": "reader",
              "scriptProfile": "latin"
            },
            {
              "stableKey": "1-reading-level-i",
              "title": "Grade 1 Reader · Level I",
              "domains": ["Fountas and Pinnell Level I guided reading and comprehension"],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "en",
              "localeCode": null,
              "layoutProfile": "reader",
              "scriptProfile": "latin"
            }
          ]
        },
        {
          "stableKey": "phonics",
          "subjectKey": "phonics",
          "subjectLabel": "Phonics",
          "status": "new",
          "academicStandardOverrideKey": null,
          "standardCode": null,
          "standardLabel": "Typical US Grade 1–2 foundational-skills scope",
          "themeOverrideVersionId": null,
          "boundaryNotes": "Phonics owns decoding mechanics, not extended reading comprehension or composition.",
          "coverageNotes": "Continues Kindergarten Phonics A with blends, digraphs, vowel patterns, multisyllable words, sight words, spelling, and fluency.",
          "pipelineKey": "general",
          "workbooks": [
            {
              "stableKey": "1to2-phonics-b",
              "title": "Grades 1–2 Phonics B",
              "domains": [
                "Consonant Blends and Digraphs",
                "Long Vowel Patterns",
                "R-Controlled Vowels and Diphthongs",
                "Multisyllable Words and Common Endings",
                "Sight Words, Spelling, and Fluency"
              ],
              "gradeMin": 1,
              "gradeMax": 2,
              "languageCode": "en",
              "localeCode": null,
              "layoutProfile": "standard",
              "scriptProfile": "latin"
            }
          ]
        },
        {
          "stableKey": "spelling",
          "subjectKey": "spelling",
          "subjectLabel": "Spelling",
          "status": "new",
          "academicStandardOverrideKey": null,
          "standardCode": null,
          "standardLabel": "Typical US Grade 1 homeschool scope",
          "themeOverrideVersionId": null,
          "boundaryNotes": "Spelling owns encoding, not decoding or composition and grammar instruction.",
          "coverageNotes": "Covers blends, digraphs, silent-e and long vowels, simple endings, plurals, and irregular sight words.",
          "pipelineKey": "general",
          "workbooks": [
            {
              "stableKey": "1-spelling-1",
              "title": "Grade 1 Spelling",
              "domains": [
                "Beginning and Ending Blends",
                "Consonant Digraphs",
                "Silent E and Long Vowel Words",
                "Plurals and Simple Endings",
                "Tricky Sight Words"
              ],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "en",
              "localeCode": null,
              "layoutProfile": "standard",
              "scriptProfile": "latin"
            }
          ]
        },
        {
          "stableKey": "writing-and-grammar",
          "subjectKey": "writing-and-grammar",
          "subjectLabel": "Writing & Grammar",
          "status": "new",
          "academicStandardOverrideKey": null,
          "standardCode": "CCSS",
          "standardLabel": "US Common Core",
          "themeOverrideVersionId": null,
          "boundaryNotes": "Excludes handwriting and spelling-pattern instruction, which belong to Phonics and Spelling.",
          "coverageNotes": "Covers Grade 1 L.1 grammar and mechanics plus W.1 opinion, informative, narrative, revision, and collaborative writing.",
          "pipelineKey": "general",
          "workbooks": [
            {
              "stableKey": "1-writing-and-grammar-1",
              "title": "Grade 1 Writing & Grammar",
              "domains": [
                "Naming Words and Action Words",
                "Describing and Connecting Words",
                "Pronouns and Time Words",
                "Building Strong Sentences",
                "Capital Letters and Punctuation",
                "From Sentences to Paragraphs"
              ],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "en",
              "localeCode": null,
              "layoutProfile": "standard",
              "scriptProfile": "latin"
            }
          ]
        },
        {
          "stableKey": "science",
          "subjectKey": "science",
          "subjectLabel": "Science",
          "status": "new",
          "academicStandardOverrideKey": null,
          "standardCode": "NGSS",
          "standardLabel": "Next Generation Science Standards",
          "themeOverrideVersionId": null,
          "boundaryNotes": "Science owns the physical, life, and Earth-system scope described in the shipped outline.",
          "coverageNotes": "Covers Grade 1 NGSS 1-PS4, 1-LS1, 1-LS3, and 1-ESS1.",
          "pipelineKey": "general",
          "workbooks": [
            {
              "stableKey": "1-science-1",
              "title": "Grade 1 Science",
              "domains": [
                "Sound and Light Waves",
                "Plant and Animal Survival",
                "Life Cycles and Heredity",
                "Sky Systems and Patterns"
              ],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "en",
              "localeCode": null,
              "layoutProfile": "standard",
              "scriptProfile": "latin"
            }
          ]
        },
        {
          "stableKey": "social-studies",
          "subjectKey": "social-studies",
          "subjectLabel": "Social Studies",
          "status": "new",
          "academicStandardOverrideKey": null,
          "standardCode": null,
          "standardLabel": "Typical US Grade 1 homeschool scope",
          "themeOverrideVersionId": null,
          "boundaryNotes": "Owns economic concepts such as trading, earning, and saving; Mathematics owns currency arithmetic.",
          "coverageNotes": "Covers citizenship, rules, cooperation, geography, historical change, needs, wants, and work.",
          "pipelineKey": "general",
          "workbooks": [
            {
              "stableKey": "1-social-studies-1",
              "title": "Grade 1 Social Studies",
              "domains": [
                "Citizenship, Rules, and Cooperation",
                "My Community and Global Geography",
                "Time, Change, and History",
                "Needs, Wants, and Work"
              ],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "en",
              "localeCode": null,
              "layoutProfile": "standard",
              "scriptProfile": "latin"
            }
          ]
        },
        {
          "stableKey": "kokugo",
          "subjectKey": "kokugo",
          "subjectLabel": "Japanese Language (国語)",
          "status": "new",
          "academicStandardOverrideKey": "japan",
          "standardCode": "MEXT",
          "standardLabel": "Japanese Course of Study (学習指導要領)",
          "themeOverrideVersionId": null,
          "boundaryNotes": "Japanese native-language literacy is distinct from English Language Arts and the separate Japanese-as-a-foreign-language elective.",
          "coverageNotes": "Covers hiragana, katakana, and all 80 Grade 1 kyoiku-kanji across the shipped A–D series.",
          "pipelineKey": "foreign-language",
          "workbooks": [
            {
              "stableKey": "1-kokugo-a",
              "title": "こくごA · Grade 1 Kokugo",
              "domains": ["Full hiragana", "Sokuon, youon, long vowels, and particle reading", "Short-passage reading and writing"],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "ja",
              "localeCode": "ja-JP",
              "layoutProfile": "standard",
              "scriptProfile": "japanese"
            },
            {
              "stableKey": "1-kokugo-b",
              "title": "こくごB · Grade 1 Kokugo",
              "domains": ["Full katakana", "First 21 Grade 1 kyoiku-kanji"],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "ja",
              "localeCode": "ja-JP",
              "layoutProfile": "standard",
              "scriptProfile": "japanese"
            },
            {
              "stableKey": "1-kokugo-c",
              "title": "こくごC · Grade 1 Kokugo",
              "domains": ["Next 30 Grade 1 kyoiku-kanji", "Katakana reinforcement"],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "ja",
              "localeCode": "ja-JP",
              "layoutProfile": "standard",
              "scriptProfile": "japanese"
            },
            {
              "stableKey": "1-kokugo-d",
              "title": "こくごD · Grade 1 Kokugo",
              "domains": ["Final 29 Grade 1 kyoiku-kanji", "Similar-kanji review", "Cumulative Grade 1 reading and writing"],
              "gradeMin": null,
              "gradeMax": null,
              "languageCode": "ja",
              "localeCode": "ja-JP",
              "layoutProfile": "standard",
              "scriptProfile": "japanese"
            }
          ]
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "issues": [],
      "import": {
        "sourceRepository": "treeschool-workbooks",
        "sourcePath": "workbook-content/grade-1-curriculum-plan.md",
        "sourceSha256": "9ed43d71ead424357e5bf17e9891c715ae8d60ff91f98be2ce4d6a2cd169aa50",
        "notes": [
          "The source status Foundational maps to new because Grade 1 has no precedent grade in the imported catalog.",
          "Phonics B retains its actual Grades 1–2 span.",
          "Guitar and Japanese-as-a-foreign-language electives are intentionally outside this core curriculum.",
          "Science and Social Studies were reconstructed from their shipped outlines because no dedicated curriculum.md exists.",
          "Already-shipped legacy PDFs are not linked or converted by this curriculum import."
        ]
      }
    }
    $json$::jsonb
  )
  on conflict (curriculum_id, revision_number) do nothing;

  -- Subject IDs are environment-specific because the subject dictionary was
  -- seeded before deterministic IDs were introduced. Resolve them by the
  -- standard-scoped key and store the canonical IDs in the immutable plan.
  update public.workbook_curriculum_revisions revision
  set plan_json = jsonb_set(
    revision.plan_json,
    '{courses}',
    (
      select jsonb_agg(
        course_json || jsonb_build_object('curriculumSubjectId', subject.id)
        order by course_ordinality
      )
      from jsonb_array_elements(revision.plan_json->'courses')
        with ordinality as course(course_json, course_ordinality)
      join public.curriculum_subjects subject
        on subject.key = course_json->>'subjectKey'
       and subject.academic_standard_key = coalesce(
         course_json->>'academicStandardOverrideKey',
         'us'
       )
    )
  )
  where revision.id = grade_1_revision_id;

  update public.workbook_curricula curriculum
  set current_revision_id = revision.id,
      updated_at = now()
  from public.workbook_curriculum_revisions revision
  where curriculum.id = grade_1_curriculum_id
    and revision.id = grade_1_revision_id
    and curriculum.current_revision_id is null;
end
$$;
