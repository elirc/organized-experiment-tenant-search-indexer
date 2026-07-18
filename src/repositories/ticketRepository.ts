/**
 * This file owns persistence for ticket source-of-truth records.
 * It is called by `src/services/ticketService.ts` and `src/services/indexingService.ts`.
 * It calls `src/db/client.ts` and the table definitions in `src/db/schema.ts`.
 * A junior engineer would likely forget to scope every query by tenant ID and create a cross-tenant leak.
 */
import { and, count, desc, eq } from "drizzle-orm";

import type { DbExecutor } from "@/db/client";
import { db } from "@/db/client";
import { tickets } from "@/db/schema";

type TicketInsert = {
  tenantId: string;
  externalId: string;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assigneeUserId?: string | null;
  createdByUserId: string;
};

export async function createTicketRecord(input: TicketInsert, executor: DbExecutor = db) {
  const [ticket] = await executor.insert(tickets).values(input).returning();
  return ticket;
}

export async function findTicketById(ticketId: string, tenantId: string, executor: DbExecutor = db) {
  const [ticket] = await executor
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.id, ticketId),
        // Tenant scoping lives in the repository so service authors cannot forget it.
        eq(tickets.tenantId, tenantId)
      )
    )
    .limit(1);

  return ticket ?? null;
}

export async function listTicketsByTenant(
  tenantId: string,
  filters: {
    status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    page: number;
    pageSize: number;
  },
  executor: DbExecutor = db
) {
  const conditions = [
    // Tenant filter is mandatory because tickets are organization-owned data.
    eq(tickets.tenantId, tenantId),
    filters.status ? eq(tickets.status, filters.status) : undefined,
    filters.priority ? eq(tickets.priority, filters.priority) : undefined
  ].filter(Boolean);

  const items = await executor
    .select()
    .from(tickets)
    .where(and(...conditions))
    .orderBy(desc(tickets.updatedAt))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const [{ total }] = await executor
    .select({ total: count() })
    .from(tickets)
    .where(and(...conditions));

  return {
    items,
    total
  };
}

export async function updateTicketStatusRecord(
  ticketId: string,
  tenantId: string,
  nextStatus: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED",
  executor: DbExecutor = db
) {
  // ⚠️ SENIOR NOTE: The repository never enforces workflow legality; that rule stays in the service layer so reads and writes share one business boundary.
  const [ticket] = await executor
    .update(tickets)
    .set({
      status: nextStatus,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(tickets.id, ticketId),
        // Tenant filter prevents a caller from mutating another organization's ticket by guessing an ID.
        eq(tickets.tenantId, tenantId)
      )
    )
    .returning();

  return ticket ?? null;
}

export async function listTicketSnapshotForTenant(tenantId: string, executor: DbExecutor = db) {
  // ⚠️ SENIOR NOTE: Rebuild snapshots read from the source table rather than the existing index so corrupted index rows cannot self-replicate forever.
  return executor
    .select()
    .from(tickets)
    .where(
      // Rebuilds must read only one tenant's source data into one tenant generation.
      eq(tickets.tenantId, tenantId)
    )
    .orderBy(desc(tickets.updatedAt));
}
