# Lesson-plan generator parity

Treeschool has two deliberately separate lesson-plan generator experiences:

- Public marketing funnel: `app/ts-frontend/app/pack/plan-pack-intake-form.tsx`, surfaced at `/homeschool-lesson-plan-generator`.
- Authenticated subscriber planner: `app/ts-frontend/app/p/student/[studentId]/curriculum/authenticated-plan-generator.tsx`, surfaced at `/p/student/{student}/lesson-plan`.

They may diverge in presentation, but an update to either must trigger a review of the other.

## Keep aligned

- Plan preferences: holiday/teaching weeks, teaching days, and print size.
- Teaching-material sources: Treeschool workbooks and parent uploads.
- Subject creation and editing, prerequisite ordering, subject-day frequency, and notes.
- Supported upload formats, the 2,000-page limit, page counting, and refresh-safe drafts.
- Validation, progress feedback, accessibility, mobile layout, and understandable error recovery.

Shared limits and accepted file types live in `app/ts-frontend/lib/plan-generator-contract.ts`. Do not duplicate them in either component.

## Intentional differences

The public funnel lacks account context. It may collect the student name, grade, school-year dates, parent email, consent, and Family Plan checkout details, and it must persist local files until checkout succeeds. Its school-year date chooser is public context, not a general parity requirement.

The subscriber planner receives the account and student from the session, including the student’s established school-year context. It should display that inherited period where useful, but it must not ask for the school-year dates again inside the generator. It may also use owned workbooks, existing documents, saved academic reviews, plan progress, regeneration history, permissions, and other authenticated state. Do not copy those assumptions into the public funnel.

## Required verification after either path changes

Run:

```sh
bun run verify:plan-generators
```

That command runs the parity regression test and a production frontend build. Then smoke-test both local routes:

1. `/homeschool-lesson-plan-generator`
2. `/p/student/{student}/lesson-plan` while signed in

In both, verify plan preferences, adding/editing/removing a subject, Treeschool workbook selection, parent-file selection, prerequisite selection, page totals/limits, moving to review, and restoring a draft after refresh. Also verify the public Family Plan order summary and the subscriber-only academic review/planning lifecycle.
