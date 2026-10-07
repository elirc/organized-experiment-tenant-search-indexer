# Tenant Search Indexer

This project is a production-style multi-tenant search and indexing system built with Next.js, TypeScript, Drizzle, PostgreSQL, Zod, and React Query. The source-of-truth domain lives in `src/repositories/ticketRepository.ts` and `src/repositories/directoryUserRepository.ts`, while search reads come from the denormalized index in `src/repositories/searchDocumentRepository.ts`.

Top-level folder map:

- `src/app/` contains the Next.js entry points. API handlers such as `src/app/api/search/route.ts` are intentionally thin and hand work to the service layer. UI pages such as `src/app/search/page.tsx` trigger the flows without owning business rules.
- `src/services/` contains business orchestration. `src/services/ticketService.ts` owns ticket write rules, `src/services/searchService.ts` owns search reads and freshness reporting, and `src/services/indexingJobRunner.ts` owns async indexing execution.
- `src/repositories/` contains tenant-scoped persistence logic. Every read of tenant-owned records scopes by `tenantId` (the job-queue functions in `src/repositories/indexingJobRepository.ts` are the exception; see finding T1 below), for example in `src/repositories/ticketRepository.ts` and `src/repositories/searchDocumentRepository.ts`.
- `src/lib/` contains cross-cutting boundaries. Auth resolution is in `src/lib/auth/session.ts`, authorization is in `src/lib/permissions/roles.ts`, validation is in `src/lib/validation/*.ts`, and search read-model shaping is in `src/lib/search/document-builder.ts`.
- `src/db/` contains the database layer. `src/db/schema.ts` defines both source tables and search/indexing tables, while `src/db/client.ts` provides the shared Drizzle client.
- `tests/` contains the purposeful safety net. `tests/ticket-service.auth.test.ts` checks RBAC rejection, `tests/ticket-status.transition.test.ts` checks workflow correctness, and `tests/search-service.tenant-isolation.test.ts` checks tenant context propagation.
- `docs/architecture/` explains how the codebase is shaped.
- `docs/learning/` explains how to read the codebase like a stronger backend engineer, using actual file/function traces.

The important architectural move is that search is not treated as “just another query.” Source writes emit durable sync events through `src/repositories/searchSyncEventRepository.ts`, async jobs are tracked in `src/repositories/indexingJobRepository.ts`, and safe rebuilds cut over with generations tracked in `src/repositories/tenantSearchStateRepository.ts`.


## Running it (from `package.json` and `drizzle.config.ts`)

- `npm run dev` starts Next.js. There is **no background worker**: queued indexing jobs run only when someone calls `POST /api/indexing-jobs/run-pending` (the "run pending" button in `src/app/indexing-jobs/page.tsx` via `src/hooks/useIndexingJobs.ts`). Until then, new tickets are in the database but not in search results.
- `npm run db:generate` / `db:migrate` use `drizzle.config.ts`, which writes migrations to `./drizzle`. That folder is **not committed**, so a fresh clone must run `db:generate` before `db:migrate`.
- `npm run db:seed` (`src/db/seed.ts`) creates one tenant (`aaaaaaaa-...`), one user (`11111111-...`) with membership role `OWNER`, sample rows, a `tenant_search_states` row and generation-1 search documents.
- The browser client sends those two ids as `x-demo-user-id` / `x-demo-tenant-id` by default (`src/lib/http/client.ts:8-9`), so every browser session acts as that owner unless the `NEXT_PUBLIC_DEMO_*` variables are set.

## What the "indexer" guarantees (verified)

The project name promises indexing infrastructure. This table states what the code actually provides. Line numbers refer to this commit.

| Property | Implemented? | Evidence |
| --- | --- | --- |
| Source write and sync event commit atomically (transactional outbox) | **Yes** | `createTicket()` writes ticket, event, staleness marker, job and audit row in one `db.transaction` (`src/services/ticketService.ts:40-90`); same pattern in `updateTicketStatus()` (`:113-167`) and `createDirectoryUser()` |
| Search is tenant-scoped | **Yes for every read path** | `searchIndexedDocuments()` filters `tenantId`, `generation`, `isDeleted` (`src/repositories/searchDocumentRepository.ts:74-83`) |
| Full-text ranking | **Yes, computed per query** | `to_tsvector('english', title || ' ' || body)` and `ts_rank` are evaluated at query time (`searchDocumentRepository.ts:70-72`). There is no stored `tsvector` column and no GIN index in `src/db/schema.ts`, so each search scans every document in the tenant's active generation. |
| Background processing | **No.** Jobs are processed inside an HTTP request | `runPendingIndexingJobs()` (`src/services/indexingJobRunner.ts:32-65`) is called only from `src/app/api/indexing-jobs/run-pending/route.ts:12-18` |
| Exclusive job claim | **No.** List then unconditional update | `listQueuedIndexingJobs()` selects `QUEUED` rows (`src/repositories/indexingJobRepository.ts:61-68`); `markIndexingJobRunning()` updates `where id = ?` with no status condition (`:70-81`). Two concurrent run-pending calls can execute the same job. |
| Retry of failed jobs | **No.** `FAILED` is terminal and nothing re-queues it | `markIndexingJobFailed()` (`indexingJobRepository.ts:98-107`); no code reads `FAILED` jobs |
| Incremental processing is atomic | **No.** Three separate statements, no transaction | upsert documents, mark events processed, advance cursor (`indexingJobRunner.ts:91-95`) |
| Upserts are version-guarded | **No.** `sourceVersion` is stored but the `ON CONFLICT` overwrites unconditionally | `searchDocumentRepository.ts:35-50` |
| Deletes | **No delete path exists.** `DELETE` is in the enum and handled by the runner (`indexingJobRunner.ts:87`), but no service ever enqueues a `DELETE` event and there are no delete routes | `grep -rn '"DELETE"' src` |
| Zero-downtime rebuild via generations | **Mostly.** Cutover and old-generation delete share a transaction (`indexingJobRunner.ts:125-129`), but see findings T3 and T4 | |

## Verified findings

"Reproduced" = logic copied into a scratch Node script and run. "Traced" = read through the code; demonstrating it needs PostgreSQL.

- **T1: one tenant OWNER processes every tenant's jobs (Traced).** `indexing-job:run` requires tenant role `OWNER` (`src/lib/permissions/roles.ts:34`), but `listQueuedIndexingJobs(limit)` has no `tenantId` filter (`indexingJobRepository.ts:61-68`). An owner of tenant A who calls run-pending executes queued jobs for tenants B and C, and the response lists their job ids and statuses (`indexingJobRunner.ts:54-63`). This is the one place where the "every query scopes by tenant" rule in this README does not hold.
- **T2: a ticket changed twice between runs wedges incremental indexing for its tenant (Traced, relies on documented PostgreSQL behaviour).** Each change appends an event with the full document (`ticketService.ts:58-68`, `:136-146`). `runIncrementalJob()` maps up to 200 pending events to rows and upserts them in **one** `INSERT ... ON CONFLICT DO UPDATE` (`indexingJobRunner.ts:75-91`, `searchDocumentRepository.ts:32-51`). If two events share `(tenantId, entityType, entityId, generation)`, PostgreSQL rejects the statement ("ON CONFLICT DO UPDATE command cannot affect row a second time"). The job is marked `FAILED`; the events stay unprocessed and the cursor does not move, so every later incremental job reads the same batch and fails the same way. Creating a ticket and then changing its status before anyone runs the jobs is enough. A scratch model confirmed the two rows produce one distinct conflict key.
- **T3: a failed rebuild blocks all future rebuilds (Traced).** `startTenantRebuild()` sets `rebuildingGeneration` (`src/repositories/tenantSearchStateRepository.ts:66-80`); only `completeTenantRebuild()` clears it (`:82-92`). If the rebuild job throws, `markIndexingJobFailed()` records the error but leaves `rebuildingGeneration` set, and every later `requestIndexRebuild()` returns 409 "A rebuild is already in progress" (`src/services/indexingService.ts:26-30`). Recovery needs manual SQL.
- **T4: changes indexed during a rebuild can vanish at cutover (Traced).** The rebuild snapshots source rows (`indexingJobRunner.ts:105-123`), then flips. Incremental jobs always write to the *active* generation (`:86`). An event processed after the snapshot but before the flip lands in the old generation, which the flip deletes (`:128`); the new generation holds the older snapshot. The cursor has already advanced past that event, so it is not replayed. The document stays stale until the entity changes again.
- **T5: identity is an unauthenticated header (Traced).** `resolveSessionFromRequest()` trusts `x-demo-user-id` as the user's identity and only checks that this user is a member of the claimed tenant (`src/lib/auth/session.ts:17-34`). Anyone who knows a user id and a tenant id can act as that user. The header names say "demo"; treat this as a placeholder, not authentication.
- **T6: concurrent rebuild requests can both succeed (Traced).** `requestIndexRebuild()` reads state and checks `rebuildingGeneration` inside a transaction (`indexingService.ts:23-33`), but at PostgreSQL's default READ COMMITTED level two transactions can both read `null` and both enqueue a `REBUILD` job for the same generation number.

- **T7: the event cursor can skip a late-committing event (Traced).** `listPendingSearchSyncEvents()` filters `processedAt IS NULL` **and** `id > lastProcessedEventId` (`src/repositories/searchSyncEventRepository.ts:33-38`). Identity ids are handed out when a row is inserted, not when its transaction commits. If transaction A takes id 10, transaction B takes id 11 and commits first, and an incremental job runs in between, the cursor moves to 11. When A commits, event 10 is unprocessed but below the cursor, so it is never read. The `processedAt IS NULL` condition alone would have been enough; adding the cursor creates the gap.

## Open question (not verified)

Event payloads are stored as `jsonb` (`src/db/schema.ts`, `searchSyncEvents.payload`), so the `sortUpdatedAt: Date` built by `buildTicketSearchDocument()` comes back from the database as an ISO **string**. `runIncrementalJob()` spreads that payload straight into `upsertSearchDocuments()` (`indexingJobRunner.ts:75-91`), whose column is a Drizzle `timestamp` in `Date` mode. Whether that column accepts a string depends on the installed `drizzle-orm` version's value mapping. It could not be checked here because dependencies are not installed. If incremental jobs fail with a `toISOString` error, this is the place to look.

## About these docs

This revision expanded the docs by about 80% (about 5.5k to 9.8k words). The added material is limited to what roughly 3,250 lines of source and tests support; going further would have meant padding.
