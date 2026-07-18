import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";

const features = [
  "Tenant-scoped source tables and tenant-aware authorization",
  "Dedicated search documents, sync events, and job tracking",
  "Incremental indexing plus safe generation-based rebuilds",
  "Operational visibility into index lag and rebuild history"
];

export default function HomePage() {
  return (
    <AppShell
      title="Multi-Tenant Search + Indexing System"
      description="A production-style Next.js and Drizzle application that treats search as a real subsystem: denormalized documents, async sync events, background jobs, and explicit tenant-aware authorization."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title="What This Project Teaches" eyebrow="Architecture">
          <div className="space-y-4 text-sm leading-7 text-[var(--muted)]">
            <p>
              The source-of-truth tables for tickets and directory users are optimized for writes and correctness. Search reads hit a separate denormalized index so we can support filters, ranking, pagination, rebuilds, and stale-index visibility without distorting the source model.
            </p>
            <ul className="grid gap-3">
              {features.map((feature) => (
                <li key={feature} className="rounded-2xl border border-[var(--panel-border)] bg-white/80 px-4 py-3">
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>
        <SectionCard title="Explore The Flows" eyebrow="Product Surfaces">
          <div className="grid gap-3">
            {[
              { href: "/tickets", label: "Create tickets and drive incremental indexing" },
              { href: "/directory-users", label: "Add a second entity type into the shared index" },
              { href: "/search", label: "Search across tenants, entity types, and filters" },
              { href: "/indexing-jobs", label: "Queue rebuilds and run pending indexing jobs" }
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-[var(--panel-border)] bg-white px-4 py-4 text-sm font-medium transition hover:-translate-y-1 hover:border-[var(--accent)]"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
