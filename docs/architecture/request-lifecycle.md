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
