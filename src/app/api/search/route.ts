/**
 * This file exposes the tenant-aware search API.
 * It is called by `src/hooks/useSearch.ts` and any external client hitting `/api/search`.
 * It calls request context resolution, search validation, and `src/services/searchService.ts`.
 * A junior engineer would likely put search parsing and ranking logic directly in this route.
 */
import { ok } from "@/lib/http/responses";
import { withRouteContext } from "@/lib/http/with-route-context";
import { searchQuerySchema } from "@/lib/validation/searchSchemas";
import { searchDocuments } from "@/services/searchService";

export async function GET(request: Request) {
  return withRouteContext(request, async (context) => {
    const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
    const input = searchQuerySchema.parse(searchParams);
    const result = await searchDocuments(context, input);

    return ok(result);
  });
}
