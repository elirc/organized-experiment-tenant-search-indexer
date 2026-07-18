/**
 * This file renders the shared navigation and framing for the demo application.
 * Page components under `src/app/**/page.tsx` call it.
 * It does not call backend code directly; it structures the frontend shell around the query-driven pages.
 * A junior engineer would likely hide key product surfaces behind a generic dashboard and make backend flows harder to discover.
 */
import Link from "next/link";
import { Search, Ticket, Users, Workflow } from "lucide-react";

const navItems = [
  { href: "/", label: "Overview", icon: Workflow },
  { href: "/search", label: "Search", icon: Search },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/directory-users", label: "Directory Users", icon: Users },
  { href: "/indexing-jobs", label: "Indexing Jobs", icon: Workflow }
];

export function AppShell({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <div className="mb-8 rounded-[2rem] border border-[var(--panel-border)] bg-[var(--panel)] p-6 shadow-[var(--shadow)] backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-[var(--accent)]">Elasticsearch-lite</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p>
          </div>
          <nav className="flex flex-wrap gap-3">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-white px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:border-[var(--accent)]"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
