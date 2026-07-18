/**
 * This file owns ticket business logic, write orchestration, and audit/index side effects.
 * It is called by `src/app/api/tickets/route.ts` and `src/app/api/tickets/[ticketId]/status/route.ts`.
 * It calls ticket repositories, audit logging, permission guards, and the search sync event repository.
 * A junior engineer would likely put these steps in the route and miss the transaction boundary on later edits.
 */
import type { z } from "zod";

import { db } from "@/db/client";
import type { TicketStatus } from "@/db/schema";
import { ConflictError, NotFoundError } from "@/lib/http/errors";
import { requirePermission } from "@/lib/permissions/roles";
import { buildTicketSearchDocument } from "@/lib/search/document-builder";
import { canTransitionTicketStatus } from "@/lib/search/ticket-status";
import { createTicketSchema, ticketListSchema, updateTicketStatusSchema } from "@/lib/validation/ticketSchemas";
import { createAuditLog } from "@/repositories/auditLogRepository";
import { ensureQueuedIncrementalJob } from "@/repositories/indexingJobRepository";
import {
  createTicketRecord,
  findTicketById,
  listTicketSnapshotForTenant,
  listTicketsByTenant,
  updateTicketStatusRecord
} from "@/repositories/ticketRepository";
import { enqueueSearchSyncEvent } from "@/repositories/searchSyncEventRepository";
import { touchTenantSourceChange } from "@/repositories/tenantSearchStateRepository";
import type { RequestContext } from "@/types/auth";

type CreateTicketInput = z.infer<typeof createTicketSchema>;
type TicketListInput = z.infer<typeof ticketListSchema>;
type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

function buildExternalTicketId() {
  return `TCK-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
}

export async function createTicket(context: RequestContext, input: CreateTicketInput) {
  requirePermission(context, "ticket:create");

  return db.transaction(async (tx) => {
    // ⚠️ SENIOR NOTE: This transaction binds source write, sync event, lag marker, job enqueue, and audit log into one commit boundary.
    const ticket = await createTicketRecord(
      {
        tenantId: context.session.tenantId,
        externalId: buildExternalTicketId(),
        title: input.title,
        description: input.description,
        priority: input.priority,
        assigneeUserId: input.assigneeUserId ?? null,
        createdByUserId: context.session.userId
      },
      tx
    );

    const searchDocument = buildTicketSearchDocument(ticket);

    // Write + sync-event happen in one transaction so the indexer never sees an event for a row that failed to commit.
    await enqueueSearchSyncEvent(
      {
        tenantId: ticket.tenantId,
        entityType: "TICKET",
        entityId: ticket.id,
        operation: "UPSERT",
        sourceVersion: searchDocument.sourceVersion,
        payload: searchDocument
      },
      tx
    );

    await touchTenantSourceChange(ticket.tenantId, tx);

    await ensureQueuedIncrementalJob(ticket.tenantId, context.session.userId, ["TICKET"], tx);

    await createAuditLog(
      {
        tenantId: ticket.tenantId,
        actorUserId: context.session.userId,
        action: "ticket.created",
        entityType: "TICKET",
        entityId: ticket.id,
        metadata: {
          externalId: ticket.externalId,
          priority: ticket.priority
        }
      },
      tx
    );

    return ticket;
  });
}

export async function listTickets(context: RequestContext, input: TicketListInput) {
  requirePermission(context, "ticket:read");

  // ⚠️ SENIOR NOTE: Read permissions are checked in the service too; relying on UI affordances alone would not protect the API.
  const result = await listTicketsByTenant(context.session.tenantId, input);

  return {
    ...result,
    page: input.page,
    pageSize: input.pageSize
  };
}

export async function updateTicketStatus(
  context: RequestContext,
  ticketId: string,
  input: UpdateTicketStatusInput
) {
  requirePermission(context, "ticket:update");

  return db.transaction(async (tx) => {
    const existing = await findTicketById(ticketId, context.session.tenantId, tx);

    if (!existing) {
      throw new NotFoundError("Ticket not found.");
    }

    if (!canTransitionTicketStatus(existing.status as TicketStatus, input.nextStatus)) {
      throw new ConflictError(`Cannot move a ticket from ${existing.status} to ${input.nextStatus}.`, {
        currentStatus: existing.status,
        nextStatus: input.nextStatus
      });
    }

    // ⚠️ SENIOR NOTE: Transition validation must happen before the update; checking after the write silently corrupts workflow history.
    const updated = await updateTicketStatusRecord(ticketId, context.session.tenantId, input.nextStatus, tx);

    if (!updated) {
      throw new NotFoundError("Ticket not found after update.");
    }

    const searchDocument = buildTicketSearchDocument(updated);

    await enqueueSearchSyncEvent(
      {
        tenantId: updated.tenantId,
        entityType: "TICKET",
        entityId: updated.id,
        operation: "UPSERT",
        sourceVersion: searchDocument.sourceVersion,
        payload: searchDocument
      },
      tx
    );

    await touchTenantSourceChange(updated.tenantId, tx);
    await ensureQueuedIncrementalJob(updated.tenantId, context.session.userId, ["TICKET"], tx);

    await createAuditLog(
      {
        tenantId: updated.tenantId,
        actorUserId: context.session.userId,
        action: "ticket.status_updated",
        entityType: "TICKET",
        entityId: updated.id,
        metadata: {
          previousStatus: existing.status,
          nextStatus: updated.status
        }
      },
      tx
    );

    return updated;
  });
}

export async function listTicketSearchSnapshot(tenantId: string) {
  // ⚠️ SENIOR NOTE: Rebuild helpers stay tiny wrappers so callers do not reach into repositories ad hoc and bypass service naming conventions.
  return listTicketSnapshotForTenant(tenantId);
}
