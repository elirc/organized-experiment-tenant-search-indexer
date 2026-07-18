/**
 * This file validates search inputs so repositories receive a normalized query object.
 * The search route calls it before invoking `src/services/searchService.ts`.
 * It feeds the search query utilities in `src/lib/search/query.ts`.
 * A junior engineer would likely accept unbounded page sizes and create an accidental denial-of-service path.
 */
import { z } from "zod";

export const searchQuerySchema = z.object({
  // ⚠️ SENIOR NOTE: Search text is bounded because even "read-only" endpoints can become abuse vectors under expensive ranking queries.
  query: z.string().min(1).max(120),
  entityType: z.enum(["TICKET", "DIRECTORY_USER"]).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  department: z.string().min(2).max(120).optional(),
  sortBy: z.enum(["relevance", "updatedAt"]).default("relevance"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(25).default(10)
});
