/**
 * This file resolves the authenticated session from the request and turns it into a typed context.
 * Route handlers call it through `src/lib/http/with-route-context.ts`.
 * It calls `src/repositories/membershipRepository.ts` and shared HTTP errors.
 * A junior engineer would likely trust a tenant header without verifying that the user actually belongs to that tenant.
 */
import { randomUUID } from "node:crypto";

import { findSessionMembership } from "@/repositories/membershipRepository";
import type { AuthenticatedSession, RequestContext } from "@/types/auth";
import { UnauthorizedError } from "@/lib/http/errors";

const USER_HEADER = "x-demo-user-id";
const TENANT_HEADER = "x-demo-tenant-id";
const REQUEST_HEADER = "x-request-id";

export async function resolveSessionFromRequest(request: Request): Promise<AuthenticatedSession> {
  const userId = request.headers.get(USER_HEADER);
  const tenantId = request.headers.get(TENANT_HEADER);

  if (!userId || !tenantId) {
    throw new UnauthorizedError(
      `Missing demo session headers. Expected ${USER_HEADER} and ${TENANT_HEADER}.`
    );
  }

  const membership = await findSessionMembership(userId, tenantId);

  if (!membership) {
    throw new UnauthorizedError("The current user is not a member of the selected tenant.");
  }

  // ⚠️ SENIOR NOTE: Returning a typed session object here keeps downstream services from re-reading raw headers and accidentally bypassing membership verification.
  return membership;
}

export async function buildRequestContext(request: Request): Promise<RequestContext> {
  const session = await resolveSessionFromRequest(request);

  return {
    requestId: request.headers.get(REQUEST_HEADER) ?? randomUUID(),
    session
  };
}
