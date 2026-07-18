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
