# Load-Bearing Files

## src/db/schema.ts
- What it does: Defines the core domain tables and the search/indexing subsystem tables.
- What calls it: `src/db/client.ts`, then every repository in `src/repositories/`.
- What it calls: Drizzle schema primitives from `drizzle-orm/pg-core`.
- What would break or become insecure if this file were wrong: Tenant boundaries, rebuild safety, and job tracking could all collapse at the data model level.
- What a junior engineer would likely miswrite here: They would try to store search state inside `tickets` and `directory_users` instead of modeling a real read model.

## src/lib/auth/session.ts
- What it does: Turns raw request headers into a verified `RequestContext`.
- What calls it: `src/lib/http/with-route-context.ts`.
- What it calls: `src/repositories/membershipRepository.ts`.
- What would break or become insecure if this file were wrong: Users could present another tenant’s ID and read or mutate that tenant’s data.
- What a junior engineer would likely miswrite here: They would trust `x-demo-tenant-id` without verifying membership.

## src/lib/permissions/roles.ts
- What it does: Centralizes permission names and minimum org roles.
- What calls it: Every service file in `src/services/`.
- What it calls: Shared error types in `src/lib/http/errors.ts`.
- What would break or become insecure if this file were wrong: Protected writes or operational endpoints could become reachable by low-privilege users.
- What a junior engineer would likely miswrite here: They would add one-off role checks in routes and forget to update all mutation paths.

## src/services/ticketService.ts
- What it does: Owns ticket writes, ticket reads, workflow validation, audit logging, and index sync event creation.
- What calls it: `src/app/api/tickets/route.ts` and `src/app/api/tickets/[ticketId]/status/route.ts`.
- What it calls: `src/repositories/ticketRepository.ts`, `src/repositories/searchSyncEventRepository.ts`, `src/repositories/indexingJobRepository.ts`, `src/repositories/tenantSearchStateRepository.ts`, and `src/repositories/auditLogRepository.ts`.
- What would break or become insecure if this file were wrong: Source-of-truth and search-index consistency would drift, or invalid workflow transitions would be accepted.
- What a junior engineer would likely miswrite here: They would write the ticket row but forget to emit the sync event in the same transaction.

## src/repositories/searchDocumentRepository.ts
- What it does: Persists and queries the denormalized search index.
- What calls it: `src/services/searchService.ts` and `src/services/indexingJobRunner.ts`.
- What it calls: `src/db/client.ts` and `src/db/schema.ts`.
- What would break or become insecure if this file were wrong: Search could leak cross-tenant data or corrupt rebuild generations during upserts.
- What a junior engineer would likely miswrite here: They would omit `generation` from the conflict target or forget to filter on `activeGeneration`.

## src/services/indexingJobRunner.ts
- What it does: Executes queued incremental and rebuild jobs.
- What calls it: `src/app/api/indexing-jobs/run-pending/route.ts`.
- What it calls: `src/repositories/indexingJobRepository.ts`, `src/repositories/searchSyncEventRepository.ts`, `src/repositories/searchDocumentRepository.ts`, `src/repositories/tenantSearchStateRepository.ts`, `src/services/ticketService.ts`, and `src/services/directoryUserService.ts`.
- What would break or become insecure if this file were wrong: Jobs could duplicate work, rebuild cutovers could become unsafe, and stale reads could persist indefinitely.
- What a junior engineer would likely miswrite here: They would treat rebuilds like incremental jobs and overwrite the live generation instead of building a new one.

## src/repositories/tenantSearchStateRepository.ts
- What it does: Tracks active generation, rebuilding generation, freshness markers, and the incremental cursor.
- What calls it: `src/services/searchService.ts`, `src/services/indexingService.ts`, `src/services/indexingJobRunner.ts`, `src/services/ticketService.ts`, and `src/services/directoryUserService.ts`.
- What it calls: `src/db/client.ts` and `src/db/schema.ts`.
- What would break or become insecure if this file were wrong: Search freshness, lag reporting, and rebuild cutovers would become non-deterministic.
- What a junior engineer would likely miswrite here: They would hold this state in memory or derive it from logs rather than a durable table.

## src/services/searchService.ts
- What it does: Owns tenant-scoped search reads and freshness metadata.
- What calls it: `src/app/api/search/route.ts`.
- What it calls: `src/lib/search/query.ts`, `src/repositories/searchDocumentRepository.ts`, and `src/repositories/tenantSearchStateRepository.ts`.
- What would break or become insecure if this file were wrong: The UI could treat stale results as fresh, or search could query the wrong tenant generation.
- What a junior engineer would likely miswrite here: They would return only search hits and hide the lag signal that operators need.

## src/services/indexingService.ts
- What it does: Owns the admin workflow for queuing rebuilds and listing tenant jobs.
- What calls it: `src/app/api/indexing-jobs/route.ts` and `src/app/api/indexing-jobs/rebuild/route.ts`.
- What it calls: `src/repositories/tenantSearchStateRepository.ts`, `src/repositories/indexingJobRepository.ts`, and `src/repositories/auditLogRepository.ts`.
- What would break or become insecure if this file were wrong: Rebuilds could be queued concurrently for the same tenant, making generation management unsafe.
- What a junior engineer would likely miswrite here: They would fire the rebuild synchronously from the route instead of creating a durable job.
