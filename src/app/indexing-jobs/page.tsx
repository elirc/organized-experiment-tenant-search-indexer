"use client";

/**
 * This file renders the operational indexing controls and job history.
 * It is a user-facing admin page and calls `src/hooks/useIndexingJobs.ts`.
 * It leaves job orchestration to the backend and focuses on surfacing the async workflow clearly.
 * A junior engineer would likely omit an operational view entirely and make async failures invisible.
 */
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { useIndexingJobs, useRequestRebuild, useRunPendingJobs } from "@/hooks/useIndexingJobs";

export default function IndexingJobsPage() {
  const jobs = useIndexingJobs();
  const requestRebuild = useRequestRebuild();
  const runPendingJobs = useRunPendingJobs();

  return (
    <AppShell
      title="Indexing Jobs"
      description="Search consistency is eventual, so operations need first-class visibility. This page exposes the queued/running/completed rebuild and incremental jobs that keep the read model aligned with the source of truth."
    >
      <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <SectionCard title="Admin Actions" eyebrow="Async Workflow">
          <div className="grid gap-4">
            <button
              onClick={() => requestRebuild.mutate({ entityTypes: ["TICKET", "DIRECTORY_USER"] })}
              className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white"
            >
              {requestRebuild.isPending ? "Queueing rebuild..." : "Queue Safe Rebuild"}
            </button>
            <button
              onClick={() => runPendingJobs.mutate({ limit: 5 })}
              className="rounded-full border border-[var(--panel-border)] bg-white px-5 py-3 text-sm font-semibold"
            >
              {runPendingJobs.isPending ? "Running jobs..." : "Run Pending Jobs"}
            </button>
            {requestRebuild.error ? <p className="text-sm text-[var(--danger)]">{requestRebuild.error.message}</p> : null}
            {runPendingJobs.error ? <p className="text-sm text-[var(--danger)]">{runPendingJobs.error.message}</p> : null}
          </div>
        </SectionCard>
        <SectionCard title="Recent Jobs" eyebrow="Operational History">
          <div className="grid gap-3">
            {jobs.isLoading ? <p className="text-sm text-[var(--muted)]">Loading job history...</p> : null}
            {jobs.error ? <p className="text-sm text-[var(--danger)]">{jobs.error.message}</p> : null}
            {Array.isArray(jobs.data) &&
              jobs.data.map((job: any) => (
                <article key={job.id} className="rounded-2xl border border-[var(--panel-border)] bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">{job.type}</p>
                      <h3 className="mt-2 font-semibold">{job.status}</h3>
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        Generation: {job.generation ?? "active"} | Entity types: {job.entityTypes.join(", ")}
                      </p>
                    </div>
                    <span className="rounded-full bg-[var(--background)] px-3 py-1 text-xs font-semibold">
                      {new Date(job.createdAt).toLocaleString()}
                    </span>
                  </div>
                </article>
              ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
