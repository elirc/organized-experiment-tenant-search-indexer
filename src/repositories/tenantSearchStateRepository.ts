/**
 * This file tracks index freshness and active rebuild generations per tenant.
 * It is called by `src/services/indexingService.ts` and `src/services/searchService.ts`.
 * It calls `src/db/client.ts` and `src/db/schema.ts`.
 * A junior engineer would likely keep this state in memory and lose correctness across processes.
 */
import { and, count, eq, isNull } from "drizzle-orm";

import type { DbExecutor } from "@/db/client";
import { db } from "@/db/client";
import { searchSyncEvents, tenantSearchStates } from "@/db/schema";

export async function ensureTenantSearchState(tenantId: string, executor: DbExecutor = db) {
  await executor
    .insert(tenantSearchStates)
    .values({
      tenantId
    })
    .onConflictDoNothing();
}

export async function getTenantSearchState(tenantId: string, executor: DbExecutor = db) {
  await ensureTenantSearchState(tenantId, executor);

  const [state] = await executor
    .select()
    .from(tenantSearchStates)
    .where(
      // Search health is tracked independently per tenant.
      eq(tenantSearchStates.tenantId, tenantId)
    )
    .limit(1);

  return state!;
}

export async function touchTenantSourceChange(tenantId: string, executor: DbExecutor = db) {
  await ensureTenantSearchState(tenantId, executor);

  await executor
    .update(tenantSearchStates)
    .set({
      lastSourceChangeAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(tenantSearchStates.tenantId, tenantId));
}

export async function recordIncrementalIndexProgress(
  tenantId: string,
  lastProcessedEventId: number,
  executor: DbExecutor = db
) {
  await ensureTenantSearchState(tenantId, executor);

  await executor
    .update(tenantSearchStates)
    .set({
      lastProcessedEventId,
      lastIndexedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(tenantSearchStates.tenantId, tenantId));
}

export async function startTenantRebuild(tenantId: string, executor: DbExecutor = db) {
  const state = await getTenantSearchState(tenantId, executor);
  const nextGeneration = state.activeGeneration + 1;

  // ⚠️ SENIOR NOTE: Generation numbers are derived from durable state, not memory, so parallel processes cannot drift apart after restarts.
  await executor
    .update(tenantSearchStates)
    .set({
      rebuildingGeneration: nextGeneration,
      updatedAt: new Date()
    })
    .where(eq(tenantSearchStates.tenantId, tenantId));

  return nextGeneration;
}

export async function completeTenantRebuild(tenantId: string, nextGeneration: number, executor: DbExecutor = db) {
  await executor
    .update(tenantSearchStates)
    .set({
      activeGeneration: nextGeneration,
      rebuildingGeneration: null,
      lastIndexedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(tenantSearchStates.tenantId, tenantId));
}

export async function estimatePendingEventCount(tenantId: string, executor: DbExecutor = db) {
  const [{ pendingCount }] = await executor
    .select({
      pendingCount: count()
    })
    .from(searchSyncEvents)
    .where(
      and(
        // Pending-event visibility must stay tenant-scoped or operators will see another tenant's lag metrics.
        eq(searchSyncEvents.tenantId, tenantId),
        isNull(searchSyncEvents.processedAt)
      )
    );

  return pendingCount;
}
