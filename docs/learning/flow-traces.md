# Flow Traces

## Flow: Create ticket and emit incremental indexing work
1. `src/app/tickets/page.tsx` — ticket form submit calls `useCreateTicket().mutate()`
2. `src/hooks/useTickets.ts` — `useCreateTicket()` fires `POST /api/tickets`
3. `src/app/api/tickets/route.ts` — `POST()` route handler
4. `src/lib/http/with-route-context.ts` — `withRouteContext()` resolves auth and wraps errors
5. `src/lib/auth/session.ts` — `buildRequestContext()` -> `resolveSessionFromRequest()`
6. `src/repositories/membershipRepository.ts` — `findSessionMembership()` verifies tenant membership
7. `src/lib/validation/ticketSchemas.ts` — `createTicketSchema.parse()`
8. `src/services/ticketService.ts` — `createTicket()` applies permission checks and opens a transaction
9. `src/repositories/ticketRepository.ts` — `createTicketRecord()` inserts the source record
10. `src/lib/search/document-builder.ts` — `buildTicketSearchDocument()` creates the denormalized payload
11. `src/repositories/searchSyncEventRepository.ts` — `enqueueSearchSyncEvent()` stores the outbox event
12. `src/repositories/tenantSearchStateRepository.ts` — `touchTenantSourceChange()` marks potential lag
13. `src/repositories/indexingJobRepository.ts` — `ensureQueuedIncrementalJob()` coalesces background work
14. `src/repositories/auditLogRepository.ts` — `createAuditLog()` records the mutation
15. Returns created ticket JSON

## Flow: Reject low-privilege ticket creation
1. `src/app/tickets/page.tsx` — form submit triggers `useCreateTicket().mutate()`
2. `src/hooks/useTickets.ts` — `useCreateTicket()` fires `POST /api/tickets`
3. `src/app/api/tickets/route.ts` — `POST()` route handler
4. `src/lib/http/with-route-context.ts` — `withRouteContext()` builds context
5. `src/lib/auth/session.ts` — `resolveSessionFromRequest()` verifies membership
6. `src/services/ticketService.ts` — `createTicket()` calls `requirePermission(context, "ticket:create")`
7. `src/lib/permissions/roles.ts` — `requirePermission()` throws `ForbiddenError`
8. `src/lib/http/responses.ts` — `handleRouteError()` converts it into a `403` JSON response
9. Returns `{ ok: false, error }`

## Flow: Search indexed documents with freshness metadata
1. `src/app/search/page.tsx` — typing updates `useSearch(...)`
2. `src/hooks/useSearch.ts` — `useSearch()` fires `GET /api/search?...`
3. `src/app/api/search/route.ts` — `GET()` route handler
4. `src/lib/http/with-route-context.ts` — `withRouteContext()`
5. `src/lib/auth/session.ts` — `buildRequestContext()`
6. `src/lib/validation/searchSchemas.ts` — `searchQuerySchema.parse()`
7. `src/services/searchService.ts` — `searchDocuments()` checks permission and normalizes input
8. `src/lib/search/query.ts` — `normalizeSearchQuery()`
9. `src/repositories/tenantSearchStateRepository.ts` — `getTenantSearchState()` and `estimatePendingEventCount()`
10. `src/repositories/searchDocumentRepository.ts` — `searchIndexedDocuments()` runs the tenant-scoped full-text query
11. Returns `{ items, total, indexState }`

## Flow: Update ticket status with workflow validation
1. `src/app/tickets/page.tsx` — status select change triggers `useUpdateTicketStatus().mutate()`
2. `src/hooks/useTickets.ts` — `useUpdateTicketStatus()` fires `PATCH /api/tickets/[ticketId]/status`
3. `src/app/api/tickets/[ticketId]/status/route.ts` — `PATCH()` route handler
4. `src/lib/http/with-route-context.ts` — `withRouteContext()`
5. `src/lib/validation/ticketSchemas.ts` — `updateTicketStatusSchema.parse()`
6. `src/services/ticketService.ts` — `updateTicketStatus()` checks permission and loads the current ticket
7. `src/repositories/ticketRepository.ts` — `findTicketById()` fetches the tenant-scoped source row
8. `src/lib/search/ticket-status.ts` — `canTransitionTicketStatus()` validates the workflow transition
9. `src/repositories/ticketRepository.ts` — `updateTicketStatusRecord()` persists the new status
10. `src/lib/search/document-builder.ts` — `buildTicketSearchDocument()`
11. `src/repositories/searchSyncEventRepository.ts` — `enqueueSearchSyncEvent()`
12. `src/repositories/tenantSearchStateRepository.ts` — `touchTenantSourceChange()`
13. `src/repositories/indexingJobRepository.ts` — `ensureQueuedIncrementalJob()`
14. `src/repositories/auditLogRepository.ts` — `createAuditLog()`
15. Returns updated ticket JSON

## Flow: Run queued incremental indexing work
1. `src/app/indexing-jobs/page.tsx` — admin clicks “Run Pending Jobs”
2. `src/hooks/useIndexingJobs.ts` — `useRunPendingJobs()` fires `POST /api/indexing-jobs/run-pending`
3. `src/app/api/indexing-jobs/run-pending/route.ts` — `POST()` route handler
4. `src/lib/http/with-route-context.ts` — `withRouteContext()`
5. `src/lib/validation/indexingSchemas.ts` — `runPendingJobsSchema.parse()`
6. `src/services/indexingJobRunner.ts` — `runPendingIndexingJobs()` loads queued jobs and marks each `RUNNING`
7. `src/repositories/indexingJobRepository.ts` — `listQueuedIndexingJobs()` and `markIndexingJobRunning()`
8. `src/services/indexingJobRunner.ts` — `runIncrementalJob()`
9. `src/repositories/tenantSearchStateRepository.ts` — `getTenantSearchState()`
10. `src/repositories/searchSyncEventRepository.ts` — `listPendingSearchSyncEvents()`
11. `src/repositories/searchDocumentRepository.ts` — `upsertSearchDocuments()` writes into the active generation
12. `src/repositories/searchSyncEventRepository.ts` — `markSearchSyncEventsProcessed()`
13. `src/repositories/tenantSearchStateRepository.ts` — `recordIncrementalIndexProgress()`
14. `src/repositories/indexingJobRepository.ts` — `markIndexingJobCompleted()`
15. Returns processed job summary JSON

## Flow: Run safe rebuild with generation cutover
1. `src/app/indexing-jobs/page.tsx` — admin clicks “Queue Safe Rebuild”
2. `src/hooks/useIndexingJobs.ts` — `useRequestRebuild()` fires `POST /api/indexing-jobs/rebuild`
3. `src/app/api/indexing-jobs/rebuild/route.ts` — `POST()` route handler
4. `src/services/indexingService.ts` — `requestIndexRebuild()` reserves `nextGeneration` and creates a rebuild job
5. `src/app/indexing-jobs/page.tsx` — admin later clicks “Run Pending Jobs”
6. `src/hooks/useIndexingJobs.ts` — `useRunPendingJobs()` fires the worker endpoint
7. `src/services/indexingJobRunner.ts` — `runPendingIndexingJobs()` picks the rebuild job
8. `src/services/indexingJobRunner.ts` — `runRebuildJob()` reads `stateBeforeFlip`
9. `src/services/ticketService.ts` — `listTicketSearchSnapshot()` loads tenant source rows
10. `src/services/directoryUserService.ts` — `listDirectoryUserSearchSnapshot()` loads tenant source rows
11. `src/lib/search/document-builder.ts` — `buildTicketSearchDocument()` and `buildDirectoryUserSearchDocument()`
12. `src/repositories/searchDocumentRepository.ts` — `upsertSearchDocuments()` writes new-generation documents
13. `src/repositories/tenantSearchStateRepository.ts` — `completeTenantRebuild()` flips `activeGeneration`
14. `src/repositories/searchDocumentRepository.ts` — `deleteGenerationDocuments()` clears old-generation documents
15. `src/repositories/indexingJobRepository.ts` — `markIndexingJobCompleted()`
16. Returns processed job summary JSON
## Flow: Ticket changed twice before indexing (the wedge)

1. Agent creates ticket T. `createTicket()` commits ticket + event E1 (`src/services/ticketService.ts:40-90`). An incremental job J1 is queued.
2. Before anyone presses "run pending", the agent moves T to `IN_PROGRESS`. `updateTicketStatus()` commits event E2 for the same entity (`:113-167`). `ensureQueuedIncrementalJob()` finds J1 still `QUEUED` and reuses it (`src/repositories/indexingJobRepository.ts:33-48`).
3. Owner runs pending jobs. `runIncrementalJob()` reads `[E1, E2]` and builds two rows with the same `(tenant, TICKET, T, activeGeneration)` (`src/services/indexingJobRunner.ts:69-88`).
4. `upsertSearchDocuments()` sends both rows in one `INSERT ... ON CONFLICT DO UPDATE` (`src/repositories/searchDocumentRepository.ts:32-51`). PostgreSQL refuses to update the same target row twice in one statement.
5. The `catch` marks J1 `FAILED` (`indexingJobRunner.ts:55-58`). E1 and E2 stay unprocessed; the cursor does not move.
6. The next ticket change creates J2. J2 reads the same first events and fails the same way. The tenant's index never advances; `indexState.isStale` stays `true`.

**Fix sketch (not implemented):** de-duplicate the batch by entity before the upsert, keeping the event with the highest id, or upsert one row at a time.

## Flow: Rebuild fails half-way

1. Admin requests a rebuild. `startTenantRebuild()` sets `rebuildingGeneration = active + 1` (`src/repositories/tenantSearchStateRepository.ts:66-80`); a `REBUILD` job is queued (`src/services/indexingService.ts:35-44`).
2. Owner runs pending jobs. Ticket documents for N+1 are written; the directory-user snapshot query throws (for example, a dropped connection).
3. `markIndexingJobFailed()` stores the message. `rebuildingGeneration` is still N+1; partial N+1 documents remain in `search_documents` (harmless to search, which reads N).
4. Admin clicks rebuild again: `requestIndexRebuild()` sees `rebuildingGeneration` and returns 409 (`indexingService.ts:26-30`). There is no API to clear it.

## Debugging scenarios

**"I created a ticket but search can't find it."**
1. Check `indexState.pendingEventCount` in the search response. If above zero, jobs have not run. There is no worker: someone with `OWNER` must call run-pending.
2. If jobs ran and failed, read `indexing_jobs.error_message` via `GET /api/indexing-jobs` (ADMIN). An `ON CONFLICT ... a second time` message means the wedge flow above.
3. If no job is `QUEUED` and events are pending, look for an incremental job stuck in `RUNNING`; it blocks new ones (`indexingJobRepository.ts:41`).
4. Check the search terms: `websearch_to_tsquery('english', ...)` stems words and drops English stop words, so a query made only of stop words matches nothing.

**"Search shows a status that's out of date."**
Look for a rebuild that completed recently. A change indexed between the rebuild's snapshot and its cutover was written to the old generation and deleted (finding T4). Changing the ticket again re-indexes it.

**"Rebuild says one is already in progress, but nothing is running."**
Finding T3. Confirm with `SELECT rebuilding_generation FROM tenant_search_states WHERE tenant_id = ...` and the latest `REBUILD` job's status.
