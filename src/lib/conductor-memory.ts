/**
 * Turning a conductor run into memory.
 *
 * WHY THIS DOES NOT DISTIL TRANSCRIPTS.
 *
 * The obvious design — capture the agent's session log and have a model write up
 * what happened — is the one the Synaptic Wiki work already tried and moved
 * away from. Its conclusion, from the creative-session harness: *"the spec IS a
 * first-class Wiki DesignRunRecord (better than the after-the-fact Gemini
 * distill)"*. The structured artifact the system already produced beats a
 * summary of the prose that produced it: no extra model call, no hallucinated
 * summary, no cost, and it is exact.
 *
 * DevPilot has an unusually good version of that artifact. A wave plan IS the
 * decomposition decision, and the execution results ARE the verdict on it. So a
 * run record is assembled from things already known for certain — wave shape,
 * parallelism, what each task cost, which files it touched, what failed — and
 * never from the transcript.
 *
 * That also dissolves the TRD-06 privacy problem rather than negotiating with
 * it. Transcripts are end-to-end encrypted and the server cannot read them; a
 * record built from plan structure and execution metadata never needed them.
 *
 * The second lesson from that work is the failure it names outright: *"Synaptic
 * Wiki is learned but never applied back into the brief."* Writing memory is
 * half a loop. `conductor-recall.ts` is the other half, and it is wired in the
 * same change — memory that is never read is a database, not a memory.
 */

import { mempalace } from '@devpilot.sh/core';
import { db, wavePlans, waveTasks, rufloSessions, horizonItems, eq } from '@/lib/db';

// `export * as mempalace` gives a value namespace, so types are reached via
// `typeof` on the constructor rather than as a type namespace.
type MemPalaceConfig = ConstructorParameters<typeof mempalace.MemPalaceService>[0];

/** One repo gets one wing; runs land in a `runs` room. */
export function wingSlugForRepo(repo: string): string {
  return repo.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}

/**
 * `local` by default: a self-hoster gets a working memory with no configuration
 * and no network. `mcp` points at a hosted endpoint; `disabled` turns the whole
 * loop off. This one value is the open-core seam — see TRD-15.
 */
export function memoryConfigFromEnv(): MemPalaceConfig {
  const mode = (process.env.DEVPILOT_MEMORY_MODE ?? 'local') as MemPalaceConfig['mode'];
  return {
    mode,
    // Per-repo wings are set per call; this is only the fallback.
    defaultWingSlug: process.env.DEVPILOT_MEMORY_WING ?? 'devpilot',
    mcpEndpoint: process.env.DEVPILOT_MEMORY_ENDPOINT,
  };
}

export interface RunRecord {
  wavePlanId: string;
  repo: string;
  itemTitle: string;
  totalWaves: number;
  totalTasks: number;
  /** Widest wave — the parallelism the plan actually achieved. */
  maxParallelism: number;
  succeeded: number;
  failed: number;
  costUsd: number;
  durationMinutes: number;
  /** Files more than one task touched — the contention the planner missed. */
  contendedFiles: string[];
  failures: { taskCode: string; label: string; error: string }[];
}

/**
 * Assemble the record from the database. Every field is observed, not inferred:
 * this runs after the fact against rows the execution path already wrote.
 */
export async function buildRunRecord(wavePlanId: string): Promise<RunRecord | null> {
  const plan = await db.query.wavePlans.findFirst({ where: eq(wavePlans.id, wavePlanId) });
  if (!plan) return null;

  const tasks = await db.query.waveTasks.findMany({
    where: eq(waveTasks.wavePlanId, wavePlanId),
  });
  if (tasks.length === 0) return null;

  const item = plan.horizonItemId
    ? await db.query.horizonItems.findFirst({ where: eq(horizonItems.id, plan.horizonItemId) })
    : null;

  // Widest wave = achieved parallelism. The planner's *predicted* max is stored
  // on the plan; this is what actually ran, and the gap between them is the
  // single most useful thing a future plan can learn.
  const perWave = new Map<number, number>();
  for (const t of tasks) perWave.set(t.waveIndex, (perWave.get(t.waveIndex) ?? 0) + 1);
  const maxParallelism = Math.max(...perWave.values());

  const sessionIds = tasks.map((t) => t.assignedSessionId).filter(Boolean) as string[];
  let costUsd = 0;
  let durationMinutes = 0;
  for (const id of sessionIds) {
    const s = await db.query.rufloSessions.findFirst({ where: eq(rufloSessions.id, id) });
    if (!s) continue;
    costUsd += (s.costUsd ?? 0) / 100;
    durationMinutes += s.elapsedMinutes ?? 0;
  }

  // Contention: a file two tasks both touched means the decomposition split
  // work that was not actually independent.
  const fileCount = new Map<string, number>();
  for (const t of tasks) {
    for (const f of (t.filePaths as string[] | null) ?? []) {
      fileCount.set(f, (fileCount.get(f) ?? 0) + 1);
    }
  }

  return {
    wavePlanId,
    repo: item?.repo ?? 'unknown',
    itemTitle: item?.title ?? 'Untitled run',
    totalWaves: plan.totalWaves,
    totalTasks: tasks.length,
    maxParallelism,
    succeeded: tasks.filter((t) => t.status === 'completed').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
    costUsd,
    durationMinutes,
    contendedFiles: [...fileCount.entries()].filter(([, n]) => n > 1).map(([f]) => f),
    failures: tasks
      .filter((t) => t.status === 'failed')
      .map((t) => ({ taskCode: t.taskCode, label: t.label, error: t.errorMessage ?? 'unknown' })),
  };
}

/** Render the record as the prose a future planner will actually read. */
export function renderRunRecord(r: RunRecord): string {
  const lines: string[] = [];
  lines.push(`Plan "${r.itemTitle}" in ${r.repo}: ${r.totalTasks} tasks across ${r.totalWaves} waves.`);
  lines.push(
    `Achieved parallelism ${r.maxParallelism}. ${r.succeeded} succeeded, ${r.failed} failed.`
  );
  lines.push(`Cost $${r.costUsd.toFixed(2)} over ${r.durationMinutes.toFixed(1)} agent-minutes.`);

  if (r.contendedFiles.length > 0) {
    lines.push(
      `CONTENTION: ${r.contendedFiles.join(', ')} appeared in more than one task in the same plan — ` +
        `these were not independent and should be sequenced, not parallelised.`
    );
  }
  for (const f of r.failures) {
    lines.push(`FAILED ${f.taskCode} (${f.label}): ${f.error}`);
  }
  return lines.join('\n');
}

/**
 * Write the record into MemPalace. Best-effort by design: memory is an
 * improvement to future plans, never a gate on the current one, so a memory
 * failure must not surface as a run failure.
 */
export async function recordRun(wavePlanId: string): Promise<{ recorded: boolean; reason?: string }> {
  try {
    const config = memoryConfigFromEnv();
    if (config.mode === 'disabled') return { recorded: false, reason: 'memory disabled' };

    const record = await buildRunRecord(wavePlanId);
    if (!record) return { recorded: false, reason: 'no such wave plan' };

    const palace = new mempalace.MemPalaceService(config);
    await palace.addDrawer({
      wingSlug: wingSlugForRepo(record.repo),
      roomSlug: 'runs',
      roomName: 'Wave plan runs',
      roomTopic: 'How past decompositions actually executed',
      memoryType: 'fact',
      label: `${record.itemTitle} (${record.totalWaves}w/${record.totalTasks}t)`,
      content: renderRunRecord(record),
      tags: [
        'wave-plan',
        record.failed > 0 ? 'had-failures' : 'clean',
        ...(record.contendedFiles.length > 0 ? ['file-contention'] : []),
      ],
      // A run that failed or contended teaches more than one that went fine.
      salience: record.failed > 0 || record.contendedFiles.length > 0 ? 0.9 : 0.5,
    });

    return { recorded: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('Run record failed (non-fatal):', reason);
    return { recorded: false, reason };
  }
}
