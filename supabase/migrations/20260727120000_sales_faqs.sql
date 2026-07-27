CREATE TABLE IF NOT EXISTS public.sales_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  short_answer text,
  category text NOT NULL DEFAULT 'general',
  source_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  band_eligible boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_faqs_slug_format_check
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT sales_faqs_question_length_check
    CHECK (char_length(question) BETWEEN 5 AND 240),
  CONSTRAINT sales_faqs_answer_length_check
    CHECK (char_length(answer) BETWEEN 20 AND 5000),
  CONSTRAINT sales_faqs_short_answer_length_check
    CHECK (short_answer IS NULL OR char_length(short_answer) <= 360),
  CONSTRAINT sales_faqs_category_check
    CHECK (category IN ('printing', 'learning', 'planning', 'curriculum', 'account', 'policy', 'general')),
  CONSTRAINT sales_faqs_source_links_array_check
    CHECK (jsonb_typeof(source_links) = 'array'),
  CONSTRAINT sales_faqs_display_order_check
    CHECK (display_order >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_faqs_slug_lower_unique
  ON public.sales_faqs (lower(slug));
CREATE INDEX IF NOT EXISTS sales_faqs_published_order_idx
  ON public.sales_faqs (is_published, display_order, created_at);

ALTER TABLE public.sales_faqs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sales_faqs IS
  'Sales-focused objections and answers, ordered for the public FAQ and reusable as landing-page objection bands.';
COMMENT ON COLUMN public.sales_faqs.band_eligible IS
  'Marks an objection as suitable for deliberate reuse in a marketing-page band.';
COMMENT ON COLUMN public.sales_faqs.source_links IS
  'Optional primary or authoritative evidence links supporting factual claims in the answer.';

INSERT INTO public.sales_faqs (
  slug,
  question,
  answer,
  short_answer,
  category,
  source_links,
  display_order,
  is_published,
  band_eligible
)
VALUES
  (
    'isnt-printing-all-that-paper-expensive',
    'Isn''t printing all that paper expensive?',
    'Most weekly lesson-plan files contain about 15–30 logical pages before print settings. Treeschool''s compact-print option places two lesson pages on each printed side. Combined with duplex printing, that usually means roughly 4–8 physical sheets for the week—nearly four times fewer sheets than printing every page single-sided. At an illustrative home-printing cost of 3–8 cents per black-and-white side, a compact week would be roughly 24 cents to $1.20, depending on your printer, ink coverage, and local paper prices. You can also download only the day you need.\n\nPaper is a deliberate learning choice, not a promise that paper is best for every task. Studies with young children have found that handwriting practice can improve letter recognition and recruit brain systems involved in early reading. Treeschool keeps the parent''s planning tools online while preserving pencil-and-paper learning where it is useful—and resisting the slow creep of another child-facing screen.',
    'Compact printing and duplex mode can turn a typical 15–30-page week into roughly 4–8 physical sheets.',
    'printing',
    '["https://pubmed.ncbi.nlm.nih.gov/15823243/","https://pubmed.ncbi.nlm.nih.gov/25541600/"]'::jsonb,
    10,
    true,
    true
  ),
  (
    'will-my-child-be-glued-to-another-screen',
    'Will my child be glued to another screen?',
    'No. Treeschool is intentionally parent-operated and paper-first. Parents use the dashboard to plan, print, record attendance, and optionally save grades. Children do the scheduled work in printed workbooks, on paper, through books, discussion, projects, and real life. A screen can help the parent administer school without becoming the place where the child spends the school day.',
    'The parent manages Treeschool online; the child''s planned work remains primarily on paper.',
    'learning',
    '[]'::jsonb,
    20,
    true,
    true
  ),
  (
    'do-i-have-to-replace-my-workbooks',
    'Do I have to replace the workbooks I already own?',
    'No. If you have lawful PDF copies of the workbooks you chose, you can add them to the lesson planner and Treeschool will organize their teaching material into weekly and daily plans. Treeschool workbooks are available when you want a ready-made option, but the platform is designed to respect a parent''s curriculum choices rather than trap the family inside one publisher.',
    'Bring lawful PDF workbooks you already chose, use Treeschool books, or combine both.',
    'curriculum',
    '[]'::jsonb,
    30,
    true,
    true
  ),
  (
    'does-treeschool-force-a-rigid-schedule',
    'Does Treeschool force us into a rigid school schedule?',
    'No. You choose the school-year dates, teaching weeks, days per week, recurring days off, and planned holidays. The resulting plan gives the year a useful shape without taking control away from the parent. If your family teaches differently from week to week, the calendar, lesson choices, and future-plan tools are there to support that flexibility.',
    'You set the school year, teaching days, days off, and holidays; Treeschool supplies structure without taking control.',
    'planning',
    '[]'::jsonb,
    40,
    true,
    true
  ),
  (
    'what-if-we-fall-behind',
    'What happens if life gets in the way and we fall behind?',
    'That is normal homeschooling, not failure. Treeschool shows whether the year is ahead, on schedule, or behind; planned holidays and recurring days off do not break the student''s learning streak. You can keep working from the earliest unfinished week, postpone individual lessons, and adjust future work without erasing grades, attendance, or completed progress.',
    'Treeschool preserves completed work and helps you resume from the earliest unfinished week.',
    'planning',
    '[]'::jsonb,
    50,
    true,
    true
  ),
  (
    'complete-curriculum-or-lesson-planner',
    'Is Treeschool a complete curriculum, or only a lesson planner?',
    'It can serve either role. Treeschool is a paper-first elementary homeschool platform for grades K–4, with planning, printable lesson files, attendance, grading, progress, and parent-teacher administration. Our first-grade core curriculum is available as a complete ready-made collection. Families can also use the planning tools with their own PDF workbooks, especially where the Treeschool library is still growing.',
    'Use Treeschool''s complete first-grade collection or organize your own PDF curriculum with the same planning tools.',
    'curriculum',
    '[]'::jsonb,
    60,
    true,
    true
  ),
  (
    'what-if-my-child-already-knows-a-lesson',
    'What if my child already knows some of the material?',
    'You do not have to print busywork merely because it exists in a workbook. Before download, parents can review indexed Treeschool lessons and mark individual lessons to include, save for later, remove, or treat as already mastered. Those choices stay connected to the workbook so future planning can respect work the child has already completed or outgrown.',
    'Review lessons and mark them included, later, removed, or mastered before they reach the printed plan.',
    'learning',
    '[]'::jsonb,
    70,
    true,
    true
  ),
  (
    'do-i-have-to-grade-everything',
    'Do I have to grade every lesson?',
    'No. Grades are optional because not every useful homeschool activity is an assessment. You can simply mark lessons done and record attendance, then add a percentage grade only when a lesson, quiz, or assignment genuinely benefits from one. Treeschool keeps progress and grading separate so the record stays honest and useful.',
    'Mark work done without grading it; add grades only where they help.',
    'learning',
    '[]'::jsonb,
    80,
    true,
    false
  ),
  (
    'can-more-than-one-adult-help',
    'Can both parents—or another teacher—help?',
    'Yes. Invite trusted adults by email and give them a teacher role. The Single plan supports up to two teacher users, while the Standard plan supports up to four. Teachers can help record lessons, attendance, and grades, while account owners and administrators retain control over sensitive account and deletion actions.',
    'Invite up to two teacher users on Single or four on Standard, with role-appropriate permissions.',
    'account',
    '[]'::jsonb,
    90,
    true,
    false
  ),
  (
    'is-treeschool-accredited',
    'Is Treeschool an accredited school?',
    'No. Treeschool is a parent-directed curriculum, planning, and homeschool recordkeeping platform—not a school, accrediting body, or legal-compliance service. Homeschool requirements vary by location, so parents remain responsible for understanding the rules that apply to their family. Treeschool exists to help parents teach and keep useful records without surrendering direction of their child''s education.',
    'Treeschool supports parent-directed homeschooling; it is not a school or accrediting body.',
    'policy',
    '[]'::jsonb,
    100,
    true,
    true
  )
ON CONFLICT DO NOTHING;
