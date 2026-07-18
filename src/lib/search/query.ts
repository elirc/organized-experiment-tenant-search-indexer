/**
 * This file normalizes validated search inputs into repository-friendly options.
 * It is called by `src/services/searchService.ts`.
 * It does not call other application layers.
 * A junior engineer would likely rebuild this logic inside the repository and tie HTTP concerns to database code.
 */
import type { z } from "zod";

import { searchQuerySchema } from "@/lib/validation/searchSchemas";

export type SearchInput = z.infer<typeof searchQuerySchema>;

export function normalizeSearchQuery(input: SearchInput) {
  const normalizedQuery = input.query.trim().replace(/\s+/g, " ");

  // ⚠️ SENIOR NOTE: Query normalization belongs outside the repository so caching keys and SQL inputs stay aligned.
  return {
    ...input,
    query: normalizedQuery,
    offset: (input.page - 1) * input.pageSize
  };
}
