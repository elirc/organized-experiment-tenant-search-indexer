/**
 * This file stores and retrieves the outbox-style change events that drive eventual indexing.
 * Source-domain services call it after writes, and the indexing runner consumes pending events from it.
 * It calls `src/db/client.ts` and `src/db/schema.ts`.
 * A junior engineer would likely skip the event table and later discover they cannot detect deletes or lag accurately.
 */
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";

import type { DbExecutor } from "@/db/client";
import { db } from "@/db/client";
import { searchSyncEvents } from "@/db/schema";

type SearchSyncEventInsert = {
  tenantId: string;
  entityType: "TICKET" | "DIRECTORY_USER";
  entityId: string;
  operation: "UPSERT" | "DELETE";
  sourceVersion: number;
  payload: Record<string, unknown>;
};

export async function enqueueSearchSyncEvent(input: SearchSyncEventInsert, executor: DbExecutor = db) {
  const [event] = await executor.insert(searchSyncEvents).values(input).returning();
  return event;
}

export async function listPendingSearchSyncEvents(
  tenantId: string,
  lastProcessedEventId: number | null,
  limit: number,
  executor: DbExecutor = db
) {
  const conditions = [
    // Pending events are consumed strictly within one tenant boundary.
    eq(searchSyncEvents.tenantId, tenantId),
    isNull(searchSyncEvents.processedAt),
    lastProcessedEventId ? gt(searchSyncEvents.id, lastProcessedEventId) : undefined
  ].filter(Boolean);

  return executor
    .select()
    .from(searchSyncEvents)
    .where(and(...conditions))
    .orderBy(asc(searchSyncEvents.id))
    .limit(limit);
}

export async function markSearchSyncEventsProcessed(eventIds: number[], executor: DbExecutor = db) {
  if (eventIds.length === 0) {
    return;
  }

  // ⚠️ SENIOR NOTE: Batch-marking processed events matters because partial acknowledgements can strand the cursor and force duplicate indexing work.
  await executor
    .update(searchSyncEvents)
    .set({
      processedAt: new Date()
    })
    .where(
      inArray(searchSyncEvents.id, eventIds)
    );
}
