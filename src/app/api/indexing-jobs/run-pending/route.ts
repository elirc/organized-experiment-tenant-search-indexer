/**
 * This file exposes the worker-like endpoint that processes queued indexing jobs.
 * It is intended for a cron, queue worker, or protected ops call rather than normal end users.
 * It calls request context resolution, validation, and `src/services/indexingJobRunner.ts`.
 * A junior engineer would likely leave this endpoint unauthenticated because "it is internal."
 */
import { ok } from "@/lib/http/responses";
import { withRouteContext } from "@/lib/http/with-route-context";
import { runPendingJobsSchema } from "@/lib/validation/indexingSchemas";
import { runPendingIndexingJobs } from "@/services/indexingJobRunner";

export async function POST(request: Request) {
  return withRouteContext(request, async (context) => {
    const body = runPendingJobsSchema.parse(await request.json());
    const result = await runPendingIndexingJobs(context, body);

    return ok(result);
  });
}
