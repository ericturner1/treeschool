-- Import the one complete grade-level curriculum plan currently present in the
-- sibling treeschool-workbooks repository. These records deliberately remain
-- in review: an administrator must approve them before generation can create
-- authoring projects.

do $$
declare
  classic_theme_version_id uuid;
  us_curriculum_id uuid;
  japan_curriculum_id uuid;
begin
  select published_version_id
  into classic_theme_version_id
  from public.workbook_themes
  where slug = 'classic';

  if classic_theme_version_id is null then
    raise exception 'The published Classic workbook theme is required before importing Grade 2 curricula.';
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
    '42000000-0000-4000-8000-000000000001',
    'imported-us-grade-2-core',
    'United States · Grade 2 Core',
    'us',
    'CCSS + NGSS',
    'US Common Core and Next Generation Science Standards',
    2,
    'en',
    'review',
    classic_theme_version_id
  )
  on conflict (slug) do nothing;

  select id
  into us_curriculum_id
  from public.workbook_curricula
  where slug = 'imported-us-grade-2-core';

  insert into public.workbook_curriculum_revisions (
    id,
    curriculum_id,
    revision_number,
    source,
    plan_json,
    validation_json
  )
  values (
    '42000000-0000-4000-8000-000000000101',
    us_curriculum_id,
    1,
    'imported',
    $json$
    {
      "curriculumName": "United States · Grade 2 Core",
      "workbooks": [
        {
          "stableKey": "2-math",
          "title": "Grade 2 Mathematics",
          "subjectKey": "mathematics",
          "subjectLabel": "Mathematics",
          "domains": [
            "Addition and subtraction within 100, with fluency within 20",
            "Place value and operations within 1,000",
            "Time to five minutes and representation of data",
            "Geometry, equal groups, halves, thirds, and fourths"
          ],
          "languageCode": "en",
          "localeCode": null,
          "layoutProfile": "standard",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-money-us",
          "title": "Grade 2 Money · United States",
          "subjectKey": "mathematics",
          "subjectLabel": "Mathematics",
          "domains": ["US dollars and cents, mixed coins and bills, and money word problems"],
          "languageCode": "en",
          "localeCode": "en-US",
          "layoutProfile": "standard",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-money-ca",
          "title": "Grade 2 Money · Canada",
          "subjectKey": "mathematics",
          "subjectLabel": "Mathematics",
          "domains": ["Canadian dollars and cents, coin combinations, and money sense"],
          "languageCode": "en",
          "localeCode": "en-CA",
          "layoutProfile": "standard",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-money-gb",
          "title": "Grade 2 Money · United Kingdom",
          "subjectKey": "mathematics",
          "subjectLabel": "Mathematics",
          "domains": ["Pounds and pence, combining amounts, and equivalent coin and note combinations"],
          "languageCode": "en",
          "localeCode": "en-GB",
          "layoutProfile": "standard",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-money-au",
          "title": "Grade 2 Money · Australia",
          "subjectKey": "mathematics",
          "subjectLabel": "Mathematics",
          "domains": ["Australian currency and practical money-transaction problem solving"],
          "languageCode": "en",
          "localeCode": "en-AU",
          "layoutProfile": "standard",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-money-ja",
          "title": "Grade 2 Money · Japan",
          "subjectKey": "mathematics",
          "subjectLabel": "Mathematics",
          "domains": ["Japanese yen counting and word problems for English-instruction families in Japan"],
          "languageCode": "en",
          "localeCode": "en-JP",
          "layoutProfile": "standard",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-measurement-customary",
          "title": "Grade 2 Measurement · US Customary",
          "subjectKey": "mathematics",
          "subjectLabel": "Mathematics",
          "domains": ["Measuring and estimating length in inches, feet, and yards", "Length addition and subtraction"],
          "languageCode": "en",
          "localeCode": "en-US",
          "layoutProfile": "standard",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-measurement-metric",
          "title": "Grade 2 Measurement · Metric",
          "subjectKey": "mathematics",
          "subjectLabel": "Mathematics",
          "domains": ["Metric length, mass, temperature, and capacity", "Metric measurement estimation and problem solving"],
          "languageCode": "en",
          "localeCode": null,
          "layoutProfile": "standard",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-reading-level-j",
          "title": "Grade 2 Reader · Level J",
          "subjectKey": "reading",
          "subjectLabel": "Reading",
          "domains": ["Fountas and Pinnell Level J guided reading and comprehension"],
          "languageCode": "en",
          "localeCode": null,
          "layoutProfile": "reader",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-reading-level-k",
          "title": "Grade 2 Reader · Level K",
          "subjectKey": "reading",
          "subjectLabel": "Reading",
          "domains": ["Fountas and Pinnell Level K guided reading and comprehension"],
          "languageCode": "en",
          "localeCode": null,
          "layoutProfile": "reader",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-reading-level-l",
          "title": "Grade 2 Reader · Level L",
          "subjectKey": "reading",
          "subjectLabel": "Reading",
          "domains": ["Fountas and Pinnell Level L guided reading and comprehension"],
          "languageCode": "en",
          "localeCode": null,
          "layoutProfile": "reader",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-reading-level-m",
          "title": "Grade 2 Reader · Level M",
          "subjectKey": "reading",
          "subjectLabel": "Reading",
          "domains": ["Fountas and Pinnell Level M guided reading and comprehension"],
          "languageCode": "en",
          "localeCode": null,
          "layoutProfile": "reader",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-spelling",
          "title": "Grade 2 Spelling",
          "subjectKey": "spelling",
          "subjectLabel": "Spelling",
          "domains": [
            "Compound words and contractions",
            "Prefixes and suffixes",
            "Homophones and irregular plurals",
            "Multisyllable spelling patterns"
          ],
          "languageCode": "en",
          "localeCode": null,
          "layoutProfile": "standard",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-writing-and-grammar",
          "title": "Grade 2 Writing & Grammar",
          "subjectKey": "writing-and-grammar",
          "subjectLabel": "Writing & Grammar",
          "domains": [
            "Grammar and usage",
            "Capitalization and punctuation",
            "Vocabulary and word meaning",
            "Opinion, explanatory, and narrative composition"
          ],
          "languageCode": "en",
          "localeCode": null,
          "layoutProfile": "standard",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-science",
          "title": "Grade 2 Science",
          "subjectKey": "science",
          "subjectLabel": "Science",
          "domains": [
            "Matter and reversible or irreversible changes",
            "Ecosystems and plant-animal relationships",
            "Biodiversity of habitats",
            "Earth systems, erosion, maps, and water"
          ],
          "languageCode": "en",
          "localeCode": null,
          "layoutProfile": "standard",
          "scriptProfile": "latin"
        },
        {
          "stableKey": "2-social-studies",
          "title": "Grade 2 Social Studies",
          "subjectKey": "social-studies",
          "subjectLabel": "Social Studies",
          "domains": [
            "Communities and citizenship",
            "Map and geography skills",
            "Needs, wants, goods, services, producers, and consumers",
            "History, cultures, symbols, and traditions"
          ],
          "languageCode": "en",
          "localeCode": null,
          "layoutProfile": "standard",
          "scriptProfile": "latin"
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "issues": [],
      "import": {
        "sourceRepository": "treeschool-workbooks",
        "sourcePath": "workbook-content/grade-2-curriculum-plan.md",
        "notes": [
          "Grade 1 was not imported because no complete grade-level curriculum plan was found.",
          "The inherited 1to2-phonics-b workbook is intentionally not a new generation target.",
          "The source plan's MEXT Kokugo track is stored in a separate Japan curriculum so generated catalog records retain the correct academic standard.",
          "Already-shipped legacy PDFs are not linked by this catalog import."
        ]
      }
    }
    $json$::jsonb
  )
  on conflict (curriculum_id, revision_number) do nothing;

  update public.workbook_curricula curriculum
  set current_revision_id = revision.id,
      updated_at = now()
  from public.workbook_curriculum_revisions revision
  where curriculum.id = us_curriculum_id
    and revision.curriculum_id = curriculum.id
    and revision.revision_number = 1
    and curriculum.current_revision_id is null;

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
    '42000000-0000-4000-8000-000000000002',
    'imported-japan-grade-2-kokugo',
    'Japan · Grade 2 Kokugo',
    'japan',
    'MEXT',
    'Japanese Course of Study (学習指導要領)',
    2,
    'ja',
    'review',
    classic_theme_version_id
  )
  on conflict (slug) do nothing;

  select id
  into japan_curriculum_id
  from public.workbook_curricula
  where slug = 'imported-japan-grade-2-kokugo';

  insert into public.workbook_curriculum_revisions (
    id,
    curriculum_id,
    revision_number,
    source,
    plan_json,
    validation_json
  )
  values (
    '42000000-0000-4000-8000-000000000102',
    japan_curriculum_id,
    1,
    'imported',
    $json$
    {
      "curriculumName": "Japan · Grade 2 Kokugo",
      "workbooks": [
        {
          "stableKey": "2-kokugo-a",
          "title": "国語A · Grade 2 Kokugo",
          "subjectKey": "kokugo",
          "subjectLabel": "Japanese Language (国語)",
          "domains": ["Cumulative Grade 1 review", "First 40 Grade 2 education kanji", "Grade 2 sentence reading and writing"],
          "languageCode": "ja",
          "localeCode": "ja-JP",
          "layoutProfile": "standard",
          "scriptProfile": "japanese"
        },
        {
          "stableKey": "2-kokugo-b",
          "title": "国語B · Grade 2 Kokugo",
          "subjectKey": "kokugo",
          "subjectLabel": "Japanese Language (国語)",
          "domains": ["Second group of 40 Grade 2 education kanji", "Katakana fluency", "Sentence composition"],
          "languageCode": "ja",
          "localeCode": "ja-JP",
          "layoutProfile": "standard",
          "scriptProfile": "japanese"
        },
        {
          "stableKey": "2-kokugo-c",
          "title": "国語C · Grade 2 Kokugo",
          "subjectKey": "kokugo",
          "subjectLabel": "Japanese Language (国語)",
          "domains": ["Third group of 40 Grade 2 education kanji", "Reading comprehension", "Connected sentence composition"],
          "languageCode": "ja",
          "localeCode": "ja-JP",
          "layoutProfile": "standard",
          "scriptProfile": "japanese"
        },
        {
          "stableKey": "2-kokugo-d",
          "title": "国語D · Grade 2 Kokugo",
          "subjectKey": "kokugo",
          "subjectLabel": "Japanese Language (国語)",
          "domains": ["Final group of 40 Grade 2 education kanji", "Cumulative Grade 2 reading and writing", "Grade 3 readiness"],
          "languageCode": "ja",
          "localeCode": "ja-JP",
          "layoutProfile": "standard",
          "scriptProfile": "japanese"
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "issues": [],
      "import": {
        "sourceRepository": "treeschool-workbooks",
        "sourcePath": "workbook-content/grade-2-curriculum-plan.md#japanese-国語--kokugo-series",
        "notes": [
          "The source intentionally left the exact lettered-book count for Stage 1/2 planning.",
          "This review draft uses the Grade 1 A-D precedent and divides the 160 Grade 2 education kanji into four groups of 40.",
          "Confirm the thematic kanji groupings and predecessor ledger before publishing or generating.",
          "Already-shipped legacy PDFs are not linked by this catalog import."
        ]
      }
    }
    $json$::jsonb
  )
  on conflict (curriculum_id, revision_number) do nothing;

  update public.workbook_curricula curriculum
  set current_revision_id = revision.id,
      updated_at = now()
  from public.workbook_curriculum_revisions revision
  where curriculum.id = japan_curriculum_id
    and revision.curriculum_id = curriculum.id
    and revision.revision_number = 1
    and curriculum.current_revision_id is null;
end
$$;
