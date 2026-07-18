/**
 * This file owns search orchestration, freshness reporting, and tenant-aware result shaping.
 * It is called by `src/app/api/search/route.ts`.
 * It calls the permission layer, query normalizer, search repository, and tenant search state repository.
 * A junior engineer would likely return only results and hide whether the index is stale, which blinds operators during incidents.
 */
import type { z } from "zod";

import { requirePermission } from "@/lib/permissions/roles";
import { normalizeSearchQuery } from "@/lib/search/query";
import { searchQuerySchema } from "@/lib/validation/searchSchemas";
import { searchIndexedDocuments } from "@/repositories/searchDocumentRepository";
import { estimatePendingEventCount, getTenantSearchState } from "@/repositories/tenantSearchStateRepository";
import type { RequestContext } from "@/types/auth";

type SearchInput = z.infer<typeof searchQuerySchema>;

export async function searchDocuments(context: RequestContext, input: SearchInput) {
  requirePermission(context, "search:read");

  const normalized = normalizeSearchQuery(input);
  const state = await getTenantSearchState(context.session.tenantId);
  const pendingEventCount = await estimatePendingEventCount(context.session.tenantId);

  // ⚠️ SENIOR NOTE: Returning freshness metadata with results lets callers make explicit product decisions about eventual consistency instead of guessing.
  const result = await searchIndexedDocuments({
    tenantId: context.session.tenantId,
    activeGeneration: state.activeGeneration,
    ...normalized
  });

  return {
    ...result,
    page: normalized.page,
    pageSize: normalized.pageSize,
    indexState: {
      activeGeneration: state.activeGeneration,
      rebuildingGeneration: state.rebuildingGeneration,
      pendingEventCount,
      lastIndexedAt: state.lastIndexedAt,
      lastSourceChangeAt: state.lastSourceChangeAt,
      isStale:
        pendingEventCount > 0 ||
        Boolean(state.lastSourceChangeAt && state.lastIndexedAt && state.lastSourceChangeAt > state.lastIndexedAt)
    }
  };
}
