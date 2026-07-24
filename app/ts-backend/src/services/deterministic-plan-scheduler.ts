export type DeterministicSchedulerMaterial = {
  id: string;
  prerequisiteMaterialSetId: string | null;
  sortOrder: number;
};

export type DeterministicSchedulerUnit = {
  key: string;
  documentId: string;
  materialSetId: string;
  subjectKey: string;
  subjectLabel: string;
  documentOrder: number;
  sequenceOrder: number;
  estimatedMinutes: number;
  pageCount: number;
  progressPriority?: "deferred" | null;
};

export type DeterministicSchedulerSubjectPreference = {
  subjectKey: string;
  daysPerWeek: number | null;
};

export type DeterministicScheduleAssignment = {
  unitKey: string;
  weekNumber: number;
  dayNumber: number | null;
};

export type DeterministicScheduleResult = {
  assignments: DeterministicScheduleAssignment[];
  diagnostics: {
    algorithmVersion: number;
    materialCount: number;
    unitCount: number;
    weekCount: number;
    prerequisiteTransitions: Array<{
      prerequisiteMaterialSetId: string;
      dependentMaterialSetId: string;
      prerequisiteLastWeek: number;
      dependentFirstWeek: number;
    }>;
  };
};

export const DETERMINISTIC_SCHEDULING_ALGORITHM_VERSION = 6;

type WeekAssignment = {
  unit: DeterministicSchedulerUnit;
  weekNumber: number;
  dayNumber: number | null;
};

function fillEmptyTeachingWeeks(input: {
  assignments: WeekAssignment[];
  weekNumbers: number[];
  materialById: Map<string, DeterministicSchedulerMaterial>;
  unitsByMaterialId: Map<string, DeterministicSchedulerUnit[]>;
  childrenByMaterialId: Map<string, string[]>;
}) {
  if (input.assignments.length < input.weekNumbers.length) return;

  const assignmentByUnitKey = new Map(
    input.assignments.map((assignment) => [assignment.unit.key, assignment])
  );
  const firstWeek = input.weekNumbers[0];
  const lastWeek = input.weekNumbers[input.weekNumbers.length - 1];
  if (firstWeek == null || lastWeek == null) return;

  const assignmentBounds = (assignment: WeekAssignment) => {
    const materialUnits = input.unitsByMaterialId.get(assignment.unit.materialSetId) ?? [];
    const unitIndex = materialUnits.findIndex((unit) => unit.key === assignment.unit.key);
    let minimumWeek = firstWeek;
    let maximumWeek = lastWeek;

    if (unitIndex > 0) {
      const previousAssignment = assignmentByUnitKey.get(materialUnits[unitIndex - 1]!.key);
      if (previousAssignment) minimumWeek = Math.max(minimumWeek, previousAssignment.weekNumber);
    }
    if (unitIndex >= 0 && unitIndex + 1 < materialUnits.length) {
      const nextAssignment = assignmentByUnitKey.get(materialUnits[unitIndex + 1]!.key);
      if (nextAssignment) maximumWeek = Math.min(maximumWeek, nextAssignment.weekNumber);
    }

    const prerequisiteMaterialId = input.materialById.get(
      assignment.unit.materialSetId
    )?.prerequisiteMaterialSetId;
    if (prerequisiteMaterialId) {
      const prerequisiteWeeks = input.assignments
        .filter((candidate) => candidate.unit.materialSetId === prerequisiteMaterialId)
        .map((candidate) => candidate.weekNumber);
      if (prerequisiteWeeks.length > 0) {
        const firstEligibleWeek = Math.max(...prerequisiteWeeks) + 1;
        minimumWeek = Math.max(minimumWeek, firstEligibleWeek);
        if (unitIndex === 0) maximumWeek = Math.min(maximumWeek, firstEligibleWeek);
      }
    }

    const dependentWeeks = (input.childrenByMaterialId.get(assignment.unit.materialSetId) ?? [])
      .flatMap((dependentMaterialId) => input.assignments
        .filter((candidate) => candidate.unit.materialSetId === dependentMaterialId)
        .map((candidate) => candidate.weekNumber));
    if (dependentWeeks.length > 0) {
      const lastEligibleWeek = Math.min(...dependentWeeks) - 1;
      maximumWeek = Math.min(maximumWeek, lastEligibleWeek);
      if (unitIndex === materialUnits.length - 1) {
        minimumWeek = Math.max(minimumWeek, lastEligibleWeek);
      }
    }

    return { minimumWeek, maximumWeek };
  };

  for (const emptyWeek of input.weekNumbers) {
    const weekLoads = new Map(
      input.weekNumbers.map((weekNumber) => [
        weekNumber,
        input.assignments.filter((assignment) => assignment.weekNumber === weekNumber).length
      ])
    );
    if ((weekLoads.get(emptyWeek) ?? 0) > 0) continue;

    const candidates = input.assignments
      .filter((assignment) => {
        if ((weekLoads.get(assignment.weekNumber) ?? 0) <= 1) return false;
        const bounds = assignmentBounds(assignment);
        return emptyWeek >= bounds.minimumWeek && emptyWeek <= bounds.maximumWeek;
      })
      .sort((left, right) =>
        Math.abs(left.weekNumber - emptyWeek) - Math.abs(right.weekNumber - emptyWeek) ||
        (weekLoads.get(right.weekNumber) ?? 0) - (weekLoads.get(left.weekNumber) ?? 0) ||
        unitWeight(left.unit) - unitWeight(right.unit) ||
        sortUnits(left.unit, right.unit)
      );

    const selected = candidates[0];
    if (selected) selected.weekNumber = emptyWeek;
  }
}

function balanceTeachingWeekLoads(input: {
  assignments: WeekAssignment[];
  weekNumbers: number[];
  materialById: Map<string, DeterministicSchedulerMaterial>;
  unitsByMaterialId: Map<string, DeterministicSchedulerUnit[]>;
  childrenByMaterialId: Map<string, string[]>;
}) {
  if (input.assignments.length < 2 || input.weekNumbers.length < 2) return;

  const firstWeek = input.weekNumbers[0];
  const lastWeek = input.weekNumbers[input.weekNumbers.length - 1];
  if (firstWeek == null || lastWeek == null) return;

  const assignmentByUnitKey = new Map(
    input.assignments.map((assignment) => [assignment.unit.key, assignment])
  );
  const countByWeek = new Map(input.weekNumbers.map((weekNumber) => [weekNumber, 0]));
  const weightByWeek = new Map(input.weekNumbers.map((weekNumber) => [weekNumber, 0]));
  const materialWeekKey = (materialSetId: string, weekNumber: number) =>
    `${materialSetId}:${weekNumber}`;
  const materialCountByWeek = new Map<string, number>();
  for (const assignment of input.assignments) {
    countByWeek.set(assignment.weekNumber, (countByWeek.get(assignment.weekNumber) ?? 0) + 1);
    weightByWeek.set(
      assignment.weekNumber,
      (weightByWeek.get(assignment.weekNumber) ?? 0) + unitWeight(assignment.unit)
    );
    const key = materialWeekKey(assignment.unit.materialSetId, assignment.weekNumber);
    materialCountByWeek.set(key, (materialCountByWeek.get(key) ?? 0) + 1);
  }

  const averageUnitWeight = Math.max(
    1,
    input.assignments.reduce((total, assignment) => total + unitWeight(assignment.unit), 0) /
      input.assignments.length
  );
  const weekScore = (count: number, weight: number) =>
    count ** 2 + 0.35 * (weight / averageUnitWeight) ** 2;

  const assignmentBounds = (assignment: WeekAssignment) => {
    const materialUnits = input.unitsByMaterialId.get(assignment.unit.materialSetId) ?? [];
    const unitIndex = materialUnits.findIndex((unit) => unit.key === assignment.unit.key);
    let minimumWeek = firstWeek;
    let maximumWeek = lastWeek;

    if (unitIndex > 0) {
      const previousAssignment = assignmentByUnitKey.get(materialUnits[unitIndex - 1]!.key);
      if (previousAssignment) minimumWeek = Math.max(minimumWeek, previousAssignment.weekNumber);
    }
    if (unitIndex >= 0 && unitIndex + 1 < materialUnits.length) {
      const nextAssignment = assignmentByUnitKey.get(materialUnits[unitIndex + 1]!.key);
      if (nextAssignment) maximumWeek = Math.min(maximumWeek, nextAssignment.weekNumber);
    }

    const prerequisiteMaterialId = input.materialById.get(
      assignment.unit.materialSetId
    )?.prerequisiteMaterialSetId;
    if (prerequisiteMaterialId) {
      const prerequisiteWeeks = input.assignments
        .filter((candidate) => candidate.unit.materialSetId === prerequisiteMaterialId)
        .map((candidate) => candidate.weekNumber);
      if (prerequisiteWeeks.length > 0) {
        const firstEligibleWeek = Math.max(...prerequisiteWeeks) + 1;
        minimumWeek = Math.max(minimumWeek, firstEligibleWeek);
        if (unitIndex === 0) maximumWeek = Math.min(maximumWeek, firstEligibleWeek);
      }
    }

    const dependentWeeks = (input.childrenByMaterialId.get(assignment.unit.materialSetId) ?? [])
      .flatMap((dependentMaterialId) => input.assignments
        .filter((candidate) => candidate.unit.materialSetId === dependentMaterialId)
        .map((candidate) => candidate.weekNumber));
    if (dependentWeeks.length > 0) {
      const lastEligibleWeek = Math.min(...dependentWeeks) - 1;
      maximumWeek = Math.min(maximumWeek, lastEligibleWeek);
      if (unitIndex === materialUnits.length - 1) {
        minimumWeek = Math.max(minimumWeek, lastEligibleWeek);
      }
    }

    return { minimumWeek, maximumWeek };
  };

  const maximumMoves = input.assignments.length * input.weekNumbers.length;
  for (let moveNumber = 0; moveNumber < maximumMoves; moveNumber += 1) {
    let bestMove: {
      assignment: WeekAssignment;
      destinationWeek: number;
      improvement: number;
      distance: number;
    } | null = null;

    for (const assignment of input.assignments) {
      const sourceWeek = assignment.weekNumber;
      const sourceCount = countByWeek.get(sourceWeek) ?? 0;
      if (sourceCount <= 1) continue;
      const sourceWeight = weightByWeek.get(sourceWeek) ?? 0;
      const assignmentWeight = unitWeight(assignment.unit);
      const { minimumWeek, maximumWeek } = assignmentBounds(assignment);

      for (const destinationWeek of input.weekNumbers) {
        if (
          destinationWeek === sourceWeek ||
          destinationWeek < minimumWeek ||
          destinationWeek > maximumWeek
        ) continue;
        const sourceMaterialCount = materialCountByWeek.get(
          materialWeekKey(assignment.unit.materialSetId, sourceWeek)
        ) ?? 0;
        const destinationMaterialCount = materialCountByWeek.get(
          materialWeekKey(assignment.unit.materialSetId, destinationWeek)
        ) ?? 0;
        if (sourceMaterialCount <= 1 && destinationMaterialCount > 0) continue;

        const destinationCount = countByWeek.get(destinationWeek) ?? 0;
        const destinationWeight = weightByWeek.get(destinationWeek) ?? 0;
        const before = weekScore(sourceCount, sourceWeight) +
          weekScore(destinationCount, destinationWeight);
        const after = weekScore(sourceCount - 1, sourceWeight - assignmentWeight) +
          weekScore(destinationCount + 1, destinationWeight + assignmentWeight);
        const improvement = before - after;
        if (improvement <= 1e-9) continue;

        const distance = Math.abs(sourceWeek - destinationWeek);
        if (
          !bestMove ||
          improvement > bestMove.improvement + 1e-9 ||
          (Math.abs(improvement - bestMove.improvement) <= 1e-9 && distance < bestMove.distance) ||
          (Math.abs(improvement - bestMove.improvement) <= 1e-9 &&
            distance === bestMove.distance &&
            sortUnits(assignment.unit, bestMove.assignment.unit) < 0)
        ) {
          bestMove = { assignment, destinationWeek, improvement, distance };
        }
      }
    }

    if (!bestMove) break;
    const sourceWeek = bestMove.assignment.weekNumber;
    const assignmentWeight = unitWeight(bestMove.assignment.unit);
    countByWeek.set(sourceWeek, (countByWeek.get(sourceWeek) ?? 0) - 1);
    weightByWeek.set(sourceWeek, (weightByWeek.get(sourceWeek) ?? 0) - assignmentWeight);
    countByWeek.set(
      bestMove.destinationWeek,
      (countByWeek.get(bestMove.destinationWeek) ?? 0) + 1
    );
    weightByWeek.set(
      bestMove.destinationWeek,
      (weightByWeek.get(bestMove.destinationWeek) ?? 0) + assignmentWeight
    );
    const sourceMaterialKey = materialWeekKey(
      bestMove.assignment.unit.materialSetId,
      sourceWeek
    );
    const destinationMaterialKey = materialWeekKey(
      bestMove.assignment.unit.materialSetId,
      bestMove.destinationWeek
    );
    materialCountByWeek.set(
      sourceMaterialKey,
      (materialCountByWeek.get(sourceMaterialKey) ?? 0) - 1
    );
    materialCountByWeek.set(
      destinationMaterialKey,
      (materialCountByWeek.get(destinationMaterialKey) ?? 0) + 1
    );
    bestMove.assignment.weekNumber = bestMove.destinationWeek;
  }

  // A one-way move can be blocked even when two weeks would both improve by
  // exchanging a long unit for a short one. This commonly occurs near the end
  // of the year, where several subject sequences each have one final lesson.
  // Consider deterministic two-way swaps after ordinary moves have settled.
  const maximumSwaps = input.assignments.length * input.weekNumbers.length;
  for (let swapNumber = 0; swapNumber < maximumSwaps; swapNumber += 1) {
    let bestSwap: {
      left: WeekAssignment;
      right: WeekAssignment;
      improvement: number;
      distance: number;
    } | null = null;

    for (let leftIndex = 0; leftIndex < input.assignments.length; leftIndex += 1) {
      const left = input.assignments[leftIndex]!;
      const leftWeek = left.weekNumber;
      const leftWeight = unitWeight(left.unit);
      const leftBounds = assignmentBounds(left);

      for (let rightIndex = leftIndex + 1; rightIndex < input.assignments.length; rightIndex += 1) {
        const right = input.assignments[rightIndex]!;
        const rightWeek = right.weekNumber;
        if (leftWeek === rightWeek || left.unit.materialSetId === right.unit.materialSetId) continue;
        const rightBounds = assignmentBounds(right);
        if (
          rightWeek < leftBounds.minimumWeek || rightWeek > leftBounds.maximumWeek ||
          leftWeek < rightBounds.minimumWeek || leftWeek > rightBounds.maximumWeek
        ) continue;

        const leftSourceMaterialCount = materialCountByWeek.get(
          materialWeekKey(left.unit.materialSetId, leftWeek)
        ) ?? 0;
        const leftDestinationMaterialCount = materialCountByWeek.get(
          materialWeekKey(left.unit.materialSetId, rightWeek)
        ) ?? 0;
        const rightSourceMaterialCount = materialCountByWeek.get(
          materialWeekKey(right.unit.materialSetId, rightWeek)
        ) ?? 0;
        const rightDestinationMaterialCount = materialCountByWeek.get(
          materialWeekKey(right.unit.materialSetId, leftWeek)
        ) ?? 0;
        if (
          (leftSourceMaterialCount <= 1 && leftDestinationMaterialCount > 0) ||
          (rightSourceMaterialCount <= 1 && rightDestinationMaterialCount > 0)
        ) continue;

        const rightWeight = unitWeight(right.unit);
        if (Math.abs(leftWeight - rightWeight) <= 1e-9) continue;
        const leftCount = countByWeek.get(leftWeek) ?? 0;
        const rightCount = countByWeek.get(rightWeek) ?? 0;
        const leftWeekWeight = weightByWeek.get(leftWeek) ?? 0;
        const rightWeekWeight = weightByWeek.get(rightWeek) ?? 0;
        const before = weekScore(leftCount, leftWeekWeight) +
          weekScore(rightCount, rightWeekWeight);
        const after = weekScore(leftCount, leftWeekWeight - leftWeight + rightWeight) +
          weekScore(rightCount, rightWeekWeight - rightWeight + leftWeight);
        const improvement = before - after;
        if (improvement <= 1e-9) continue;

        const distance = Math.abs(leftWeek - rightWeek);
        if (
          !bestSwap ||
          improvement > bestSwap.improvement + 1e-9 ||
          (Math.abs(improvement - bestSwap.improvement) <= 1e-9 && distance < bestSwap.distance) ||
          (Math.abs(improvement - bestSwap.improvement) <= 1e-9 &&
            distance === bestSwap.distance &&
            sortUnits(left.unit, bestSwap.left.unit) < 0)
        ) {
          bestSwap = { left, right, improvement, distance };
        }
      }
    }

    if (!bestSwap) break;
    const leftWeek = bestSwap.left.weekNumber;
    const rightWeek = bestSwap.right.weekNumber;
    const leftWeight = unitWeight(bestSwap.left.unit);
    const rightWeight = unitWeight(bestSwap.right.unit);
    weightByWeek.set(
      leftWeek,
      (weightByWeek.get(leftWeek) ?? 0) - leftWeight + rightWeight
    );
    weightByWeek.set(
      rightWeek,
      (weightByWeek.get(rightWeek) ?? 0) - rightWeight + leftWeight
    );

    for (const [materialSetId, sourceWeek, destinationWeek] of [
      [bestSwap.left.unit.materialSetId, leftWeek, rightWeek],
      [bestSwap.right.unit.materialSetId, rightWeek, leftWeek]
    ] as const) {
      const sourceKey = materialWeekKey(materialSetId, sourceWeek);
      const destinationKey = materialWeekKey(materialSetId, destinationWeek);
      materialCountByWeek.set(sourceKey, (materialCountByWeek.get(sourceKey) ?? 0) - 1);
      materialCountByWeek.set(destinationKey, (materialCountByWeek.get(destinationKey) ?? 0) + 1);
    }
    bestSwap.left.weekNumber = rightWeek;
    bestSwap.right.weekNumber = leftWeek;
  }
}

function unitWeight(unit: DeterministicSchedulerUnit) {
  const minutes = Number.isFinite(unit.estimatedMinutes)
    ? Math.max(1, unit.estimatedMinutes)
    : 0;
  const pages = Number.isFinite(unit.pageCount) ? Math.max(1, unit.pageCount) : 1;
  // Estimated minutes are often a coarse workbook-wide default. Never let a
  // large page range masquerade as a normal lesson merely because it carries
  // the same default duration as a two-page unit.
  return Math.max(minutes, pages * 10);
}

function sortUnits(left: DeterministicSchedulerUnit, right: DeterministicSchedulerUnit) {
  return left.documentOrder - right.documentOrder ||
    left.sequenceOrder - right.sequenceOrder ||
    left.key.localeCompare(right.key);
}

function partitionOrderedUnits<T>(
  units: T[],
  bucketCount: number,
  weightFor: (unit: T) => number
) {
  if (bucketCount < 1 || units.length < bucketCount) {
    throw new Error("Cannot partition fewer learning units than schedule buckets.");
  }
  if (bucketCount === 1) return [units];

  const weights = units.map((unit) => Math.max(1, weightFor(unit)));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const buckets: T[][] = [];
  let unitIndex = 0;
  let consumedWeight = 0;

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const remainingBuckets = bucketCount - bucketIndex;
    if (remainingBuckets === 1) {
      buckets.push(units.slice(unitIndex));
      break;
    }

    const maxExclusiveEnd = units.length - (remainingBuckets - 1);
    const targetCumulativeWeight = totalWeight * (bucketIndex + 1) / bucketCount;
    let endIndex = unitIndex + 1;
    let candidateWeight = consumedWeight + weights[unitIndex]!;

    while (endIndex < maxExclusiveEnd) {
      const nextWeight = candidateWeight + weights[endIndex]!;
      if (
        Math.abs(nextWeight - targetCumulativeWeight) >
        Math.abs(candidateWeight - targetCumulativeWeight)
      ) break;
      candidateWeight = nextWeight;
      endIndex += 1;
    }

    buckets.push(units.slice(unitIndex, endIndex));
    consumedWeight = candidateWeight;
    unitIndex = endIndex;
  }

  return buckets;
}

function distributeUnitsAcrossWeeks(
  units: DeterministicSchedulerUnit[],
  weekNumbers: number[]
): Array<{ unit: DeterministicSchedulerUnit; weekNumber: number }> {
  if (units.length === 0) return [] as Array<{ unit: DeterministicSchedulerUnit; weekNumber: number }>;
  if (weekNumbers.length === 0) {
    throw new Error("There are not enough unstarted weeks for the remaining learning units.");
  }

  if (units.length >= weekNumbers.length) {
    const buckets = partitionOrderedUnits(units, weekNumbers.length, unitWeight);
    return buckets.flatMap((bucket, weekIndex) =>
      bucket.map((unit) => ({ unit, weekNumber: weekNumbers[weekIndex]! }))
    );
  }

  const lastDeferredIndex = units.reduce(
    (lastIndex, unit, index) => unit.progressPriority === "deferred" ? index : lastIndex,
    -1
  );
  if (lastDeferredIndex >= 0) {
    const priorityPrefix = units.slice(0, lastDeferredIndex + 1);
    const remainingUnits = units.slice(lastDeferredIndex + 1);
    const priorityWeekCount = Math.min(priorityPrefix.length, weekNumbers.length);
    const priorityAssignments = distributeUnitsAcrossWeeks(
      priorityPrefix.map((unit) => ({ ...unit, progressPriority: null })),
      weekNumbers.slice(0, priorityWeekCount)
    );
    if (remainingUnits.length === 0) return priorityAssignments;
    return [
      ...priorityAssignments,
      ...distributeUnitsAcrossWeeks(remainingUnits, weekNumbers.slice(priorityWeekCount))
    ];
  }

  if (units.length === 1) {
    return [{ unit: units[0]!, weekNumber: weekNumbers[Math.floor((weekNumbers.length - 1) / 2)]! }];
  }

  return units.map((unit, unitIndex) => ({
    unit,
    weekNumber: weekNumbers[Math.round(
      unitIndex * (weekNumbers.length - 1) / (units.length - 1)
    )]!
  }));
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

export function buildDeterministicPlanSchedule(input: {
  weekNumbers: number[];
  teachingDaysPerWeek: number | null;
  materials: DeterministicSchedulerMaterial[];
  units: DeterministicSchedulerUnit[];
  subjectPreferences?: DeterministicSchedulerSubjectPreference[];
}): DeterministicScheduleResult {
  const weekNumbers = Array.from(new Set(input.weekNumbers))
    .filter((weekNumber) => Number.isInteger(weekNumber) && weekNumber > 0)
    .sort((left, right) => left - right);
  if (weekNumbers.length !== input.weekNumbers.length) {
    throw new Error("Teaching week numbers must be unique positive integers.");
  }

  const materialById = new Map<string, DeterministicSchedulerMaterial>();
  for (const material of [...input.materials].sort((left, right) =>
    left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
  )) {
    if (!material.id || materialById.has(material.id)) {
      throw new Error("Every material must have a unique identifier.");
    }
    materialById.set(material.id, material);
  }

  const unitByKey = new Map<string, DeterministicSchedulerUnit>();
  for (const unit of input.units) {
    if (!unit.key || unitByKey.has(unit.key)) {
      throw new Error("Every learning unit must have a unique scheduler key.");
    }
    if (!materialById.has(unit.materialSetId)) {
      throw new Error(`Learning unit ${unit.key} refers to an unknown material.`);
    }
    unitByKey.set(unit.key, unit);
  }

  const childrenByMaterialId = new Map<string, string[]>();
  for (const material of materialById.values()) {
    if (!material.prerequisiteMaterialSetId) continue;
    if (!materialById.has(material.prerequisiteMaterialSetId)) {
      throw new Error(`Material ${material.id} refers to an unknown prerequisite.`);
    }
    childrenByMaterialId.set(material.prerequisiteMaterialSetId, [
      ...(childrenByMaterialId.get(material.prerequisiteMaterialSetId) ?? []),
      material.id
    ]);
  }
  for (const children of childrenByMaterialId.values()) {
    children.sort((leftId, rightId) => {
      const left = materialById.get(leftId)!;
      const right = materialById.get(rightId)!;
      return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
    });
  }

  const visitState = new Map<string, "visiting" | "visited">();
  const visit = (materialId: string) => {
    const state = visitState.get(materialId);
    if (state === "visiting") throw new Error("The material prerequisites contain a cycle.");
    if (state === "visited") return;
    visitState.set(materialId, "visiting");
    for (const childId of childrenByMaterialId.get(materialId) ?? []) visit(childId);
    visitState.set(materialId, "visited");
  };
  for (const materialId of materialById.keys()) visit(materialId);

  const unitsByMaterialId = new Map<string, DeterministicSchedulerUnit[]>();
  for (const unit of input.units) {
    unitsByMaterialId.set(unit.materialSetId, [
      ...(unitsByMaterialId.get(unit.materialSetId) ?? []),
      unit
    ]);
  }
  for (const units of unitsByMaterialId.values()) units.sort(sortUnits);

  const activeSubtree = new Map<string, boolean>();
  const subtreeIsActive = (materialId: string): boolean => {
    const cached = activeSubtree.get(materialId);
    if (cached != null) return cached;
    const active = (unitsByMaterialId.get(materialId)?.length ?? 0) > 0 ||
      (childrenByMaterialId.get(materialId) ?? []).some(subtreeIsActive);
    activeSubtree.set(materialId, active);
    return active;
  };
  const subtreeWeightCache = new Map<string, number>();
  const subtreeWeight = (materialId: string): number => {
    const cached = subtreeWeightCache.get(materialId);
    if (cached != null) return cached;
    const ownWeight = (unitsByMaterialId.get(materialId) ?? [])
      .reduce((total, unit) => total + unitWeight(unit), 0);
    const childWeight = Math.max(
      0,
      ...(childrenByMaterialId.get(materialId) ?? [])
        .filter(subtreeIsActive)
        .map(subtreeWeight)
    );
    const result = ownWeight + childWeight;
    subtreeWeightCache.set(materialId, result);
    return result;
  };
  const minimumWeeksCache = new Map<string, number>();
  const minimumWeeks = (materialId: string): number => {
    const cached = minimumWeeksCache.get(materialId);
    if (cached != null) return cached;
    const ownWeek = (unitsByMaterialId.get(materialId)?.length ?? 0) > 0 ? 1 : 0;
    const childWeeks = Math.max(
      0,
      ...(childrenByMaterialId.get(materialId) ?? [])
        .filter(subtreeIsActive)
        .map(minimumWeeks)
    );
    const result = ownWeek + childWeeks;
    minimumWeeksCache.set(materialId, result);
    return result;
  };

  const weekAssignments: WeekAssignment[] = [];
  const scheduleMaterial = (materialId: string, availableWeeks: number[]) => {
    if (!subtreeIsActive(materialId)) return;
    const ownUnits = unitsByMaterialId.get(materialId) ?? [];
    const activeChildren = (childrenByMaterialId.get(materialId) ?? []).filter(subtreeIsActive);

    if (ownUnits.length === 0) {
      for (const childId of activeChildren) scheduleMaterial(childId, availableWeeks);
      return;
    }

    if (availableWeeks.length < minimumWeeks(materialId)) {
      throw new Error(
        "There are not enough unstarted weeks to keep prerequisite materials in separate week ranges."
      );
    }

    let ownWeeks = availableWeeks;
    let descendantWeeks: number[] = [];
    if (activeChildren.length > 0) {
      const childMinimumWeeks = Math.max(...activeChildren.map(minimumWeeks));
      const ownWeight = ownUnits.reduce((total, unit) => total + unitWeight(unit), 0);
      const descendantWeight = Math.max(...activeChildren.map(subtreeWeight));
      const proportionalOwnWeeks = clampInteger(
        availableWeeks.length * ownWeight / Math.max(1, ownWeight + descendantWeight),
        1,
        availableWeeks.length - childMinimumWeeks
      );
      // A prerequisite with only a few units should not occupy empty weeks and
      // delay otherwise eligible follow-on material.
      const ownWeekCount = Math.min(ownUnits.length, proportionalOwnWeeks);
      ownWeeks = availableWeeks.slice(0, ownWeekCount);
      descendantWeeks = availableWeeks.slice(ownWeekCount);
    }

    for (const assignment of distributeUnitsAcrossWeeks(ownUnits, ownWeeks)) {
      weekAssignments.push({ ...assignment, dayNumber: null });
    }
    for (const childId of activeChildren) scheduleMaterial(childId, descendantWeeks);
  };

  const roots = Array.from(materialById.values())
    .filter((material) => !material.prerequisiteMaterialSetId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  for (const root of roots) scheduleMaterial(root.id, weekNumbers);

  if (weekAssignments.length !== input.units.length) {
    throw new Error("The deterministic scheduler did not assign every learning unit exactly once.");
  }

  // Independent subject sequences are initially spread across the same year.
  // Their rounded positions can occasionally align in a way that leaves one
  // week empty while a neighboring week contains several units. Fill those
  // holes deterministically without changing source order or crossing a
  // prerequisite boundary.
  fillEmptyTeachingWeeks({
    assignments: weekAssignments,
    weekNumbers,
    materialById,
    unitsByMaterialId,
    childrenByMaterialId
  });
  balanceTeachingWeekLoads({
    assignments: weekAssignments,
    weekNumbers,
    materialById,
    unitsByMaterialId,
    childrenByMaterialId
  });

  const teachingDaysPerWeek = input.teachingDaysPerWeek == null
    ? null
    : clampInteger(input.teachingDaysPerWeek, 1, 7);
  const preferenceBySubjectKey = new Map(
    (input.subjectPreferences ?? []).map((preference) => [preference.subjectKey, preference.daysPerWeek])
  );

  if (teachingDaysPerWeek) {
    for (const weekNumber of weekNumbers) {
      const assignments = weekAssignments.filter((assignment) => assignment.weekNumber === weekNumber);
      const dayLoads = Array.from({ length: teachingDaysPerWeek }, () => ({ minutes: 0, units: 0 }));
      const bySubject = new Map<string, WeekAssignment[]>();
      for (const assignment of assignments) {
        bySubject.set(assignment.unit.subjectKey, [
          ...(bySubject.get(assignment.unit.subjectKey) ?? []),
          assignment
        ]);
      }
      const subjectGroups = Array.from(bySubject.entries()).sort((left, right) => {
        const leftWeight = left[1].reduce((total, assignment) => total + unitWeight(assignment.unit), 0);
        const rightWeight = right[1].reduce((total, assignment) => total + unitWeight(assignment.unit), 0);
        return rightWeight - leftWeight || left[0].localeCompare(right[0]);
      });

      for (const [subjectKey, subjectAssignments] of subjectGroups) {
        subjectAssignments.sort((left, right) => sortUnits(left.unit, right.unit));
        const preferredDays = preferenceBySubjectKey.get(subjectKey);
        const distinctDayCount = Math.min(
          teachingDaysPerWeek,
          subjectAssignments.length,
          preferredDays == null
            ? subjectAssignments.length
            : clampInteger(preferredDays, 1, teachingDaysPerWeek)
        );
        const selectedDays = dayLoads
          .map((load, index) => ({ dayNumber: index + 1, ...load }))
          .sort((left, right) =>
            left.minutes - right.minutes || left.units - right.units || left.dayNumber - right.dayNumber
          )
          .slice(0, distinctDayCount)
          .map((day) => day.dayNumber)
          .sort((left, right) => left - right);
        const buckets = partitionOrderedUnits(
          subjectAssignments,
          selectedDays.length,
          (assignment) => unitWeight(assignment.unit)
        );
        buckets.forEach((bucket, bucketIndex) => {
          const dayNumber = selectedDays[bucketIndex]!;
          for (const assignment of bucket) {
            assignment.dayNumber = dayNumber;
            dayLoads[dayNumber - 1]!.minutes += unitWeight(assignment.unit);
            dayLoads[dayNumber - 1]!.units += 1;
          }
        });
      }
    }
  }

  const assignmentByKey = new Map(weekAssignments.map((assignment) => [assignment.unit.key, assignment]));
  const prerequisiteTransitions = Array.from(materialById.values()).flatMap((material) => {
    if (!material.prerequisiteMaterialSetId) return [];
    const prerequisiteWeeks = weekAssignments
      .filter((assignment) => assignment.unit.materialSetId === material.prerequisiteMaterialSetId)
      .map((assignment) => assignment.weekNumber);
    const dependentWeeks = weekAssignments
      .filter((assignment) => assignment.unit.materialSetId === material.id)
      .map((assignment) => assignment.weekNumber);
    if (prerequisiteWeeks.length === 0 || dependentWeeks.length === 0) return [];
    return [{
      prerequisiteMaterialSetId: material.prerequisiteMaterialSetId,
      dependentMaterialSetId: material.id,
      prerequisiteLastWeek: Math.max(...prerequisiteWeeks),
      dependentFirstWeek: Math.min(...dependentWeeks)
    }];
  });

  for (const transition of prerequisiteTransitions) {
    if (transition.dependentFirstWeek <= transition.prerequisiteLastWeek) {
      throw new Error("The deterministic scheduler violated a material prerequisite.");
    }
  }

  return {
    assignments: input.units.map((unit) => {
      const assignment = assignmentByKey.get(unit.key);
      if (!assignment) throw new Error(`Learning unit ${unit.key} was not assigned.`);
      return {
        unitKey: unit.key,
        weekNumber: assignment.weekNumber,
        dayNumber: assignment.dayNumber
      };
    }),
    diagnostics: {
      algorithmVersion: DETERMINISTIC_SCHEDULING_ALGORITHM_VERSION,
      materialCount: materialById.size,
      unitCount: input.units.length,
      weekCount: weekNumbers.length,
      prerequisiteTransitions
    }
  };
}
