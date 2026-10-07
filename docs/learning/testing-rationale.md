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

## Inventory (counted)

Four test files, one `it` each, all under `tests/` (`vitest.config.ts` sets `environment: "node"` and `tests/vitest.setup.ts` as setup). They use fakes or mocks; none touches PostgreSQL:

| File | `it(...)` title |
| --- | --- |
| `tests/search-service.tenant-isolation.test.ts` | passes the authenticated tenant into the repository query |
| `tests/ticket-schema.validation.test.ts` | rejects descriptions that are too short to be operationally useful |
| `tests/ticket-service.auth.test.ts` | rejects a viewer before any write transaction begins |
| `tests/ticket-status.transition.test.ts` | rejects an invalid CLOSED -> OPEN transition before persisting anything |

`src/services/indexingJobRunner.ts`, `indexingService.ts`, and every repository except through mocks are untested. All seven findings in `docs/architecture/README.md` live in that untested code.

## Dependency-free Check ladder (run for these docs)

Copy the named function into a scratch `.mjs` and run it with `node --test`. Outputs below are from that run; all five tests passed.

1. **Transitions** (`src/lib/search/ticket-status.ts:9-19`). *Goal:* list every status reachable from `OPEN`. **Check:** `reachable from OPEN: OPEN,IN_PROGRESS,CLOSED,RESOLVED`; `OPEN → RESOLVED` is `false`.
2. **Roles** (`src/lib/permissions/roles.ts:22-54`). *Goal:* confirm the platform-admin bypass and the unknown-role default. **Check:** a `VIEWER` who is `PLATFORM_ADMIN` passes `indexing-job:run`; `unknown role index: -1 hasAtLeastRole(SUPPORT,VIEWER)= false`.
3. **Normalisation** (`src/lib/search/query.ts:13-22`). **Check:** `"  reset   password "` → `"reset password"`, page 3 of 10 → offset `20`.
4. **Staleness** (`src/services/searchService.ts:42-44`). **Check:** no pending events and no timestamps → `false`; three pending → `true`.
5. **Batch keys** (model of `indexingJobRunner.ts:75-91`). *Goal:* show why two events for one ticket collide. **Check:** `batch keys: [ 'tenantA|TICKET|t1|1', 'tenantA|TICKET|t1|1' ] distinct: 1`.

## Tests worth adding (each would fail today)

1. Two events for the same entity in one incremental batch → job completes (T2). Needs PostgreSQL.
2. Run-pending as tenant A's owner does not touch tenant B's jobs (T1). Can use a repository fake.
3. Failed rebuild → a second rebuild request is accepted (T3).
4. Event committed with a lower id after the cursor advanced is still indexed (T7). Needs two real transactions.
