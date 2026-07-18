/**
 * This file persists indexing job orchestration and status transitions.
 * It is called by `src/services/indexingService.ts` and `src/services/indexingJobRunner.ts`.
 * It calls `src/db/client.ts` and `src/db/schema.ts`.
 * A junior engineer would likely track this in logs only, which makes recovery and observability much harder.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { DbExecutor } from "@/db/client";
import { db } from "@/db/client";
import { indexingJobs } from "@/db/schema";

type JobInsert = {
  tenantId: string;
  type: "INCREMENTAL" | "REBUILD";
  requestedByUserId: string;
  entityTypes: Array<"TICKET" | "DIRECTORY_USER">;
  generation?: number | null;
};

export async function enqueueIndexingJob(input: JobInsert, executor: DbExecutor = db) {
  const [job] = await executor.insert(indexingJobs).values(input).returning();
  return job;
}

export async function ensureQueuedIncrementalJob(
  tenantId: string,
  requestedByUserId: string,
  entityTypes: Array<"TICKET" | "DIRECTORY_USER">,
  executor: DbExecutor = db
) {
  // ⚠️ SENIOR NOTE: Coalescing incremental jobs is a write-complexity tradeoff that prevents a noisy tenant from creating one job per mutation.
  const existing = await executor
    .select()
    .from(indexingJobs)
    .where(
      and(
        // One queued/running incremental job per tenant keeps event processing coalesced.
        eq(indexingJobs.tenantId, tenantId),
        eq(indexingJobs.type, "INCREMENTAL"),
        inArray(indexingJobs.status, ["QUEUED", "RUNNING"])
      )
    )
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  return enqueueIndexingJob(
    {
      tenantId,
      type: "INCREMENTAL",
      requestedByUserId,
      entityTypes
    },
    executor
  );
}

export async function listQueuedIndexingJobs(limit: number, executor: DbExecutor = db) {
  return executor
    .select()
    .from(indexingJobs)
    .where(eq(indexingJobs.status, "QUEUED"))
    .orderBy(asc(indexingJobs.createdAt))
    .limit(limit);
}

export async function markIndexingJobRunning(jobId: string, executor: DbExecutor = db) {
  const [job] = await executor
    .update(indexingJobs)
    .set({
      status: "RUNNING",
      startedAt: new Date()
    })
    .where(eq(indexingJobs.id, jobId))
    .returning();

  return job ?? null;
}

export async function markIndexingJobCompleted(
  jobId: string,
  stats: Record<string, number | string | null>,
  executor: DbExecutor = db
) {
  await executor
    .update(indexingJobs)
    .set({
      status: "COMPLETED",
      completedAt: new Date(),
      stats
    })
    .where(eq(indexingJobs.id, jobId));
}

export async function markIndexingJobFailed(jobId: string, errorMessage: string, executor: DbExecutor = db) {
  await executor
    .update(indexingJobs)
    .set({
      status: "FAILED",
      completedAt: new Date(),
      errorMessage
    })
    .where(eq(indexingJobs.id, jobId));
}

export async function listRecentIndexingJobsForTenant(tenantId: string, executor: DbExecutor = db) {
  return executor
    .select()
    .from(indexingJobs)
    .where(
      // Job history is sensitive operational data and remains tenant-scoped.
      eq(indexingJobs.tenantId, tenantId)
    )
    .orderBy(desc(indexingJobs.createdAt))
    .limit(20);
}
