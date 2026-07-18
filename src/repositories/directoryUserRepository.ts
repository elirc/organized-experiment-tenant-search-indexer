/**
 * This file owns persistence for searchable directory user records.
 * It is called by `src/services/directoryUserService.ts` and `src/services/indexingService.ts`.
 * It calls `src/db/client.ts` and `src/db/schema.ts`.
 * A junior engineer would likely treat this as "reference data" and forget it still needs tenant isolation.
 */
import { count, desc, eq } from "drizzle-orm";

import type { DbExecutor } from "@/db/client";
import { db } from "@/db/client";
import { directoryUsers } from "@/db/schema";

type DirectoryUserInsert = {
  tenantId: string;
  email: string;
  displayName: string;
  department?: string | null;
  title?: string | null;
  notes: string;
};

export async function createDirectoryUserRecord(input: DirectoryUserInsert, executor: DbExecutor = db) {
  const [directoryUser] = await executor.insert(directoryUsers).values(input).returning();
  return directoryUser;
}

export async function listDirectoryUserSnapshotForTenant(tenantId: string, executor: DbExecutor = db) {
  return executor
    .select()
    .from(directoryUsers)
    .where(
      // Directory users belong to a single tenant and are indexed separately per tenant generation.
      eq(directoryUsers.tenantId, tenantId)
    )
    .orderBy(desc(directoryUsers.updatedAt));
}

export async function listDirectoryUsersByTenant(
  tenantId: string,
  pagination: { page: number; pageSize: number },
  executor: DbExecutor = db
) {
  // ⚠️ SENIOR NOTE: Pagination is enforced in the repository to keep expensive full-tenant reads from creeping back in through new callers.
  const items = await executor
    .select()
    .from(directoryUsers)
    .where(
      // Tenant filter is required because directory users are customer-owned records.
      eq(directoryUsers.tenantId, tenantId)
    )
    .orderBy(desc(directoryUsers.updatedAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);

  const [{ total }] = await executor
    .select({ total: count() })
    .from(directoryUsers)
    .where(eq(directoryUsers.tenantId, tenantId));

  return {
    items,
    total
  };
}
