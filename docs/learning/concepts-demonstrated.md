# Concepts Demonstrated

## Service layer
Where to look: `src/services/ticketService.ts` — `createTicket()` owns permission checks, transaction scope, audit logging, and index sync side effects.
Also see: `src/services/indexingService.ts` for an admin workflow service instead of CRUD.
Risk if wrong: Routes become fat, business rules drift, and consistency side effects get missed.

## Repository pattern
Where to look: `src/repositories/ticketRepository.ts` — `findTicketById()` and `listTicketsByTenant()` isolate data access and tenant filters.
Also see: `src/repositories/searchDocumentRepository.ts` for a read-model-specific repository.
Risk if wrong: Tenant filters and query complexity leak into service code, making review harder.

## Zod validation boundary
Where to look: `src/app/api/tickets/route.ts` — `createTicketSchema.parse()` rejects bad input before the service is called.
Also see: `src/lib/validation/searchSchemas.ts` for bounded search input.
Risk if wrong: Invalid or abusive inputs reach business logic and persistence.

## Auth/session flow
Where to look: `src/lib/auth/session.ts` — `resolveSessionFromRequest()` converts request headers into a verified membership-backed session.
Also see: `src/repositories/membershipRepository.ts` for the membership lookup query.
Risk if wrong: Users can forge tenant identity and cross tenant boundaries.

## Role-based access control
Where to look: `src/lib/permissions/roles.ts` — `requirePermission()` maps operations to minimum roles.
Also see: `src/services/indexingJobRunner.ts` where `indexing-job:run` is enforced for the worker endpoint.
Risk if wrong: Low-privilege users gain access to write or operational endpoints.

## Status or state transitions
Where to look: `src/lib/search/ticket-status.ts` — `canTransitionTicketStatus()` defines allowed ticket state changes.
Also see: `src/services/ticketService.ts` where `updateTicketStatus()` enforces it before persistence.
Risk if wrong: Invalid workflow states enter the database and break automation/reporting.

## Audit logging
Where to look: `src/repositories/auditLogRepository.ts` — `createAuditLog()` persists mutation history.
Also see: `src/services/ticketService.ts` and `src/services/indexingService.ts` for the places that write audit entries.
Risk if wrong: Security-sensitive mutations become hard to investigate after incidents.

## Background job design
Where to look: `src/services/indexingJobRunner.ts` — `runPendingIndexingJobs()` separates queued-job orchestration from source writes.
Also see: `src/repositories/indexingJobRepository.ts` for durable job state.
Risk if wrong: Async work becomes invisible, non-retryable, or duplicates itself.

## Outbox/eventual consistency
Where to look: `src/repositories/searchSyncEventRepository.ts` — `enqueueSearchSyncEvent()` and `listPendingSearchSyncEvents()` create the durable sync pipeline.
Also see: `src/services/ticketService.ts` where source writes emit events in the same transaction.
Risk if wrong: The index silently drifts from the source of truth, especially around retries or deletes.

## Multi-tenancy
Where to look: `src/repositories/searchDocumentRepository.ts` — `searchIndexedDocuments()` scopes by `tenantId` and `activeGeneration`.
Also see: `src/repositories/ticketRepository.ts` and `src/lib/auth/session.ts` for the same boundary at write time and auth time.
Risk if wrong: Cross-tenant data leaks become possible.

## Read optimization vs write complexity
Where to look: `src/services/ticketService.ts` — `createTicket()` does more work on write because it emits events and queues indexing.
Also see: `src/services/searchService.ts` and `src/repositories/searchDocumentRepository.ts` for the simplified read path that benefits from that complexity.
Risk if wrong: Teams optimize only one side and either end up with slow reads or unmaintainable write logic.

## Safe rebuilds with generations
Where to look: `src/services/indexingService.ts` — `requestIndexRebuild()` reserves a new generation and queues durable work.
Also see: `src/services/indexingJobRunner.ts` — `runRebuildJob()` writes the new generation, flips it, then removes the old generation.
Risk if wrong: Rebuilds overwrite live data or expose half-built indexes to readers.


---

# Concepts in depth: mechanism, limit, check

Each concept above is expanded with how *this* code implements it, where the implementation stops, and a check. Checks marked *(run)* were executed with plain `node --test` on functions copied from the repo; all five scratch tests passed.

## Transactional outbox

**Mechanism.** The business row and the event that describes it commit together. In `createTicket()` the insert into `tickets` and the insert into `search_sync_events` share `tx` (`src/services/ticketService.ts:40-68`). If the transaction rolls back, neither exists, so the indexer can never see an event for a ticket that does not exist, nor miss an event for one that does.

**Limit.** An outbox is only half the pattern. The consumer here (`runIncrementalJob()`) is not transactional, has no claim, and uses a cursor that can skip late-committing events (findings T2, T7 in `docs/architecture/README.md`).

**Check.** Name the four other writes that ride in the same transaction as the ticket insert.
*Answer:* sync event, `touchTenantSourceChange()`, `ensureQueuedIncrementalJob()`, `createAuditLog()` (`ticketService.ts:58-87`).

## Read model with generations (blue/green index)

**Mechanism.** Search reads only `generation = activeGeneration` (`src/repositories/searchDocumentRepository.ts:77`). A rebuild writes generation N+1 alongside N, then flips the pointer and deletes N in one transaction (`src/services/indexingJobRunner.ts:125-129`). Readers see either all of N or all of N+1.

**Limit.** Changes processed incrementally *during* a rebuild go to N and are deleted at the flip (finding T4). A failed rebuild leaves `rebuildingGeneration` set forever (T3).

**Check.** Why must `deleteGenerationDocuments()` filter by tenant as well as generation?
*Answer:* every tenant starts at generation 1 (`src/db/schema.ts`, `activeGeneration` default 1), so "generation 1" exists for every tenant at once. The comment at `searchDocumentRepository.ts:127` says the same.

## Freshness reporting

**Mechanism.** `searchDocuments()` returns `indexState` with `pendingEventCount` and `isStale` (`src/services/searchService.ts:36-45`). `isStale` is true if any event is unprocessed or the last source change is newer than the last indexing.

**Check (run).** `isStale(0, { lastSourceChangeAt: null, lastIndexedAt: null })` is `false`; `isStale(3, ...)` is `true`. Note that after finding T2 wedges a tenant, `pendingEventCount` stays above zero, so the UI will correctly show "stale" forever. The signal works; nothing acts on it.

## Query normalisation and pagination

**Check (run).** `normalizeSearchQuery({ query: "  reset   password ", page: 3, pageSize: 10 })` returns `query: "reset password"` and `offset: 20` (`src/lib/search/query.ts:13-22`). The query text then goes to `websearch_to_tsquery('english', ...)` as a bound parameter (`searchDocumentRepository.ts:70`), so quotes, `OR` and `-term` in user input are interpreted as web-search syntax, not SQL.

## Status transitions as data

**Check (run).** From `OPEN`, every status is reachable (`OPEN,IN_PROGRESS,CLOSED,RESOLVED`), `OPEN → RESOLVED` directly is not allowed, `RESOLVED → IN_PROGRESS` (reopen) is allowed, and `CLOSED` has no exits (`src/lib/search/ticket-status.ts:9-14`).

**Limit.** The check-then-update in `updateTicketStatus()` reads the row and then updates it without a status condition or row lock (`ticketService.ts:114-128`). Two concurrent changes from `OPEN` (one to `IN_PROGRESS`, one to `CLOSED`) can both pass validation; the last write wins, and both emit events.

## Honesty note

Concepts the name "indexer" suggests but the code does not contain (a worker process, retries with backoff, dead-letter handling, a stored `tsvector` with a GIN index, delete propagation) are not taught here. See the guarantees table in `docs/architecture/README.md`.
