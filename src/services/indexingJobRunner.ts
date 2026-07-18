/**
 * This file executes queued indexing jobs and applies changes to the denormalized index.
 * It is called by `src/app/api/indexing-jobs/run-pending/route.ts`.
 * It calls job repositories, search state repositories, source snapshot readers, and search document upserts.
 * A junior engineer would likely mix incremental and rebuild behavior into one opaque function that is hard to reason about during failures.
 */
import type { z } from "zod";

import { db } from "@/db/client";
import { requirePermission } from "@/lib/permissions/roles";
import { buildDirectoryUserSearchDocument, buildTicketSearchDocument } from "@/lib/search/document-builder";
import { runPendingJobsSchema } from "@/lib/validation/indexingSchemas";
import { listDirectoryUserSearchSnapshot } from "@/services/directoryUserService";
import { listTicketSearchSnapshot } from "@/services/ticketService";
import {
  listQueuedIndexingJobs,
  markIndexingJobCompleted,
  markIndexingJobFailed,
  markIndexingJobRunning
} from "@/repositories/indexingJobRepository";
import { upsertSearchDocuments, deleteGenerationDocuments } from "@/repositories/searchDocumentRepository";
import { listPendingSearchSyncEvents, markSearchSyncEventsProcessed } from "@/repositories/searchSyncEventRepository";
import {
  completeTenantRebuild,
  getTenantSearchState,
  recordIncrementalIndexProgress
} from "@/repositories/tenantSearchStateRepository";
import type { RequestContext } from "@/types/auth";

type RunPendingJobsInput = z.infer<typeof runPendingJobsSchema>;

export async function runPendingIndexingJobs(context: RequestContext, input: RunPendingJobsInput) {
  requirePermission(context, "indexing-job:run");

  const jobs = await listQueuedIndexingJobs(input.limit);
  const results: Array<{ jobId: string; status: string }> = [];

  // ⚠️ SENIOR NOTE: The runner marks each job running before work begins so a second worker can see in-flight ownership and avoid duplicate execution.
  for (const job of jobs) {
    await markIndexingJobRunning(job.id);

    try {
      if (job.type === "INCREMENTAL") {
        await runIncrementalJob(job.tenantId);
      } else {
        await runRebuildJob(job.tenantId, job.generation!, job.entityTypes);
      }

      await markIndexingJobCompleted(job.id, {
        type: job.type,
        entityTypes: job.entityTypes.join(",")
      });

      results.push({ jobId: job.id, status: "COMPLETED" });
    } catch (error) {
      await markIndexingJobFailed(job.id, error instanceof Error ? error.message : "Unknown indexing error");
      results.push({ jobId: job.id, status: "FAILED" });
    }
  }

  return {
    processed: results.length,
    results
  };
}

async function runIncrementalJob(tenantId: string) {
  const state = await getTenantSearchState(tenantId);
  const events = await listPendingSearchSyncEvents(tenantId, state.lastProcessedEventId ?? null, 200);

  if (events.length === 0) {
    return;
  }

  const documents = events.map((event) => ({
    ...(event.payload as {
      tenantId: string;
      entityType: "TICKET" | "DIRECTORY_USER";
      entityId: string;
      title: string;
      body: string;
      filters: Record<string, string | string[] | null>;
      sortUpdatedAt: Date;
      sourceVersion: number;
    }),
    generation: state.activeGeneration,
    isDeleted: event.operation === "DELETE"
  }));

  // ⚠️ SENIOR NOTE: Incremental writes must target the active generation only; writing into a rebuild generation would make the flip non-deterministic.
  await upsertSearchDocuments(documents);
  await markSearchSyncEventsProcessed(
    events.map((event) => event.id)
  );
  await recordIncrementalIndexProgress(tenantId, events[events.length - 1].id);
}

async function runRebuildJob(
  tenantId: string,
  nextGeneration: number,
  entityTypes: Array<"TICKET" | "DIRECTORY_USER">
) {
  const stateBeforeFlip = await getTenantSearchState(tenantId);

  if (entityTypes.includes("TICKET")) {
    const tickets = await listTicketSearchSnapshot(tenantId);
    await upsertSearchDocuments(
      tickets.map((ticket) => ({
        ...buildTicketSearchDocument(ticket),
        generation: nextGeneration
      }))
    );
  }

  if (entityTypes.includes("DIRECTORY_USER")) {
    const directoryUsers = await listDirectoryUserSearchSnapshot(tenantId);
    await upsertSearchDocuments(
      directoryUsers.map((directoryUser) => ({
        ...buildDirectoryUserSearchDocument(directoryUser),
        generation: nextGeneration
      }))
    );
  }

  await db.transaction(async (tx) => {
    // ⚠️ SENIOR NOTE: The generation flip and old-generation cleanup share one transaction so readers never observe a half-cutover state.
    await completeTenantRebuild(tenantId, nextGeneration, tx);
    await deleteGenerationDocuments(tenantId, stateBeforeFlip.activeGeneration, tx);
  });
}
