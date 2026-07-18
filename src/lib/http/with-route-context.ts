/**
 * This file wraps a route handler with authentication and consistent error handling.
 * API route files in `src/app/api/**/route.ts` call it directly.
 * It calls `src/lib/auth/session.ts` and `src/lib/http/responses.ts`.
 * A junior engineer would likely duplicate auth and try/catch blocks in every route until they drift apart.
 */
import type { RequestContext } from "@/types/auth";
import { buildRequestContext } from "@/lib/auth/session";
import { handleRouteError } from "@/lib/http/responses";

export async function withRouteContext(
  request: Request,
  handler: (context: RequestContext) => Promise<Response>
) {
  try {
    const context = await buildRequestContext(request);
    // ⚠️ SENIOR NOTE: Auth is resolved before handler execution so downstream route code cannot accidentally handle an unauthenticated request partway through.
    return await handler(context);
  } catch (error) {
    return handleRouteError(error);
  }
}
