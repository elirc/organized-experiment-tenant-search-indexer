/**
 * This file owns administrative indexing workflows such as rebuild requests and job listing.
 * It is called by `src/app/api/indexing-jobs/rebuild/route.ts` and `src/app/api/indexing-jobs/route.ts`.
 * It calls permission guards, job repositories, tenant search state, and audit logging.
 * A junior engineer would likely kick off a rebuild directly from the route and lose a durable trail of who requested it.
 */
import type { z } from "zod";

import { db } from "@/db/client";
import { ConflictError } from "@/lib/http/errors";
import { requirePermission } from "@/lib/permissions/roles";
import { rebuildIndexSchema } from "@/lib/validation/indexingSchemas";
import { createAuditLog } from "@/repositories/auditLogRepository";
import { enqueueIndexingJob, listRecentIndexingJobsForTenant } from "@/repositories/indexingJobRepository";
import { getTenantSearchState, startTenantRebuild } from "@/repositories/tenantSearchStateRepository";
import type { RequestContext } from "@/types/auth";

type RebuildInput = z.infer<typeof rebuildIndexSchema>;

export async function requestIndexRebuild(context: RequestContext, input: RebuildInput) {
  requirePermission(context, "indexing-job:rebuild");

  return db.transaction(async (tx) => {
    const state = await getTenantSearchState(context.session.tenantId, tx);

    if (state.rebuildingGeneration) {
      throw new ConflictError("A rebuild is already in progress for this tenant.", {
        rebuildingGeneration: state.rebuildingGeneration
      });
    }

    // ⚠️ SENIOR NOTE: Rebuild requests are persisted as jobs instead of executed inline so retries, audits, and observability all have durable records.
    const nextGeneration = await startTenantRebuild(context.session.tenantId, tx);

    const job = await enqueueIndexingJob(
      {
        tenantId: context.session.tenantId,
        type: "REBUILD",
        requestedByUserId: context.session.userId,
        entityTypes: input.entityTypes,
        generation: nextGeneration
      },
      tx
    );

    await createAuditLog(
      {
        tenantId: context.session.tenantId,
        actorUserId: context.session.userId,
        action: "index.rebuild_requested",
        entityType: "INDEXING_JOB",
        entityId: job.id,
        metadata: {
          entityTypes: input.entityTypes,
          generation: nextGeneration
        }
      },
      tx
    );

    return job;
  });
}

export async function listIndexingJobs(context: RequestContext) {
  requirePermission(context, "indexing-job:read");
  // ⚠️ SENIOR NOTE: Operational reads are permissioned too because job history can reveal tenant activity patterns and internal failures.
  return listRecentIndexingJobsForTenant(context.session.tenantId);
}
