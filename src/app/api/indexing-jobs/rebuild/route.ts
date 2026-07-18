/**
 * This file exposes the admin action that queues a safe search index rebuild.
 * It is called by `src/hooks/useIndexingJobs.ts`.
 * It calls request context resolution, validation, and `src/services/indexingService.ts`.
 * A junior engineer would likely rebuild synchronously in the request and create a timeout-prone admin endpoint.
 */
import { ok } from "@/lib/http/responses";
import { withRouteContext } from "@/lib/http/with-route-context";
import { rebuildIndexSchema } from "@/lib/validation/indexingSchemas";
import { requestIndexRebuild } from "@/services/indexingService";

export async function POST(request: Request) {
  return withRouteContext(request, async (context) => {
    const body = rebuildIndexSchema.parse(await request.json());
    const result = await requestIndexRebuild(context, body);

    return ok(result, { status: 202 });
  });
}
