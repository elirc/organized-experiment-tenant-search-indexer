/**
 * This file converts source-of-truth entities into denormalized search documents.
 * The indexing service calls it while processing change events or rebuild snapshots.
 * It is used alongside `src/repositories/searchDocumentRepository.ts`.
 * A junior engineer would likely duplicate this mapping in multiple services and let search fields drift from the source model.
 */
import type { SearchEntityType } from "@/db/schema";

type SearchDocumentDraft = {
  tenantId: string;
  entityType: SearchEntityType;
  entityId: string;
  title: string;
  body: string;
  filters: Record<string, string | string[] | null>;
  sortUpdatedAt: Date;
  sourceVersion: number;
};

export function buildTicketSearchDocument(ticket: {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  updatedAt: Date;
}) {
  return {
    tenantId: ticket.tenantId,
    entityType: "TICKET",
    entityId: ticket.id,
    title: ticket.title,
    body: ticket.description,
    filters: {
      status: ticket.status,
      priority: ticket.priority
    },
    sortUpdatedAt: ticket.updatedAt,
    sourceVersion: ticket.updatedAt.getTime()
  } satisfies SearchDocumentDraft;
}

export function buildDirectoryUserSearchDocument(directoryUser: {
  id: string;
  tenantId: string;
  displayName: string;
  email: string;
  department: string | null;
  title: string | null;
  notes: string;
  updatedAt: Date;
}) {
  return {
    tenantId: directoryUser.tenantId,
    entityType: "DIRECTORY_USER",
    entityId: directoryUser.id,
    title: `${directoryUser.displayName} <${directoryUser.email}>`,
    // ⚠️ SENIOR NOTE: The read model intentionally flattens multiple fields into one searchable body so query logic stays stable as the source schema evolves.
    body: [directoryUser.title, directoryUser.department, directoryUser.notes].filter(Boolean).join("\n"),
    filters: {
      department: directoryUser.department,
      title: directoryUser.title
    },
    sortUpdatedAt: directoryUser.updatedAt,
    sourceVersion: directoryUser.updatedAt.getTime()
  } satisfies SearchDocumentDraft;
}
