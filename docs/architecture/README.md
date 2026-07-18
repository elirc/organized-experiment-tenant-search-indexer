# Tenant Search Indexer

This project is a production-style multi-tenant search and indexing system built with Next.js, TypeScript, Drizzle, PostgreSQL, Zod, and React Query. The source-of-truth domain lives in `src/repositories/ticketRepository.ts` and `src/repositories/directoryUserRepository.ts`, while search reads come from the denormalized index in `src/repositories/searchDocumentRepository.ts`.

Top-level folder map:

- `src/app/` contains the Next.js entry points. API handlers such as `src/app/api/search/route.ts` are intentionally thin and hand work to the service layer. UI pages such as `src/app/search/page.tsx` trigger the flows without owning business rules.
- `src/services/` contains business orchestration. `src/services/ticketService.ts` owns ticket write rules, `src/services/searchService.ts` owns search reads and freshness reporting, and `src/services/indexingJobRunner.ts` owns async indexing execution.
- `src/repositories/` contains tenant-scoped persistence logic. Every query touching tenant-owned records scopes by `tenantId`, for example in `src/repositories/ticketRepository.ts` and `src/repositories/searchDocumentRepository.ts`.
- `src/lib/` contains cross-cutting boundaries. Auth resolution is in `src/lib/auth/session.ts`, authorization is in `src/lib/permissions/roles.ts`, validation is in `src/lib/validation/*.ts`, and search read-model shaping is in `src/lib/search/document-builder.ts`.
- `src/db/` contains the database layer. `src/db/schema.ts` defines both source tables and search/indexing tables, while `src/db/client.ts` provides the shared Drizzle client.
- `tests/` contains the purposeful safety net. `tests/ticket-service.auth.test.ts` checks RBAC rejection, `tests/ticket-status.transition.test.ts` checks workflow correctness, and `tests/search-service.tenant-isolation.test.ts` checks tenant context propagation.
- `docs/architecture/` explains how the codebase is shaped.
- `docs/learning/` explains how to read the codebase like a stronger backend engineer, using actual file/function traces.

The important architectural move is that search is not treated as “just another query.” Source writes emit durable sync events through `src/repositories/searchSyncEventRepository.ts`, async jobs are tracked in `src/repositories/indexingJobRepository.ts`, and safe rebuilds cut over with generations tracked in `src/repositories/tenantSearchStateRepository.ts`.
