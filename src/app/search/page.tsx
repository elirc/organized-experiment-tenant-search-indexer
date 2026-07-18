"use client";

/**
 * This file renders the search experience on top of the indexed document API.
 * It is a user-facing entry point and calls `src/hooks/useSearch.ts`.
 * It does not contain search business logic; it delegates that to the backend stack.
 * A junior engineer would likely fetch directly in effects here and make the request lifecycle harder to trace.
 */
import { useDeferredValue, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { useSearch } from "@/hooks/useSearch";

export default function SearchPage() {
  const [query, setQuery] = useState("billing failure");
  const [entityType, setEntityType] = useState("");
  const [status, setStatus] = useState("");
  const deferredQuery = useDeferredValue(query);

  const search = useSearch({
    query: deferredQuery,
    entityType: entityType || undefined,
    status: status || undefined,
    sortBy: "relevance",
    sortDirection: "desc",
    page: 1,
    pageSize: 10
  });

  return (
    <AppShell
      title="Federated Search"
      description="Search runs against the denormalized tenant index, not the source tables. That lets us keep reads fast, expose lag metrics, and rebuild safely without blocking the application."
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Query Controls" eyebrow="Request Input">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              Search text
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-3 outline-none ring-0"
                placeholder="Try a ticket title or a user's department"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Entity type
                <select
                  value={entityType}
                  onChange={(event) => setEntityType(event.target.value)}
                  className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-3"
                >
                  <option value="">All</option>
                  <option value="TICKET">Ticket</option>
                  <option value="DIRECTORY_USER">Directory User</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Ticket status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-3"
                >
                  <option value="">Any</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </label>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Index Health + Results" eyebrow="Read Path">
          {search.isLoading ? <p className="text-sm text-[var(--muted)]">Searching the active generation...</p> : null}
          {search.error ? <p className="text-sm text-[var(--danger)]">{search.error.message}</p> : null}
          {search.data ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-3 text-sm">
                  <p className="text-[var(--muted)]">Active generation</p>
                  <p className="mt-1 text-xl font-semibold">{search.data.indexState.activeGeneration}</p>
                </div>
                <div className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-3 text-sm">
                  <p className="text-[var(--muted)]">Pending events</p>
                  <p className="mt-1 text-xl font-semibold">{search.data.indexState.pendingEventCount}</p>
                </div>
                <div className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-3 text-sm">
                  <p className="text-[var(--muted)]">Index status</p>
                  <p className="mt-1 text-xl font-semibold">
                    {search.data.indexState.isStale ? "Lagging behind source" : "Fresh enough for reads"}
                  </p>
                </div>
              </div>
              <div className="grid gap-3">
                {search.data.items.map((item) => (
                  <article key={item.entityId} className="rounded-2xl border border-[var(--panel-border)] bg-white p-4">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-semibold">{item.title}</h3>
                      <span className="rounded-full bg-[var(--background)] px-3 py-1 text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                        {item.entityType}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{item.body}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Enter a query to hit the indexed read model.</p>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
