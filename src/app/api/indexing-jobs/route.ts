/**
 * This file exposes recent indexing job history for the current tenant.
 * It is called by `src/hooks/useIndexingJobs.ts`.
 * It calls request context resolution and `src/services/indexingService.ts`.
 * A junior engineer would likely mix operational reads into the search route and hide them from RBAC review.
 */
import { ok } from "@/lib/http/responses";
import { withRouteContext } from "@/lib/http/with-route-context";
import { listIndexingJobs } from "@/services/indexingService";

export async function GET(request: Request) {
  return withRouteContext(request, async (context) => {
    const result = await listIndexingJobs(context);
    return ok(result);
  });
}
