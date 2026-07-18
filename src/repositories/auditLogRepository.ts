/**
 * This file stores audit entries for security-sensitive state changes.
 * It is called by the service layer after successful mutations.
 * It calls `src/db/client.ts` and `src/db/schema.ts`.
 * A junior engineer would likely skip audit trails until after an incident, when the missing history is already a problem.
 */
import type { DbExecutor } from "@/db/client";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";

export async function createAuditLog(
  input: {
    tenantId: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
  executor: DbExecutor = db
) {
  // ⚠️ SENIOR NOTE: Audit writes happen after successful permission-checked mutations so the log reflects committed state, not failed attempts.
  const [log] = await executor
    .insert(auditLogs)
    .values({
      ...input,
      metadata: input.metadata ?? {}
    })
    .returning();

  return log;
}
