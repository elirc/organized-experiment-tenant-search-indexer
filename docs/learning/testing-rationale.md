# Testing Rationale

## `tests/ticket-service.auth.test.ts` — viewer cannot create a ticket
This test matters because write-endpoint authorization bugs are not cosmetic. If `createTicket()` in `src/services/ticketService.ts` ever stops checking `ticket:create` before the transaction begins, low-privilege users can mutate tenant data and generate audit/index side effects.

The production bug it catches: RBAC drift where a route still exists and a UI hides the button, but the API is no longer actually protected.

A more complete production suite would add full route-level tests around `src/app/api/tickets/route.ts`, platform-admin bypass coverage from `src/lib/permissions/roles.ts`, and integration tests proving no write-side repository call fires on rejection.

## `tests/ticket-schema.validation.test.ts` — short ticket descriptions are rejected
This test matters because the same description text feeds both operational workflows and search relevance. A weak validation boundary in `src/lib/validation/ticketSchemas.ts` would let low-signal tickets into both the source table and the read model.

The production bug it catches: silently degraded data quality that makes search and human triage worse over time.

A more complete production suite would add route-level validation tests through `src/app/api/tickets/route.ts`, boundary tests for max lengths, and tests for invalid enum values.

## `tests/ticket-status.transition.test.ts` — CLOSED tickets cannot move back to OPEN
This test matters because workflow corruption is easy to create and hard to notice later. `updateTicketStatus()` in `src/services/ticketService.ts` is supposed to enforce `canTransitionTicketStatus()` from `src/lib/search/ticket-status.ts` before persistence.

The production bug it catches: invalid lifecycle states entering the database, breaking SLAs, automation, and reporting assumptions.

A more complete production suite would add happy-path transition tests, audit-log assertions, and integration coverage proving no sync event is emitted for rejected transitions.

## `tests/search-service.tenant-isolation.test.ts` — search service passes tenant scope to the repository
This test matters because a lot of multi-tenant leaks happen in the seam between “auth succeeded” and “query ran.” `searchDocuments()` in `src/services/searchService.ts` must pass the authenticated `tenantId` into `searchIndexedDocuments()` in `src/repositories/searchDocumentRepository.ts`.

The production bug it catches: dropping tenant context at the service boundary and returning another tenant’s indexed documents.

A more complete production suite would add real database integration tests covering `src/repositories/searchDocumentRepository.ts`, plus end-to-end API tests for `/api/search` with two seeded tenants.
