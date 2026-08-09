import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { workbookGenerationRules, workbookGenerationRuleVersions } from "ts-db";
import { db } from "../db";
import {
  validateWorkbookForPublish,
  type WorkbookContent,
  type WorkbookValidationPolicy,
} from "./workbook-studio-model";

export type WorkbookValidationScope = {
  subjectKey: string;
  gradeMin: number;
  gradeMax: number;
  languageCode: string;
};

export async function resolveWorkbookValidationPolicy(
  scope: WorkbookValidationScope,
): Promise<WorkbookValidationPolicy> {
  const rules = await db
    .select({
      name: workbookGenerationRules.name,
      ruleKind: workbookGenerationRules.ruleKind,
      scopeType: workbookGenerationRuleVersions.scopeType,
      parametersJson: workbookGenerationRuleVersions.parametersJson,
    })
    .from(workbookGenerationRuleVersions)
    .innerJoin(
      workbookGenerationRules,
      eq(workbookGenerationRules.id, workbookGenerationRuleVersions.ruleId),
    )
    .where(
      and(
        eq(workbookGenerationRuleVersions.status, "published"),
        eq(workbookGenerationRules.status, "active"),
        or(
          isNull(workbookGenerationRuleVersions.subjectKey),
          eq(workbookGenerationRuleVersions.subjectKey, scope.subjectKey),
        ),
        or(
          isNull(workbookGenerationRuleVersions.gradeMin),
          sql`${workbookGenerationRuleVersions.gradeMin} <= ${scope.gradeMax}`,
        ),
        or(
          isNull(workbookGenerationRuleVersions.gradeMax),
          sql`${workbookGenerationRuleVersions.gradeMax} >= ${scope.gradeMin}`,
        ),
        or(
          isNull(workbookGenerationRuleVersions.languageCode),
          eq(workbookGenerationRuleVersions.languageCode, scope.languageCode),
        ),
      ),
    )
    .orderBy(asc(workbookGenerationRules.name));

  const scopePrecedence = new Map([
    ["global", 0],
    ["language", 1],
    ["subject", 2],
    ["grade", 2],
    ["subject_grade", 3],
  ]);
  rules.sort((left, right) =>
    (scopePrecedence.get(left.scopeType) ?? 0) -
      (scopePrecedence.get(right.scopeType) ?? 0) ||
    left.name.localeCompare(right.name),
  );

  const policy: WorkbookValidationPolicy = {
    standardExerciseCount: 5,
    requireFlaggedIllustrations: true,
  };
  for (const rule of rules) {
    if (rule.ruleKind === "exercise_count") {
      const count = rule.parametersJson.exerciseCount;
      if (
        typeof count === "number" &&
        Number.isInteger(count) &&
        count > 0 &&
        count <= 50
      ) {
        policy.standardExerciseCount = count;
      }
    }
    if (rule.ruleKind === "illustration_presence") {
      const required = rule.parametersJson.required;
      policy.requireFlaggedIllustrations =
        typeof required === "boolean" ? required : true;
    }
  }
  return policy;
}

export async function validateWorkbookForScope(
  content: WorkbookContent,
  scope: WorkbookValidationScope,
) {
  return validateWorkbookForPublish(
    content,
    await resolveWorkbookValidationPolicy(scope),
  );
}
