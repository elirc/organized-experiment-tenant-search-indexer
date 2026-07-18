"use client";

/**
 * This file provides shared client-side providers for React Query.
 * `src/app/layout.tsx` calls it once at the app shell boundary.
 * It calls `@tanstack/react-query` primitives and exposes them to page-level hooks.
 * A junior engineer would likely recreate the QueryClient per render and lose cache stability.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
