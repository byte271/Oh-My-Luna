import { createHash } from "node:crypto";
import type { ExperimentAssignment, ExperimentPlan } from "./types.js";

export function buildRandomizedSchedule(plan: ExperimentPlan): ExperimentAssignment[] {
  const assignments: ExperimentAssignment[] = [];
  for (const taskId of plan.task_ids) {
    for (const treatmentId of plan.treatments) {
      for (let repetition = 1; repetition <= plan.controls.repetitions; repetition += 1) {
        const identity = `${plan.id}\0${taskId}\0${treatmentId}\0${repetition}`;
        assignments.push({
          assignment_id: createHash("sha256").update(identity).digest("hex"),
          task_id: taskId,
          treatment_id: treatmentId,
          repetition
        });
      }
    }
  }
  const random = mulberry32(plan.controls.randomization_seed >>> 0);
  for (let index = assignments.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [assignments[index], assignments[swap]] = [assignments[swap]!, assignments[index]!];
  }
  return assignments;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
