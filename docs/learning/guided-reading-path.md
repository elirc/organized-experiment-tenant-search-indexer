# Guided Reading Path

## Step 1 — src/db/schema.ts
**Why read this:** This is the system shape in one file: tenants, source entities, search documents, sync events, job state, and audit logs.
**What to look for:** The separation between source-of-truth tables and the search/indexing subsystem, especially `searchDocuments`, `searchSyncEvents`, `tenantSearchStates`, and `indexingJobs`.
**What to trace:** This file is called by `src/db/client.ts`, then by every repository in `src/repositories/`.
**What a junior would likely miss:** `activeGeneration` and `rebuildingGeneration` are not cosmetic; they are what make rebuild cutovers safe.

## Step 2 — src/lib/auth/session.ts
**Why read this:** This is where request headers become a verified tenant-scoped session.
**What to look for:** `resolveSessionFromRequest()` calling `findSessionMembership()` instead of trusting raw headers.
**What to trace:** Called by `src/lib/http/with-route-context.ts`; calls `src/repositories/membershipRepository.ts`.
**What a junior would likely miss:** Authenticating the user is not enough in a multi-tenant app; tenant membership must be proven too.

## Step 3 — src/lib/permissions/roles.ts
**Why read this:** This is the single reviewable RBAC matrix.
**What to look for:** The `Permission` union and `permissionMinimumRole` map.
**What to trace:** Called by `src/services/ticketService.ts`, `src/services/directoryUserService.ts`, `src/services/searchService.ts`, `src/services/indexingService.ts`, and `src/services/indexingJobRunner.ts`.
**What a junior would likely miss:** Scattering role checks in routes feels faster at first but becomes invisible technical debt.

## Step 4 — src/app/api/tickets/route.ts
**Why read this:** It shows the intended route shape for this codebase.
**What to look for:** Route -> auth wrapper -> Zod parse -> service call -> stable JSON response.
**What to trace:** Called by `src/hooks/useTickets.ts`; calls `src/lib/http/with-route-context.ts`, `src/lib/validation/ticketSchemas.ts`, and `src/services/ticketService.ts`.
**What a junior would likely miss:** The route does almost no business logic on purpose.

## Step 5 — src/services/ticketService.ts
**Why read this:** This is the write-side orchestration pattern for the whole system.
**What to look for:** `createTicket()` transaction boundary, permission check, source write, sync event, lag marker, job enqueue, and audit log.
**What to trace:** Called by `src/app/api/tickets/route.ts` and `src/app/api/tickets/[ticketId]/status/route.ts`; calls multiple repositories plus `src/lib/search/document-builder.ts`.
**What a junior would likely miss:** The transaction boundary is not about database neatness; it protects the consistency contract between source-of-truth and index sync.

## Step 6 — src/repositories/ticketRepository.ts
**Why read this:** It shows what a tenant-aware repository actually looks like.
**What to look for:** Every method scopes by `tenantId`, and workflow legality is intentionally absent here.
**What to trace:** Called by `src/services/ticketService.ts` and `src/services/indexingJobRunner.ts`.
**What a junior would likely miss:** The repository should not decide if a status change is valid; it only persists data.

## Step 7 — src/lib/search/document-builder.ts
**Why read this:** This file is the boundary between source data and the denormalized read model.
**What to look for:** How tickets and directory users are flattened into one searchable document shape.
**What to trace:** Called by `src/services/ticketService.ts`, `src/services/directoryUserService.ts`, `src/services/indexingJobRunner.ts`, and `src/db/seed.ts`.
**What a junior would likely miss:** Reusing one document shape across entity types is what keeps search code simple later.

## Step 8 — src/repositories/searchSyncEventRepository.ts
**Why read this:** This file explains how eventual consistency is made durable.
**What to look for:** `enqueueSearchSyncEvent()`, `listPendingSearchSyncEvents()`, and `markSearchSyncEventsProcessed()`.
**What to trace:** Called by `src/services/ticketService.ts`, `src/services/directoryUserService.ts`, and `src/services/indexingJobRunner.ts`.
**What a junior would likely miss:** Without a durable outbox table, deletes, retries, lag metrics, and replay become much harder.

## Step 9 — src/repositories/indexingJobRepository.ts
**Why read this:** It shows how the system tracks asynchronous work instead of hiding it in logs.
**What to look for:** `ensureQueuedIncrementalJob()` and how it coalesces write noise into one pending job per tenant.
**What to trace:** Called by `src/services/ticketService.ts`, `src/services/directoryUserService.ts`, `src/services/indexingService.ts`, and `src/services/indexingJobRunner.ts`.
**What a junior would likely miss:** Coalescing jobs is a deliberate read/write tradeoff, not a premature optimization.

## Step 10 — src/services/indexingJobRunner.ts
**Why read this:** This is the async heart of the system.
**What to look for:** The difference between `runIncrementalJob()` and `runRebuildJob()`.
**What to trace:** Called by `src/app/api/indexing-jobs/run-pending/route.ts`; calls job repositories, search state repositories, source snapshots, and search-document writes.
**What a junior would likely miss:** Incremental sync and rebuild sync solve different problems and should not be fused into one opaque path.

## Step 11 — src/repositories/searchDocumentRepository.ts
**Why read this:** This is where the read model becomes a queryable search system.
**What to look for:** `searchIndexedDocuments()` using tenant scope, active generation, filters, full-text SQL, sorting, and pagination.
**What to trace:** Called by `src/services/searchService.ts` and `src/services/indexingJobRunner.ts`.
**What a junior would likely miss:** The conflict target on upsert includes generation for a reason; rebuilds depend on it.

## Step 12 — src/services/searchService.ts
**Why read this:** It shows how to return search results together with operational freshness data.
**What to look for:** `searchDocuments()` loading `TenantSearchState` and pending-event counts before querying the index.
**What to trace:** Called by `src/app/api/search/route.ts`; calls `src/lib/search/query.ts`, `src/repositories/searchDocumentRepository.ts`, and `src/repositories/tenantSearchStateRepository.ts`.
**What a junior would likely miss:** Eventual consistency should be surfaced to callers, not hidden.

## Step 13 — src/services/indexingService.ts
**Why read this:** This is the admin-side orchestration for safe rebuilds.
**What to look for:** `requestIndexRebuild()` checking for an in-flight rebuild before reserving the next generation and creating a job.
**What to trace:** Called by `src/app/api/indexing-jobs/rebuild/route.ts`; calls `src/repositories/tenantSearchStateRepository.ts`, `src/repositories/indexingJobRepository.ts`, and `src/repositories/auditLogRepository.ts`.
**What a junior would likely miss:** “Queue a rebuild” is different from “run a rebuild right now”; the former is the safer production pattern.

## Step 14 — tests/search-service.tenant-isolation.test.ts
**Why read this:** It shows the smallest useful tenant-isolation test in this codebase.
**What to look for:** The assertion that `searchDocuments()` passes `tenantId` into the repository call.
**What to trace:** Calls `src/services/searchService.ts`, which calls `src/repositories/searchDocumentRepository.ts`.
**What a junior would likely miss:** Tenant safety can be tested at the service-to-repository boundary even before full integration tests exist.
