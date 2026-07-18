/**
 * This file defines the browser-side API client used by React Query hooks.
 * Client hooks call it so auth headers and response-shape handling stay consistent.
 * It calls the REST APIs under `src/app/api/**/route.ts`.
 * A junior engineer would likely duplicate fetch boilerplate in every hook and eventually ship inconsistent auth headers.
 */
const demoHeaders = {
  "x-demo-user-id": process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "11111111-1111-1111-1111-111111111111",
  "x-demo-tenant-id": process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
};

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...demoHeaders,
      ...init?.headers
    },
    cache: "no-store"
  });

  const payload = (await response.json()) as
    | { ok: true; data: T }
    | { ok: false; error: { message: string } };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Request failed" : payload.error.message);
  }

  return payload.data;
}
