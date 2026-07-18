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
