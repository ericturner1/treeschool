import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import {
  curriculumNodes,
  lexicon,
  nodeKeywords,
  profiles,
  schedules,
  studentVocabulary
} from "ts-db";
import { db } from "../db";

export async function getPioneerWords(
  profileId: string,
  limit = 10,
  languageCode = "en-US"
) {
  const [profile] = await db
    .select({
      gradeLevel: profiles.gradeLevel
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!profile) {
    throw new Error(`Profile ${profileId} not found.`);
  }

  const [schedule] = await db
    .select({
      weeklyPlan: schedules.weeklyPlan
    })
    .from(schedules)
    .where(eq(schedules.profileId, profileId))
    .limit(1);

  const scheduledNodeIds = extractScheduledNodeIds(schedule?.weeklyPlan);

  const prioritizedWordIds =
    scheduledNodeIds.length > 0
      ? await db
          .select({
            wordId: nodeKeywords.wordId,
            priority: nodeKeywords.priority
          })
          .from(nodeKeywords)
          .where(inArray(nodeKeywords.nodeId, scheduledNodeIds))
          .orderBy(desc(nodeKeywords.priority))
      : [];

  const prioritizedWordIdSet = new Set(prioritizedWordIds.map((row) => row.wordId));

  const candidates = await db
    .select({
      id: lexicon.id,
      word: lexicon.word,
      languageCode: lexicon.languageCode,
      introducedAtLevel: lexicon.introducedAtLevel,
      status: studentVocabulary.status
    })
    .from(studentVocabulary)
    .innerJoin(lexicon, eq(studentVocabulary.wordId, lexicon.id))
    .where(
      and(
        eq(studentVocabulary.profileId, profileId),
        eq(studentVocabulary.status, "candidate"),
        eq(lexicon.languageCode, languageCode),
        lte(lexicon.introducedAtLevel, profile.gradeLevel ?? 0)
      )
    )
    .orderBy(asc(lexicon.word));

  return candidates
    .sort((left, right) => {
      const leftPriority = prioritizedWordIdSet.has(left.id) ? 1 : 0;
      const rightPriority = prioritizedWordIdSet.has(right.id) ? 1 : 0;

      return rightPriority - leftPriority || left.word.localeCompare(right.word);
    })
    .slice(0, limit);
}

export async function getConsumerSafeWordWhitelist(
  profileId: string,
  languageCode = "en-US"
) {
  return getKnownVocabularyWords(profileId, languageCode);
}

export async function syncCandidateVocabularyForCompletedGrade(
  profileId: string,
  completedGradeLevel: number
) {
  return db
    .update(studentVocabulary)
    .set({
      status: "known"
    })
    .where(
      and(
        eq(studentVocabulary.profileId, profileId),
        eq(studentVocabulary.status, "candidate"),
        inArray(
          studentVocabulary.wordId,
          db
            .select({
              id: lexicon.id
            })
            .from(lexicon)
            .where(lte(lexicon.introducedAtLevel, completedGradeLevel))
        )
      )
    );
}

export async function getKnownVocabularyWords(
  profileId: string,
  languageCode = "en-US"
) {
  const rows = await db
    .select({
      word: lexicon.word
    })
    .from(studentVocabulary)
    .innerJoin(lexicon, eq(studentVocabulary.wordId, lexicon.id))
    .where(
      and(
        eq(studentVocabulary.profileId, profileId),
        eq(studentVocabulary.status, "known"),
        eq(lexicon.languageCode, languageCode)
      )
    )
    .orderBy(asc(lexicon.word));

  return rows.map((row) => row.word);
}

export async function getNodeTechnicalVocabularyContext(
  profileId: string,
  nodeId: string,
  languageCode = "en-US"
) {
  const knownWords = await getKnownVocabularyWords(profileId, languageCode);
  const knownWordSet = new Set(knownWords.map((word) => word.toLocaleLowerCase()));

  const [node] = await db
    .select({
      technicalKeywords: curriculumNodes.technicalKeywords
    })
    .from(curriculumNodes)
    .where(eq(curriculumNodes.id, nodeId))
    .limit(1);

  const linkedKeywordRows = await db
    .select({
      word: lexicon.word,
      definitionSimple: lexicon.definitionSimple,
      preferredSynonym: lexicon.preferredSynonym
    })
    .from(nodeKeywords)
    .innerJoin(lexicon, eq(nodeKeywords.wordId, lexicon.id))
    .where(and(eq(nodeKeywords.nodeId, nodeId), eq(lexicon.languageCode, languageCode)))
    .orderBy(desc(nodeKeywords.priority), asc(lexicon.word));

  const keywordSet = new Set<string>();

  for (const keyword of node?.technicalKeywords ?? []) {
    if (keyword.trim()) {
      keywordSet.add(keyword.trim());
    }
  }

  for (const row of linkedKeywordRows) {
    if (row.word.trim()) {
      keywordSet.add(row.word.trim());
    }
  }

  const technicalKeywords = [...keywordSet];
  const lexiconRows =
    technicalKeywords.length === 0
      ? []
      : await db
          .select({
            word: lexicon.word,
            definitionSimple: lexicon.definitionSimple,
            preferredSynonym: lexicon.preferredSynonym
          })
          .from(lexicon)
          .where(
            and(
              eq(lexicon.languageCode, languageCode),
              inArray(lexicon.word, technicalKeywords)
            )
          );

  const lexiconByWord = new Map(
    lexiconRows.map((row) => [row.word.toLocaleLowerCase(), row] as const)
  );

  const missingKeywords = technicalKeywords
    .filter((word) => !knownWordSet.has(word.toLocaleLowerCase()))
    .map((word) => {
      const lexiconMatch = lexiconByWord.get(word.toLocaleLowerCase());

      return {
        word,
        definitionSimple: lexiconMatch?.definitionSimple ?? null,
        preferredSynonym: lexiconMatch?.preferredSynonym ?? null
      };
    });

  return {
    knownWords,
    technicalKeywords,
    missingKeywords
  };
}

function extractScheduledNodeIds(weeklyPlan: unknown) {
  if (!weeklyPlan || typeof weeklyPlan !== "object") {
    return [];
  }

  const ids = new Set<string>();
  const stack: unknown[] = [weeklyPlan];

  while (stack.length > 0) {
    const value = stack.pop();

    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }

    if (!value || typeof value !== "object") {
      continue;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (key === "nodeId" && typeof nestedValue === "string") {
        ids.add(nestedValue);
      } else {
        stack.push(nestedValue);
      }
    }
  }

  return [...ids];
}
