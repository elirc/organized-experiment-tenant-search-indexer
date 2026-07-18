/**
 * This file owns directory user business logic and indexing/audit side effects.
 * It is called by `src/app/api/directory-users/route.ts` and by the indexing rebuild workflow.
 * It calls repository modules, permission guards, and search document builders.
 * A junior engineer would likely forget that reference data writes need the same audit and indexing guarantees as tickets.
 */
import type { z } from "zod";

import { db } from "@/db/client";
import { requirePermission } from "@/lib/permissions/roles";
import { buildDirectoryUserSearchDocument } from "@/lib/search/document-builder";
import { createDirectoryUserSchema } from "@/lib/validation/directoryUserSchemas";
import { createAuditLog } from "@/repositories/auditLogRepository";
import { listDirectoryUsersByTenant, createDirectoryUserRecord, listDirectoryUserSnapshotForTenant } from "@/repositories/directoryUserRepository";
import { ensureQueuedIncrementalJob } from "@/repositories/indexingJobRepository";
import { enqueueSearchSyncEvent } from "@/repositories/searchSyncEventRepository";
import { touchTenantSourceChange } from "@/repositories/tenantSearchStateRepository";
import type { RequestContext } from "@/types/auth";

type CreateDirectoryUserInput = z.infer<typeof createDirectoryUserSchema>;

export async function createDirectoryUser(context: RequestContext, input: CreateDirectoryUserInput) {
  requirePermission(context, "directory-user:create");

  return db.transaction(async (tx) => {
    // ⚠️ SENIOR NOTE: This mirrors ticket write orchestration so both indexed entity types obey the same consistency contract.
    const directoryUser = await createDirectoryUserRecord(
      {
        tenantId: context.session.tenantId,
        email: input.email,
        displayName: input.displayName,
        department: input.department ?? null,
        title: input.title ?? null,
        notes: input.notes
      },
      tx
    );

    const searchDocument = buildDirectoryUserSearchDocument(directoryUser);

    await enqueueSearchSyncEvent(
      {
        tenantId: directoryUser.tenantId,
        entityType: "DIRECTORY_USER",
        entityId: directoryUser.id,
        operation: "UPSERT",
        sourceVersion: searchDocument.sourceVersion,
        payload: searchDocument
      },
      tx
    );

    await touchTenantSourceChange(directoryUser.tenantId, tx);
    await ensureQueuedIncrementalJob(directoryUser.tenantId, context.session.userId, ["DIRECTORY_USER"], tx);

    await createAuditLog(
      {
        tenantId: directoryUser.tenantId,
        actorUserId: context.session.userId,
        action: "directory_user.created",
        entityType: "DIRECTORY_USER",
        entityId: directoryUser.id,
        metadata: {
          email: directoryUser.email
        }
      },
      tx
    );

    return directoryUser;
  });
}

export async function listDirectoryUsers(
  context: RequestContext,
  pagination: {
    page: number;
    pageSize: number;
  }
) {
  requirePermission(context, "directory-user:read");

  // ⚠️ SENIOR NOTE: Even "simple reference data" gets a service boundary so later business rules do not have to invade route handlers.
  const result = await listDirectoryUsersByTenant(context.session.tenantId, pagination);

  return {
    ...result,
    ...pagination
  };
}

export async function listDirectoryUserSearchSnapshot(tenantId: string) {
  // ⚠️ SENIOR NOTE: Snapshot helpers intentionally return raw source rows because rebuild serialization belongs in the document builder.
  return listDirectoryUserSnapshotForTenant(tenantId);
}
