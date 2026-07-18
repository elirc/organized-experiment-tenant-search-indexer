/**
 * This file defines the Postgres schema for the application domain and the search subsystem.
 * Calls come from repository files in `src/repositories/*Repository.ts`.
 * It is consumed by `src/db/client.ts` and by service-layer code through repositories.
 * A junior engineer would likely collapse search state into the source tables and lose the ability to rebuild safely.
 */
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const platformRoleEnum = pgEnum("platform_role", ["PLATFORM_ADMIN", "PLATFORM_USER"]);
export const membershipRoleEnum = pgEnum("membership_role", ["OWNER", "ADMIN", "AGENT", "VIEWER"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
export const ticketPriorityEnum = pgEnum("ticket_priority", ["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const searchEntityTypeEnum = pgEnum("search_entity_type", ["TICKET", "DIRECTORY_USER"]);
export const syncOperationEnum = pgEnum("sync_operation", ["UPSERT", "DELETE"]);
export const indexingJobTypeEnum = pgEnum("indexing_job_type", ["INCREMENTAL", "REBUILD"]);
export const indexingJobStatusEnum = pgEnum("indexing_job_status", [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED"
]);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    slugUnique: uniqueIndex("tenants_slug_unique").on(table.slug)
  })
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 240 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  platformRole: platformRoleEnum("platform_role").default("PLATFORM_USER").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: membershipRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    membershipUnique: uniqueIndex("memberships_tenant_user_unique").on(table.tenantId, table.userId),
    membershipTenantIdx: index("memberships_tenant_idx").on(table.tenantId)
  })
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    externalId: varchar("external_id", { length: 32 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    status: ticketStatusEnum("status").default("OPEN").notNull(),
    priority: ticketPriorityEnum("priority").default("MEDIUM").notNull(),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    // Tenant + external ID protects human-facing references from colliding across organizations.
    ticketExternalUnique: uniqueIndex("tickets_tenant_external_unique").on(table.tenantId, table.externalId),
    ticketTenantStatusIdx: index("tickets_tenant_status_idx").on(table.tenantId, table.status),
    ticketTenantUpdatedIdx: index("tickets_tenant_updated_idx").on(table.tenantId, table.updatedAt)
  })
);

export const directoryUsers = pgTable(
  "directory_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    email: varchar("email", { length: 240 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    department: varchar("department", { length: 120 }),
    title: varchar("title", { length: 120 }),
    notes: text("notes").default("").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    directoryUserTenantEmailUnique: uniqueIndex("directory_users_tenant_email_unique").on(table.tenantId, table.email),
    directoryUserTenantUpdatedIdx: index("directory_users_tenant_updated_idx").on(table.tenantId, table.updatedAt)
  })
);

export const searchDocuments = pgTable(
  "search_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    entityType: searchEntityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    generation: integer("generation").notNull(),
    title: varchar("title", { length: 220 }).notNull(),
    body: text("body").notNull(),
    filters: jsonb("filters").$type<Record<string, string | string[] | null>>().notNull(),
    sortUpdatedAt: timestamp("sort_updated_at", { withTimezone: true }).notNull(),
    sourceVersion: bigint("source_version", { mode: "number" }).notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    searchDocumentLookupUnique: uniqueIndex("search_documents_lookup_unique").on(
      table.tenantId,
      table.entityType,
      table.entityId,
      table.generation
    ),
    searchDocumentTenantGenerationIdx: index("search_documents_tenant_generation_idx").on(table.tenantId, table.generation),
    searchDocumentTenantEntityIdx: index("search_documents_tenant_entity_idx").on(table.tenantId, table.entityType)
  })
);

export const searchSyncEvents = pgTable(
  "search_sync_events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    entityType: searchEntityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    operation: syncOperationEnum("operation").notNull(),
    sourceVersion: bigint("source_version", { mode: "number" }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
  },
  (table) => ({
    syncEventTenantProcessedIdx: index("search_sync_events_tenant_processed_idx").on(table.tenantId, table.processedAt, table.id)
  })
);

export const tenantSearchStates = pgTable("tenant_search_states", {
  tenantId: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .primaryKey(),
  // ⚠️ SENIOR NOTE: Active and rebuilding generations must be separate fields; one mutable "current generation" value is not enough to support safe cutovers.
  activeGeneration: integer("active_generation").default(1).notNull(),
  rebuildingGeneration: integer("rebuilding_generation"),
  lastSourceChangeAt: timestamp("last_source_change_at", { withTimezone: true }),
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
  lastProcessedEventId: bigint("last_processed_event_id", { mode: "number" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const indexingJobs = pgTable(
  "indexing_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    type: indexingJobTypeEnum("type").notNull(),
    status: indexingJobStatusEnum("status").default("QUEUED").notNull(),
    requestedByUserId: uuid("requested_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    generation: integer("generation"),
    entityTypes: jsonb("entity_types").$type<Array<"TICKET" | "DIRECTORY_USER">>().notNull(),
    stats: jsonb("stats").$type<Record<string, number | string | null>>().default({}).notNull(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    indexingJobTenantCreatedIdx: index("indexing_jobs_tenant_created_idx").on(table.tenantId, table.createdAt)
  })
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: uuid("actor_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    auditLogTenantCreatedIdx: index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt)
  })
);

export type PlatformRole = (typeof platformRoleEnum.enumValues)[number];
export type MembershipRole = (typeof membershipRoleEnum.enumValues)[number];
export type TicketStatus = (typeof ticketStatusEnum.enumValues)[number];
export type TicketPriority = (typeof ticketPriorityEnum.enumValues)[number];
export type SearchEntityType = (typeof searchEntityTypeEnum.enumValues)[number];
export type SyncOperation = (typeof syncOperationEnum.enumValues)[number];
export type IndexingJobType = (typeof indexingJobTypeEnum.enumValues)[number];
export type IndexingJobStatus = (typeof indexingJobStatusEnum.enumValues)[number];
