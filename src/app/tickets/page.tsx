"use client";

/**
 * This file renders the ticket CRUD surface that feeds the incremental indexer.
 * It is a user-facing page and calls `src/hooks/useTickets.ts`.
 * It keeps UI concerns local and leaves writes, validation, and state transitions to the backend.
 * A junior engineer would likely implement status transitions locally here and diverge from the service-layer rules.
 */
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { useCreateTicket, useTickets, useUpdateTicketStatus } from "@/hooks/useTickets";

export default function TicketsPage() {
  const tickets = useTickets();
  const createTicket = useCreateTicket();
  const updateStatus = useUpdateTicketStatus();

  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "MEDIUM" as const
  });

  return (
    <AppShell
      title="Tickets"
      description="Ticket writes hit the source-of-truth table first, then emit a search sync event and queue an incremental indexing job. The page shows the write side separately from the search read model."
    >
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <SectionCard title="Create Ticket" eyebrow="Write Path">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              createTicket.mutate(form);
            }}
          >
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-3"
              placeholder="Payment failure during renewal"
            />
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-36 rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-3"
              placeholder="Describe the issue with enough detail for both the support team and the index."
            />
            <select
              value={form.priority}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  priority: event.target.value as "LOW" | "MEDIUM" | "HIGH" | "URGENT"
                }))
              }
              className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-3"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
            <button className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white">
              {createTicket.isPending ? "Creating..." : "Create Ticket"}
            </button>
            {createTicket.error ? <p className="text-sm text-[var(--danger)]">{createTicket.error.message}</p> : null}
          </form>
        </SectionCard>
        <SectionCard title="Ticket Backlog" eyebrow="Source Of Truth">
          <div className="grid gap-3">
            {tickets.isLoading ? <p className="text-sm text-[var(--muted)]">Loading tenant ticket backlog...</p> : null}
            {tickets.error ? <p className="text-sm text-[var(--danger)]">{tickets.error.message}</p> : null}
            {Array.isArray(tickets.data?.items) &&
              tickets.data.items.map((ticket: any) => (
                <article key={ticket.id} className="rounded-2xl border border-[var(--panel-border)] bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">{ticket.externalId}</p>
                      <h3 className="mt-2 font-semibold">{ticket.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{ticket.description}</p>
                    </div>
                    <div className="grid gap-2">
                      <span className="rounded-full bg-[var(--background)] px-3 py-1 text-xs font-semibold">
                        {ticket.status}
                      </span>
                      <select
                        defaultValue={ticket.status}
                        onChange={(event) =>
                          updateStatus.mutate({
                            ticketId: ticket.id,
                            nextStatus: event.target.value as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"
                          })
                        }
                        className="rounded-full border border-[var(--panel-border)] bg-white px-3 py-2 text-sm"
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>
                  </div>
                </article>
              ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
