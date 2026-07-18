/**
 * This file centralizes role and permission decisions for organization-scoped APIs.
 * Service files call `requirePermission()` before business logic mutates state or reveals protected data.
 * It uses the request context from `src/types/auth.ts` and shared HTTP errors.
 * A junior engineer would likely scatter role checks across routes and miss one mutation path.
 */
import type { MembershipRole, RequestContext } from "@/types/auth";
import { ForbiddenError } from "@/lib/http/errors";

export type Permission =
  | "search:read"
  | "ticket:read"
  | "ticket:create"
  | "ticket:update"
  | "directory-user:read"
  | "directory-user:create"
  | "directory-user:update"
  | "indexing-job:read"
  | "indexing-job:rebuild"
  | "indexing-job:run";

const roleOrder: MembershipRole[] = ["VIEWER", "AGENT", "ADMIN", "OWNER"];

const permissionMinimumRole: Record<Permission, MembershipRole> = {
  "search:read": "VIEWER",
  "ticket:read": "VIEWER",
  "ticket:create": "AGENT",
  "ticket:update": "AGENT",
  "directory-user:read": "VIEWER",
  "directory-user:create": "ADMIN",
  "directory-user:update": "ADMIN",
  "indexing-job:read": "ADMIN",
  "indexing-job:rebuild": "ADMIN",
  "indexing-job:run": "OWNER"
};

export function hasAtLeastRole(actual: MembershipRole, minimum: MembershipRole) {
  return roleOrder.indexOf(actual) >= roleOrder.indexOf(minimum);
}

export function requirePermission(context: RequestContext, permission: Permission) {
  if (context.session.platformRole === "PLATFORM_ADMIN") {
    return;
  }

  const minimumRole = permissionMinimumRole[permission];

  if (!hasAtLeastRole(context.session.membershipRole, minimumRole)) {
    // ⚠️ SENIOR NOTE: Permission checks stay centralized here so new routes and services inherit the same policy instead of cloning ad hoc role logic.
    throw new ForbiddenError(
      `Role ${context.session.membershipRole} cannot perform ${permission}. Minimum required role is ${minimumRole}.`
    );
  }
}
