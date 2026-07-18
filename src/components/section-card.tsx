/**
 * This file provides a small presentational wrapper for feature sections.
 * It is called by the page components in `src/app/**/page.tsx`.
 * It does not call the backend.
 * A junior engineer would likely repeat panel styling in every page and make UX polish expensive to maintain.
 */
export function SectionCard({
  title,
  eyebrow,
  children
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-[var(--panel-border)] bg-[var(--panel)] p-6 shadow-[var(--shadow)] backdrop-blur">
      {eyebrow ? <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">{eyebrow}</p> : null}
      <h2 className="mt-2 font-serif text-2xl font-semibold">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}
