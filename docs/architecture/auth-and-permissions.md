# Auth And Permissions

Session resolution is centralized in `src/lib/auth/session.ts`. `resolveSessionFromRequest()` reads `x-demo-user-id` and `x-demo-tenant-id`, then calls `findSessionMembership()` in `src/repositories/membershipRepository.ts` to verify that the user actually belongs to the tenant before returning an `AuthenticatedSession`.

Route auth is enforced before business logic runs:

- `src/app/api/**/route.ts` calls `withRouteContext()` from `src/lib/http/with-route-context.ts`
- `withRouteContext()` calls `buildRequestContext()` in `src/lib/auth/session.ts`
- `buildRequestContext()` calls `resolveSessionFromRequest()`
- `resolveSessionFromRequest()` calls `findSessionMembership()` in `src/repositories/membershipRepository.ts`

Authorization is centralized in `src/lib/permissions/roles.ts`. `requirePermission()` maps named permissions such as `ticket:create`, `search:read`, and `indexing-job:run` to minimum org roles. Platform admins bypass org-role checks through the early return in `requirePermission()`.

Role separation:

- Platform roles live in `src/db/schema.ts` as `platformRoleEnum`
- Org roles live in `src/db/schema.ts` as `membershipRoleEnum`
- The permission matrix lives in `src/lib/permissions/roles.ts` in `permissionMinimumRole`

Examples:

- Ticket creation is allowed for `AGENT` and above in `src/lib/permissions/roles.ts`, then checked in `createTicket()` inside `src/services/ticketService.ts`
- Directory user creation is stricter and requires `ADMIN` and above, enforced in `createDirectoryUser()` in `src/services/directoryUserService.ts`
- Running the worker endpoint requires `OWNER` through `requirePermission(context, "indexing-job:run")` in `src/services/indexingJobRunner.ts`

Tenant isolation is first-class:

- Session scope enters through `context.session.tenantId` from `src/lib/auth/session.ts`
- Services pass that tenant ID into repositories, for example `listTicketsByTenant(context.session.tenantId, ...)` in `src/services/ticketService.ts`
- Repositories re-assert tenant scope in SQL conditions, for example `eq(tickets.tenantId, tenantId)` in `src/repositories/ticketRepository.ts`
- Search reads scope by tenant and active generation in `searchIndexedDocuments()` inside `src/repositories/searchDocumentRepository.ts`
- Search health reads scope by tenant in `getTenantSearchState()` and `estimatePendingEventCount()` inside `src/repositories/tenantSearchStateRepository.ts`

Why this matters:

- A junior implementation often trusts a tenant header after authenticating the user once. This code does not. Membership is verified in `src/repositories/membershipRepository.ts` on every request.
- A mid-level engineer should notice the same tenant boundary is enforced twice: once in auth context creation and again in repository conditions.
- A senior engineer worries about the missing filter that shows up six months later. That is why every tenant-owned repository function contains an inline comment next to its `tenantId` predicate.


## Corrections (verified against the code)

1. **"This code does not trust a tenant header" is half true.** It does not trust the *tenant* header on its own: membership is checked on every request (`src/lib/auth/session.ts:27-31`). It does trust the *user* header completely. `x-demo-user-id` is the identity, and there is no password, token, cookie or signature (`session.ts:17-25`). Any caller that knows a member's user id and tenant id can act as that member. The default browser client hard-codes the seeded owner's ids (`src/lib/http/client.ts:8-9`). Treat this file as a stand-in for real authentication.
2. **Not every tenant-owned query scopes by tenant.** `listQueuedIndexingJobs()` reads queued jobs from all tenants (`src/repositories/indexingJobRepository.ts:61-68`), and `markIndexingJobRunning/Completed/Failed` update by job id alone (`:70-107`). Combined with the `OWNER`-level `indexing-job:run` permission, a tenant owner runs, and sees the ids of, other tenants' jobs (finding T1 in `docs/architecture/README.md`). The claim "every tenant-owned repository function contains an inline comment next to its `tenantId` predicate" is true for the functions that have such a predicate; these four functions have none.
3. **The platform-admin bypass skips the role check but not the membership check.** `requirePermission()` returns early for `PLATFORM_ADMIN` (`src/lib/permissions/roles.ts:42-44`), but `resolveSessionFromRequest()` still requires a membership row for the claimed tenant. A platform admin can therefore act only in tenants where they already have *some* membership. That may or may not be intended; the docs previously implied a global bypass.
4. **Two permissions are defined but unused.** `directory-user:update` (`roles.ts:31`) has no route or service; `grep -rn "directory-user:update" src` finds only `roles.ts`.
5. **Unknown roles fail closed.** `hasAtLeastRole()` uses `roleOrder.indexOf()` (`roles.ts:37-39`). A role not in the list gets index `-1`, which is below every minimum. A scratch run printed `unknown role index: -1 hasAtLeastRole(SUPPORT,VIEWER)= false`. This is the safe default and worth keeping if roles are added.

## Permission matrix (counted from `permissionMinimumRole`)

| Permission | Minimum role | Used in |
| --- | --- | --- |
| `search:read` | VIEWER | `src/services/searchService.ts:19` |
| `ticket:read` | VIEWER | `src/services/ticketService.ts:94` |
| `ticket:create` | AGENT | `ticketService.ts:38` |
| `ticket:update` | AGENT | `ticketService.ts:111` |
| `directory-user:read` | VIEWER | `src/services/directoryUserService.ts:81` |
| `directory-user:create` | ADMIN | `directoryUserService.ts:23` |
| `directory-user:update` | ADMIN | not used |
| `indexing-job:read` | ADMIN | `src/services/indexingService.ts:66` |
| `indexing-job:rebuild` | ADMIN | `indexingService.ts:21` |
| `indexing-job:run` | OWNER | `src/services/indexingJobRunner.ts:33` |

## Check ladder

**Goal 1:** decide whether a `VIEWER` can see the indexing-jobs page data.
**Check:** no. `indexing-job:read` needs `ADMIN` (`roles.ts:32`); the API returns 403 even if the page renders.

**Goal 2 (run it):** copy `roleOrder`, `permissionMinimumRole`, `hasAtLeastRole` and `requirePermission` from `src/lib/permissions/roles.ts` into a scratch `.mjs` and confirm that a `VIEWER` with `platformRole: "PLATFORM_ADMIN"` passes `indexing-job:run`.
**Check:** it passes. This was run for these docs. The bypass is total for role checks.

**Goal 3:** write the smallest change that closes finding T1 without changing the permission model.
**Check:** pass `context.session.tenantId` into `listQueuedIndexingJobs()` and add `eq(indexingJobs.tenantId, tenantId)`; keep the cross-tenant variant for `PLATFORM_ADMIN` only, if it is needed at all.
