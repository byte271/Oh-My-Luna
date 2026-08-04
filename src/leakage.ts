import type { DatasetSplit, SplitPolicy, TaskManifestRecord } from "./types.js";

export interface LeakageFinding {
  code: string;
  task_ids: string[];
  detail: string;
}

const NORMALIZED_HEX = /^[a-f0-9]{7,64}$/;

export function findDatasetLeakage(records: TaskManifestRecord[], policy: SplitPolicy): LeakageFinding[] {
  const findings: LeakageFinding[] = [];
  const repos = new Map<string, Map<DatasetSplit, string[]>>();
  const organizations = new Map<string, Map<DatasetSplit, string[]>>();

  for (const record of records) {
    const repoKey = `${record.repository.organization}/${record.repository.name}`.toLowerCase();
    addSplit(repos, repoKey, record.split, record.id);
    addSplit(organizations, record.repository.organization.toLowerCase(), record.split, record.id);

    if (record.repository.base_commit === record.repository.fixed_commit) {
      findings.push({ code: "OML_LEAK_IDENTICAL_COMMITS", task_ids: [record.id], detail: "Base and fixed commits are identical" });
    }
    const fixed = record.repository.fixed_commit.toLowerCase();
    if (NORMALIZED_HEX.test(fixed) && record.task_statement.toLowerCase().includes(fixed.slice(0, 7))) {
      findings.push({ code: "OML_LEAK_FIX_COMMIT_IN_TASK", task_ids: [record.id], detail: "Task statement exposes the fixed commit" });
    }
    const visible = new Set(record.boundaries.agent_visible_paths.map(normalizePath));
    const overlap = record.boundaries.hidden_paths.map(normalizePath).filter((path) => visible.has(path));
    if (overlap.length > 0) {
      findings.push({ code: "OML_LEAK_HIDDEN_PATH_VISIBLE", task_ids: [record.id], detail: `Hidden paths are agent-visible: ${overlap.join(", ")}` });
    }
  }

  if (policy.repository_disjoint) appendCrossSplit(findings, repos, "OML_LEAK_REPOSITORY_CROSS_SPLIT");
  if (policy.organization_disjoint) appendCrossSplit(findings, organizations, "OML_LEAK_ORGANIZATION_CROSS_SPLIT");
  return findings;
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}

function addSplit(target: Map<string, Map<DatasetSplit, string[]>>, key: string, split: DatasetSplit, id: string): void {
  const bySplit = target.get(key) ?? new Map<DatasetSplit, string[]>();
  bySplit.set(split, [...(bySplit.get(split) ?? []), id]);
  target.set(key, bySplit);
}

function appendCrossSplit(findings: LeakageFinding[], groups: Map<string, Map<DatasetSplit, string[]>>, code: string): void {
  for (const [key, bySplit] of groups) {
    if (bySplit.size < 2) continue;
    findings.push({
      code,
      task_ids: [...bySplit.values()].flat().sort(),
      detail: `${key} occurs in splits: ${[...bySplit.keys()].sort().join(", ")}`
    });
  }
}
