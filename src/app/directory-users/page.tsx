"use client";

/**
 * This file renders the second searchable entity type so the shared-index design is visible in the UI.
 * It is a user-facing page and calls `src/hooks/useDirectoryUsers.ts`.
 * It keeps form state local and leaves indexing-side denormalization to the backend.
 * A junior engineer would likely assume a second entity type means a second search system instead of a shared document model.
 */
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { useCreateDirectoryUser, useDirectoryUsers } from "@/hooks/useDirectoryUsers";

export default function DirectoryUsersPage() {
  const directoryUsers = useDirectoryUsers();
  const createDirectoryUser = useCreateDirectoryUser();
  const [form, setForm] = useState({
    email: "",
    displayName: "",
    department: "",
    title: "",
    notes: ""
  });

  return (
    <AppShell
      title="Directory Users"
      description="This page demonstrates that the index spans multiple source entities. Directory users are persisted in their own table, transformed into the same search document shape, and filtered by the same tenant boundary."
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Add Directory User" eyebrow="Second Entity Type">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              createDirectoryUser.mutate(form);
            }}
          >
            {[
              { key: "displayName", placeholder: "Jordan Rivera" },
              { key: "email", placeholder: "jordan@acme.example" },
              { key: "department", placeholder: "Revenue Operations" },
              { key: "title", placeholder: "Senior Customer Analyst" }
            ].map((field) => (
              <input
                key={field.key}
                value={form[field.key as keyof typeof form]}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-3"
                placeholder={field.placeholder}
              />
            ))}
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              className="min-h-32 rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-3"
              placeholder="Add notes that should become searchable in the read model."
            />
            <button className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white">
              {createDirectoryUser.isPending ? "Saving..." : "Save Directory User"}
            </button>
            {createDirectoryUser.error ? (
              <p className="text-sm text-[var(--danger)]">{createDirectoryUser.error.message}</p>
            ) : null}
          </form>
        </SectionCard>
        <SectionCard title="Tenant Directory" eyebrow="Source Records">
          <div className="grid gap-3">
            {directoryUsers.isLoading ? <p className="text-sm text-[var(--muted)]">Loading directory...</p> : null}
            {directoryUsers.error ? <p className="text-sm text-[var(--danger)]">{directoryUsers.error.message}</p> : null}
            {Array.isArray(directoryUsers.data?.items) &&
              directoryUsers.data.items.map((user: any) => (
                <article key={user.id} className="rounded-2xl border border-[var(--panel-border)] bg-white p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="font-semibold">{user.displayName}</h3>
                      <p className="text-sm text-[var(--muted)]">{user.email}</p>
                    </div>
                    <span className="rounded-full bg-[var(--background)] px-3 py-1 text-xs font-semibold">
                      {user.department ?? "No department"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{user.notes}</p>
                </article>
              ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
