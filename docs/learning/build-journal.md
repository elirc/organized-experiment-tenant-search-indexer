# Build Journal

## Stage 1 — Project framing
Built: a multi-tenant search/indexing product shape with tickets and directory users as source entities, plus search docs, sync events, search state, jobs, and audit logs.
Decision: make multi-tenancy first-class because the requirements explicitly call for tenant isolation and tenant-aware indexing.
Why: it forces auth, repository scoping, and search-generation design to be explicit from the start.

## Stage 2 — Stack choice
Built: `package.json`, `tsconfig.json`, `next.config.ts`, `drizzle.config.ts`, and app scaffolding.
Decision: chose Next.js + TypeScript + PostgreSQL + Drizzle + Zod + React Query + REST.
Why: Drizzle was the only stack deviation from the defaults, chosen because `src/repositories/searchDocumentRepository.ts` benefits from explicit Postgres search SQL and generation-aware upserts.

## Stage 3 — Domain and schema
Built: `src/db/schema.ts` and `src/db/client.ts`.
Decision: separated source-of-truth tables from read-model tables.
Why: `tickets` and `directoryUsers` remain write-friendly, while `searchDocuments`, `searchSyncEvents`, `tenantSearchStates`, and `indexingJobs` support full-text search, eventual consistency, and rebuilds.

## Stage 4 — Auth, permissions, and tenant boundary
Built: `src/lib/auth/session.ts`, `src/lib/permissions/roles.ts`, `src/repositories/membershipRepository.ts`, and `src/lib/http/with-route-context.ts`.
Decision: resolve session once into a `RequestContext`, then require services to consume that context.
Why: it keeps auth and tenant identity out of UI code and out of repository call sites.

## Stage 5 — Source write services
Built: `src/services/ticketService.ts`, `src/services/directoryUserService.ts`, and their repositories.
Decision: source writes emit search sync events in the same transaction as the source write.
Why: it prevents the source table and indexing pipeline from diverging under partial failure.

## Stage 6 — Search and indexing subsystem
Built: `src/services/searchService.ts`, `src/services/indexingService.ts`, `src/services/indexingJobRunner.ts`, and supporting repositories.
Decision: use queued incremental jobs plus generation-based rebuilds.
Why: incremental jobs keep the index near-fresh during normal operation, and rebuild generations allow safe recovery from index drift or schema changes.

## Stage 7 — UI and hooks
Built: `src/app/**/page.tsx`, `src/hooks/*.ts`, and small UI components.
Decision: keep pages thin and query-driven.
Why: the point of the frontend is to exercise backend flows, not to bury them behind frontend abstractions.

## Stage 8 — Tests
Built: `tests/ticket-service.auth.test.ts`, `tests/ticket-schema.validation.test.ts`, `tests/ticket-status.transition.test.ts`, and `tests/search-service.tenant-isolation.test.ts`.
Decision: use a small service-boundary-focused test suite instead of broad snapshot coverage.
Why: these tests guard the classes of bugs most likely to create production incidents in this architecture.

## Decision Log

### Decision: ORM and database access style
Why it matters: search and indexing behavior depends on explicit Postgres capabilities and query control.
Options:
- Prisma: fast to scaffold, good CRUD ergonomics, but search/ranking/generation SQL becomes raw-query escape hatches.
- Drizzle: more SQL-shaped and slightly more verbose, but the query layer stays explicit and type-aware.
- Kysely: also strong for SQL-heavy code, but less aligned with the requested default stack.
Choice: Drizzle.
Why chosen: `src/repositories/searchDocumentRepository.ts` and `src/repositories/tenantSearchStateRepository.ts` need explicit SQL-shaped behavior often enough that Drizzle is the cleaner long-term fit.
What junior/mid/senior engineers notice:
- Junior: “Prisma looks easier.”
- Mid: “Search-specific SQL will leak out anyway.”
- Senior: “The friction should live where the real complexity lives, not be hidden behind escape hatches.”

### Decision: Search architecture
Why it matters: the whole system is about read optimization under eventual consistency.
Options:
- Query source tables directly: minimal write complexity, but weak search behavior and no safe rebuild path.
- Add a `search_text` column to each source table: cheaper than a dedicated index table, but hard to unify multiple entity types and rebuilds.
- Create a dedicated `search_documents` read model: more write complexity, but much cleaner reads and operational control.
Choice: dedicated `search_documents`.
Why chosen: it supports cross-entity search, per-tenant generations, filters, and stale-index reporting with fewer compromises.
What junior/mid/senior engineers notice:
- Junior: “This feels like duplicate data.”
- Mid: “We’re trading write complexity for read simplicity.”
- Senior: “That trade is justified because search is its own subsystem with its own operational needs.”

### Decision: Incremental sync mechanism
Why it matters: the index must survive partial failures and catch up later.
Options:
- Synchronous inline index writes only: simplest mental model, but slow writes and fragile coupling.
- Fire-and-forget async calls without persistence: looks simple, but loses work on crashes and gives poor observability.
- Durable sync-event outbox plus jobs: more tables, but much safer and more observable.
Choice: durable sync-event outbox plus jobs.
Why chosen: `src/repositories/searchSyncEventRepository.ts` and `src/repositories/indexingJobRepository.ts` make the eventual-consistency path explicit and recoverable.
What junior/mid/senior engineers notice:
- Junior: “That is a lot of extra tables.”
- Mid: “Those tables are buying retries and visibility.”
- Senior: “This is the minimum honest design once indexing becomes a real async workflow.”

### Decision: Rebuild strategy
Why it matters: the system must recover safely from drift or index-shape changes.
Options:
- Delete old docs and rebuild in place: simple, but readers see a partial index.
- Lock search during rebuild: safer than partial reads, but poor product behavior.
- Write a new generation and flip it when complete: more bookkeeping, best read safety.
Choice: generation-based rebuilds.
Why chosen: `src/services/indexingJobRunner.ts` can write `nextGeneration`, flip in `completeTenantRebuild()`, then remove the old generation.
What junior/mid/senior engineers notice:
- Junior: “Why not overwrite the same rows?”
- Mid: “Because readers need a stable generation.”
- Senior: “Cutover semantics are the real design problem, not the write loop.”

## PR Slices

### Slice 1 — Schema, auth context, and permissions
Purpose in one sentence: establish the data model and the request boundary before any feature logic lands.
Files with novel logic:
- `src/db/schema.ts`
- `src/lib/auth/session.ts`
- `src/repositories/membershipRepository.ts`
- `src/lib/permissions/roles.ts`
- `src/lib/http/with-route-context.ts`
Reviewer focus:
- `src/db/schema.ts`: verify the separation between source tables and indexing tables, especially `searchDocuments` and `tenantSearchStates`
- `src/lib/auth/session.ts`: verify membership is checked before the session is returned
- `src/lib/permissions/roles.ts`: verify the permission-to-role mapping
What a stronger reviewer would flag: any path that treats `tenantId` as trusted input instead of membership-derived context

### Slice 2 — Source entity writes and repository boundaries
Purpose in one sentence: build ticket and directory-user writes with explicit service/repository separation.
Files with novel logic:
- `src/services/ticketService.ts`
- `src/services/directoryUserService.ts`
- `src/repositories/ticketRepository.ts`
- `src/repositories/directoryUserRepository.ts`
- `src/lib/search/ticket-status.ts`
Reviewer focus:
- `src/services/ticketService.ts`: verify the transaction wraps source write + sync event + job enqueue
- `src/lib/search/ticket-status.ts`: verify the transition map matches the intended workflow
- `src/repositories/ticketRepository.ts`: verify every lookup and mutation scopes by `tenantId`
What a stronger reviewer would flag: any repository taking workflow responsibility away from the service layer

### Slice 3 — Search read model and incremental sync pipeline
Purpose in one sentence: build the denormalized search index and the event-driven path that keeps it fresh.
Files with novel logic:
- `src/lib/search/document-builder.ts`
- `src/repositories/searchSyncEventRepository.ts`
- `src/repositories/searchDocumentRepository.ts`
- `src/repositories/tenantSearchStateRepository.ts`
- `src/services/searchService.ts`
Reviewer focus:
- `src/repositories/searchDocumentRepository.ts`: verify tenant + generation filters and conflict target
- `src/repositories/searchSyncEventRepository.ts`: verify pending-event reads and batch acknowledgement
- `src/services/searchService.ts`: verify freshness metadata is derived from real state
What a stronger reviewer would flag: using source tables directly for search because “it works for now”

### Slice 4 — Job orchestration and safe rebuilds
Purpose in one sentence: make indexing work durable, observable, and rebuildable.
Files with novel logic:
- `src/repositories/indexingJobRepository.ts`
- `src/services/indexingService.ts`
- `src/services/indexingJobRunner.ts`
- `src/app/api/indexing-jobs/rebuild/route.ts`
- `src/app/api/indexing-jobs/run-pending/route.ts`
Reviewer focus:
- `src/services/indexingService.ts`: verify rebuild conflict handling before a new generation is reserved
- `src/services/indexingJobRunner.ts`: verify incremental and rebuild logic target the correct generation
- `src/repositories/indexingJobRepository.ts`: verify incremental job coalescing behavior
What a stronger reviewer would flag: rebuild code that writes into the active generation or runs inline in the request

### Slice 5 — UI surfaces, tests, and learning docs
Purpose in one sentence: expose the backend flows through pages and lock in the highest-risk behaviors with tests and code-anchored docs.
Files with novel logic:
- `src/app/search/page.tsx`
- `src/app/tickets/page.tsx`
- `src/app/indexing-jobs/page.tsx`
- `tests/ticket-service.auth.test.ts`
- `tests/ticket-status.transition.test.ts`
- `tests/search-service.tenant-isolation.test.ts`
- `docs/architecture/request-lifecycle.md`
- `docs/learning/flow-traces.md`
Reviewer focus:
- `src/app/search/page.tsx`: verify the page surfaces freshness metadata, not just hits
- `tests/search-service.tenant-isolation.test.ts`: verify the test guards tenant propagation at the service boundary
- `docs/learning/flow-traces.md`: verify traces match the actual file/function names
What a stronger reviewer would flag: frontend code that starts owning backend business rules instead of invoking them

## Retrospective: journal decisions checked against the shipped code

| Journal statement | What the code does | Evidence |
| --- | --- | --- |
| Incremental sync: "the index must survive partial failures and catch up later"; "Those tables are buying retries and visibility" | Visibility, yes (`indexing_jobs`, `pendingEventCount`). Retries, no: a `FAILED` job is never re-queued, and a batch that fails once fails every time (finding T2). | `src/repositories/indexingJobRepository.ts:98-107` |
| Rebuild: "write a new generation and flip it when complete" | Implemented, with an atomic flip. Not covered: failures before the flip (T3) and incremental writes during the rebuild (T4). | `src/services/indexingJobRunner.ts:98-130` |
| Slice 4: "a stronger reviewer would flag rebuild code that ... runs inline in the request" | The rebuild is queued rather than run by the *rebuild* request, but it then runs inline in the *run-pending* request. There is no separate worker. | `src/app/api/indexing-jobs/run-pending/route.ts:12-18` |
| Slice 4: "verify incremental job coalescing behavior" | Coalescing is select-then-insert with no unique constraint, and a job stuck in `RUNNING` blocks all new incremental jobs for its tenant. | `indexingJobRepository.ts:26-59` |
| Search architecture: "much cleaner reads and operational control" | Reads are clean. Performance depends on computing `to_tsvector` for every row of the tenant's generation per query, since no stored vector or GIN index exists. | `src/repositories/searchDocumentRepository.ts:70-79` |

The decisions were sound; the gaps are in the failure paths each decision implies. The findings list in `docs/architecture/README.md` is the to-do list a next slice would start from.
