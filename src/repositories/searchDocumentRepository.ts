/**
 * This file owns the denormalized search index persisted in Postgres.
 * It is called by `src/services/searchService.ts` and `src/services/indexingService.ts`.
 * It calls `src/db/client.ts`, `src/db/schema.ts`, and Postgres full-text SQL helpers.
 * A junior engineer would likely query source tables directly for search and lose read performance and rebuild safety.
 */
import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import type { DbExecutor } from "@/db/client";
import { db } from "@/db/client";
import { searchDocuments } from "@/db/schema";

type SearchDocumentUpsert = {
  tenantId: string;
  entityType: "TICKET" | "DIRECTORY_USER";
  entityId: string;
  generation: number;
  title: string;
  body: string;
  filters: Record<string, string | string[] | null>;
  sortUpdatedAt: Date;
  sourceVersion: number;
  isDeleted?: boolean;
};

export async function upsertSearchDocuments(documents: SearchDocumentUpsert[], executor: DbExecutor = db) {
  if (documents.length === 0) {
    return;
  }

  // ⚠️ SENIOR NOTE: The conflict target includes generation; omitting it would corrupt a live rebuild by overwriting the active and rebuilding copies.
  await executor
    .insert(searchDocuments)
    .values(documents)
    .onConflictDoUpdate({
      target: [
        searchDocuments.tenantId,
        searchDocuments.entityType,
        searchDocuments.entityId,
        searchDocuments.generation
      ],
      set: {
        title: sql`excluded.title`,
        body: sql`excluded.body`,
        filters: sql`excluded.filters`,
        sortUpdatedAt: sql`excluded.sort_updated_at`,
        sourceVersion: sql`excluded.source_version`,
        isDeleted: sql`excluded.is_deleted`,
        indexedAt: sql`now()`
      }
    });
}

export async function searchIndexedDocuments(
  params: {
    tenantId: string;
    activeGeneration: number;
    query: string;
    entityType?: "TICKET" | "DIRECTORY_USER";
    status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
    department?: string;
    sortBy: "relevance" | "updatedAt";
    sortDirection: "asc" | "desc";
    page: number;
    pageSize: number;
    offset: number;
  },
  executor: DbExecutor = db
) {
  const tsQuery = sql`websearch_to_tsquery('english', ${params.query})`;
  const vector = sql`to_tsvector('english', coalesce(${searchDocuments.title}, '') || ' ' || coalesce(${searchDocuments.body}, ''))`;
  const rank = sql<number>`ts_rank(${vector}, ${tsQuery})`;

  const conditions = [
    // Search results must come only from the caller's tenant and currently active generation.
    eq(searchDocuments.tenantId, params.tenantId),
    eq(searchDocuments.generation, params.activeGeneration),
    eq(searchDocuments.isDeleted, false),
    sql`${vector} @@ ${tsQuery}`,
    params.entityType ? eq(searchDocuments.entityType, params.entityType) : undefined,
    params.status ? sql`${searchDocuments.filters} ->> 'status' = ${params.status}` : undefined,
    params.department ? sql`${searchDocuments.filters} ->> 'department' = ${params.department}` : undefined
  ].filter(Boolean);

  const items = await executor
    .select({
      id: searchDocuments.id,
      entityType: searchDocuments.entityType,
      entityId: searchDocuments.entityId,
      title: searchDocuments.title,
      body: searchDocuments.body,
      filters: searchDocuments.filters,
      sortUpdatedAt: searchDocuments.sortUpdatedAt,
      indexedAt: searchDocuments.indexedAt,
      relevance: rank
    })
    .from(searchDocuments)
    .where(and(...conditions))
    .orderBy(
      params.sortBy === "updatedAt"
        ? params.sortDirection === "asc"
          ? asc(searchDocuments.sortUpdatedAt)
          : desc(searchDocuments.sortUpdatedAt)
        : params.sortDirection === "asc"
          ? asc(rank)
          : desc(rank)
    )
    .limit(params.pageSize)
    .offset(params.offset);

  const [{ total }] = await executor
    .select({ total: count() })
    .from(searchDocuments)
    .where(and(...conditions));

  return {
    items,
    total
  };
}

export async function deleteGenerationDocuments(tenantId: string, generation: number, executor: DbExecutor = db) {
  await executor
    .delete(searchDocuments)
    .where(
      and(
        // Deleting generations must stay tenant-scoped because generation numbers repeat across tenants.
        eq(searchDocuments.tenantId, tenantId),
        eq(searchDocuments.generation, generation)
      )
    );
}
