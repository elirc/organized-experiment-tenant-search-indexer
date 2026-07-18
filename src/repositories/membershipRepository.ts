/**
 * This file loads the authenticated user's tenant membership for request-scoped auth.
 * It is called by `src/lib/auth/session.ts`.
 * It calls `src/db/client.ts` and `src/db/schema.ts`.
 * A junior engineer would likely check only user ID and forget that tenant membership must be verified per request.
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { memberships, tenants, users } from "@/db/schema";

export async function findSessionMembership(userId: string, tenantId: string) {
  const rows = await db
    .select({
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      platformRole: users.platformRole,
      tenantId: tenants.id,
      tenantName: tenants.name,
      membershipRole: memberships.role
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)))
    .limit(1);
  // ⚠️ SENIOR NOTE: This lookup joins through membership instead of trusting user + tenant independently, which prevents forged tenant headers from becoming access.

  return rows[0] ?? null;
}
