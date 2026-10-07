# Request Lifecycle

Request: Create a ticket and queue incremental indexing
1. `src/app/api/tickets/route.ts` — `POST()` parses JSON with `createTicketSchema.parse()`
2. `src/lib/http/with-route-context.ts` — `withRouteContext()` resolves auth and wraps error handling
3. `src/lib/auth/session.ts` — `buildRequestContext()` and `resolveSessionFromRequest()` verify membership
4. `src/services/ticketService.ts` — `createTicket()` checks `ticket:create` permission and starts a transaction
5. `src/repositories/ticketRepository.ts` — `createTicketRecord()` inserts the source-of-truth ticket row
6. `src/lib/search/document-builder.ts` — `buildTicketSearchDocument()` shapes the denormalized index payload
7. `src/repositories/searchSyncEventRepository.ts` — `enqueueSearchSyncEvent()` stores the outbox event
8. `src/repositories/tenantSearchStateRepository.ts` — `touchTenantSourceChange()` marks the tenant index as potentially stale
9. `src/repositories/indexingJobRepository.ts` — `ensureQueuedIncrementalJob()` coalesces background work
10. `src/repositories/auditLogRepository.ts` — `createAuditLog()` records the mutation
11. Returns `201` with the created ticket row

Request: Search across indexed documents
1. `src/app/api/search/route.ts` — `GET()` reads query params and calls `searchQuerySchema.parse()`
2. `src/lib/http/with-route-context.ts` — `withRouteContext()` builds request context
3. `src/lib/auth/session.ts` — `resolveSessionFromRequest()` verifies the user belongs to the tenant
4. `src/services/searchService.ts` — `searchDocuments()` checks `search:read`
5. `src/lib/search/query.ts` — `normalizeSearchQuery()` trims and normalizes request inputs
6. `src/repositories/tenantSearchStateRepository.ts` — `getTenantSearchState()` loads the active generation and `estimatePendingEventCount()` reports lag
7. `src/repositories/searchDocumentRepository.ts` — `searchIndexedDocuments()` runs the tenant-scoped full-text query against `search_documents`
8. Returns `200` with `{ items, total, page, pageSize, indexState }`

Request: Queue a safe rebuild
1. `src/app/api/indexing-jobs/rebuild/route.ts` — `POST()` parses JSON with `rebuildIndexSchema.parse()`
2. `src/lib/http/with-route-context.ts` — auth and error wrapper
3. `src/lib/auth/session.ts` — membership verification
4. `src/services/indexingService.ts` — `requestIndexRebuild()` checks `indexing-job:rebuild`
5. `src/repositories/tenantSearchStateRepository.ts` — `getTenantSearchState()` checks for an existing rebuild and `startTenantRebuild()` reserves the next generation
6. `src/repositories/indexingJobRepository.ts` — `enqueueIndexingJob()` stores a durable rebuild job
7. `src/repositories/auditLogRepository.ts` — `createAuditLog()` records the admin action
8. Returns `202` with the queued job

Request: Reject a viewer trying to create a ticket
1. `src/app/api/tickets/route.ts` — `POST()` parses request JSON
2. `src/lib/http/with-route-context.ts` — auth context is built successfully
3. `src/services/ticketService.ts` — `createTicket()` calls `requirePermission(context, "ticket:create")`
4. `src/lib/permissions/roles.ts` — `requirePermission()` throws `ForbiddenError` because `VIEWER` is below `AGENT`
5. `src/lib/http/responses.ts` — `handleRouteError()` maps the exception to JSON
6. Returns `403` with `{ ok: false, error: { code: "FORBIDDEN", ... } }`


## Ordering note

In every route the order is: `withRouteContext()` authenticates first, then the handler parses the body. For example `src/app/api/tickets/route.ts:22-28` calls `withRouteContext(request, async (context) => { const body = createTicketSchema.parse(...) ... })`. The traces above list parsing as step 1 for readability, but an unauthenticated request is rejected with 401 before its body is read. A `ZodError` thrown by the parse is mapped to 400 `VALIDATION_ERROR` by `handleRouteError()` (`src/lib/http/responses.ts:16-29`).

## Request: Run pending indexing jobs (with line numbers)

This is the only request that changes `search_documents`, so it is worth knowing exactly.

1. `src/app/api/indexing-jobs/run-pending/route.ts:12-18` — `withRouteContext()`, then `runPendingJobsSchema.parse()` (`limit` 1-20, default 5, `src/lib/validation/indexingSchemas.ts:16-19`).
2. `src/services/indexingJobRunner.ts:33` — `requirePermission(context, "indexing-job:run")`, minimum `OWNER`.
3. `indexingJobRunner.ts:35` — `listQueuedIndexingJobs(limit)`: oldest `QUEUED` jobs **across all tenants** (`src/repositories/indexingJobRepository.ts:61-68`).
4. For each job, sequentially (`indexingJobRunner.ts:39-59`):
   1. `markIndexingJobRunning(job.id)` — unconditional update (`indexingJobRepository.ts:70-81`).
   2. `INCREMENTAL` → `runIncrementalJob(job.tenantId)` (`indexingJobRunner.ts:67-96`):
      - read tenant state; read up to 200 events with `processedAt IS NULL` and `id > cursor`;
      - map each event's stored payload to a row in the **active** generation;
      - one multi-row upsert; then mark those events processed; then advance the cursor. Three statements, no transaction.
   3. `REBUILD` → `runRebuildJob(job.tenantId, job.generation!, job.entityTypes)` (`:98-130`):
      - read the full ticket and/or directory-user snapshot for the tenant;
      - upsert every document into the **new** generation (outside any transaction);
      - in one transaction: set `activeGeneration = new`, clear `rebuildingGeneration`, delete all documents of the old generation.
   4. Success → `markIndexingJobCompleted()`; any thrown error → `markIndexingJobFailed()` with the message.
5. Returns `200` with `{ processed, results: [{ jobId, status }] }` — including other tenants' job ids (finding T1).

**Duration.** The whole loop runs inside the HTTP request. A rebuild of a large tenant holds the request open for as long as it takes to read and upsert every row.

## What happens when it fails part-way

| Crash or error point | State left behind | Recovers by itself? |
| --- | --- | --- |
| After `markIndexingJobRunning`, before work | job `RUNNING` forever (nothing lists `RUNNING` jobs) | No. And `ensureQueuedIncrementalJob()` treats a `RUNNING` incremental job as "already queued" (`indexingJobRepository.ts:41`), so **no new incremental job is created for that tenant** until someone fixes the row. |
| Incremental: after upsert, before marking events | documents updated, events still pending | Yes, the next run re-applies the same payloads (upsert is idempotent for identical rows). |
| Incremental: after marking events, before cursor update | events processed, cursor behind | Yes; the processed events are excluded by `processedAt IS NULL`. |
| Rebuild: during the new-generation upserts | partial new generation; `rebuildingGeneration` still set | No. Job is `FAILED`, and every later rebuild request returns 409 (finding T3). |
| Rebuild: inside the cutover transaction | rolled back as a unit | The cutover itself is safe; the job is marked `FAILED` and T3 applies. |
