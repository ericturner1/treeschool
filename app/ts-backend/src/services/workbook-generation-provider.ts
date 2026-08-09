import { z } from "zod";
import { env } from "../db";
import {
  parseWorkbookContent,
  type WorkbookContent,
} from "./workbook-studio-model";

const outlineSchema = z.object({
  title: z.string().trim().min(1),
  chapters: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        title: z.string().trim().min(1),
        description: z.string().trim().optional(),
        lessons: z
          .array(
            z.object({
              id: z.string().trim().min(1),
              title: z.string().trim().min(1),
              standardsCodes: z.array(z.string()).default([]),
              needsIllustration: z.boolean().default(false),
              summary: z.string().trim().min(1),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export type WorkbookOutline = z.infer<typeof outlineSchema>;

const workbookCurriculumBriefSchema = z.object({
  title: z.string().trim().min(1),
  audience: z.string().trim().min(1),
  learningGoals: z.array(z.string().trim().min(1)).min(1),
  domains: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        title: z.string().trim().min(1),
        description: z.string().trim().min(1),
        standardsCodes: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  vocabulary: z.array(z.string()).default([]),
});

export type WorkbookCurriculumBrief = z.infer<
  typeof workbookCurriculumBriefSchema
>;

const workbookCatalogPlanSchema = z
  .object({
    curriculumName: z.string().trim().min(1),
    workbooks: z
      .array(
        z.object({
          stableKey: z.string().trim().min(1),
          title: z.string().trim().min(1),
          subjectKey: z.string().trim().min(1),
          subjectLabel: z.string().trim().min(1),
          domains: z.array(z.string().trim().min(1)).min(1),
          languageCode: z.string().trim().min(2),
          localeCode: z.string().trim().min(1).nullable(),
          layoutProfile: z.enum(["standard", "reader"]),
          scriptProfile: z.enum(["latin", "japanese"]),
        }),
      )
      .min(1),
  })
  .superRefine((value, context) => {
    const keys = new Set<string>();
    value.workbooks.forEach((workbook, index) => {
      if (keys.has(workbook.stableKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate workbook stableKey: ${workbook.stableKey}`,
          path: ["workbooks", index, "stableKey"],
        });
      }
      keys.add(workbook.stableKey);
    });
  });

export type WorkbookCatalogPlan = z.infer<typeof workbookCatalogPlanSchema>;

export function parseWorkbookCatalogPlan(value: unknown) {
  return workbookCatalogPlanSchema.parse(value);
}

type AnthropicResponse = {
  id?: string;
  content?: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
  >;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
  error?: { message?: string };
};

async function callAnthropicTool(input: {
  prompt: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens: number;
}) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is required for Workbook Studio generation.",
    );
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.WORKBOOK_STUDIO_MODEL,
      max_tokens: input.maxTokens,
      temperature: 0.2,
      messages: [{ role: "user", content: input.prompt }],
      tools: [
        {
          name: input.toolName,
          description: input.toolDescription,
          input_schema: input.inputSchema,
        },
      ],
      tool_choice: { type: "tool", name: input.toolName },
    }),
  });
  const body = (await response.json()) as AnthropicResponse;
  if (!response.ok) {
    throw new Error(
      body.error?.message || `Anthropic returned HTTP ${response.status}.`,
    );
  }
  const toolUse = body.content?.find(
    (
      content,
    ): content is Extract<
      NonNullable<AnthropicResponse["content"]>[number],
      { type: "tool_use" }
    > => content.type === "tool_use" && content.name === input.toolName,
  );
  if (!toolUse) {
    throw new Error(`Claude did not call the required ${input.toolName} tool.`);
  }
  return {
    providerRequestId: body.id ?? null,
    value: toolUse.input,
    usage: {
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
      stopReason: body.stop_reason ?? null,
    },
  };
}

const outlineJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "chapters"],
  properties: {
    title: { type: "string" },
    chapters: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "lessons"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          lessons: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "id",
                "title",
                "standardsCodes",
                "needsIllustration",
                "summary",
              ],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                standardsCodes: { type: "array", items: { type: "string" } },
                needsIllustration: { type: "boolean" },
                summary: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

// The API schema intentionally describes the stable outer vocabulary while
// the Zod model remains the authoritative, stricter save boundary.
const workbookJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "title",
    "editionLabel",
    "gradeLabel",
    "subjectLabel",
    "isCore",
    "introduction",
    "chapters",
  ],
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    title: { type: "string" },
    subtitle: { type: "string" },
    editionLabel: { type: "string" },
    gradeLabel: { type: "string" },
    subjectLabel: { type: "string" },
    isCore: { type: "boolean" },
    introduction: { type: "array", items: { type: "object" } },
    chapters: { type: "array", minItems: 1, items: { type: "object" } },
  },
} as const;

const curriculumBriefJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "audience", "learningGoals", "domains", "vocabulary"],
  properties: {
    title: { type: "string" },
    audience: { type: "string" },
    learningGoals: { type: "array", minItems: 1, items: { type: "string" } },
    vocabulary: { type: "array", items: { type: "string" } },
    domains: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "description", "standardsCodes"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          standardsCodes: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const catalogPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["curriculumName", "workbooks"],
  properties: {
    curriculumName: { type: "string" },
    workbooks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "stableKey",
          "title",
          "subjectKey",
          "subjectLabel",
          "domains",
          "languageCode",
          "localeCode",
          "layoutProfile",
          "scriptProfile",
        ],
        properties: {
          stableKey: { type: "string" },
          title: { type: "string" },
          subjectKey: { type: "string" },
          subjectLabel: { type: "string" },
          domains: { type: "array", minItems: 1, items: { type: "string" } },
          languageCode: { type: "string" },
          localeCode: { type: ["string", "null"] },
          layoutProfile: { type: "string", enum: ["standard", "reader"] },
          scriptProfile: { type: "string", enum: ["latin", "japanese"] },
        },
      },
    },
  },
} as const;

export async function generateWorkbookCatalogPlan(input: {
  assembledPrompt: string;
}) {
  const response = await callAnthropicTool({
    prompt: `${input.assembledPrompt}\n\nPlan the complete grade-level workbook catalog now. Emit one workbooks entry per actual subject and locale variant. Keep stableKey deterministic, lowercase, and dash-separated. A locale variant is a separate entry, not a nested note.`,
    toolName: "save_workbook_catalog_plan",
    toolDescription:
      "Save the grade-level catalog that will fan out into individual Workbook Studio projects.",
    inputSchema: catalogPlanJsonSchema,
    maxTokens: 16_000,
  });
  return { ...response, plan: workbookCatalogPlanSchema.parse(response.value) };
}

export async function generateWorkbookCurriculumBrief(input: {
  assembledPrompt: string;
}) {
  const response = await callAnthropicTool({
    prompt: `${input.assembledPrompt}\n\nCreate the curriculum brief for this one workbook. Define the audience, learning goals, content domains, standards, and controlled vocabulary. Use lowercase dash-separated stable domain ids. Do not create chapters or exercises yet.`,
    toolName: "save_workbook_curriculum_brief",
    toolDescription:
      "Save the scoped curriculum brief that governs one workbook's outline.",
    inputSchema: curriculumBriefJsonSchema,
    maxTokens: 12_000,
  });
  return {
    ...response,
    curriculum: workbookCurriculumBriefSchema.parse(response.value),
  };
}

export async function generateWorkbookOutline(input: {
  assembledPrompt: string;
}) {
  const response = await callAnthropicTool({
    prompt: `${input.assembledPrompt}\n\nCreate the workbook outline now. Stable chapter and lesson ids must use lowercase letters, numbers, and dashes. Do not write full exercises yet.`,
    toolName: "save_workbook_outline",
    toolDescription:
      "Save the structured chapter and lesson outline for the workbook.",
    inputSchema: outlineJsonSchema,
    maxTokens: 12_000,
  });
  return { ...response, outline: outlineSchema.parse(response.value) };
}

export async function generateWorkbookContent(input: {
  assembledPrompt: string;
  outline: WorkbookOutline;
}) {
  const response = await callAnthropicTool({
    prompt: `${input.assembledPrompt}\n\nUse this approved outline exactly; preserve every chapter and lesson id:\n${JSON.stringify(input.outline, null, 2)}\n\nWrite the complete workbook content. Learn blocks may be paragraph, callout, illustration, image_asset, vocabulary_list, reading_passage, or character_practice. Use vocabulary and passage blocks for reader layouts and character-practice blocks for Japanese writing instruction. Exercise types are circle_choice, multiple_choice, matching, fill_in_blank, short_answer, write, and draw_box. Include a correctAnswer or sampleAnswer as required. Use exactly five exercises per standard lesson.`,
    toolName: "save_workbook_content",
    toolDescription:
      "Save a complete Workbook Studio schemaVersion 1 content tree.",
    inputSchema: workbookJsonSchema,
    maxTokens: 32_000,
  });
  return { ...response, content: parseWorkbookContent(response.value) };
}

export function workbookGenerationModel() {
  return env.WORKBOOK_STUDIO_MODEL;
}

export type GeneratedWorkbookContent = WorkbookContent;
