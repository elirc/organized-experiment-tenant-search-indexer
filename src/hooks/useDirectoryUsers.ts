"use client";

/**
 * This file owns directory-user page API reads and writes.
 * `src/app/directory-users/page.tsx` calls it.
 * It calls the browser fetch client and keeps list/search/index-job caches coherent after writes.
 * A junior engineer would likely remember to invalidate the list cache but forget the search index operational views.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/http/client";

export function useDirectoryUsers(page = 1) {
  return useQuery({
    queryKey: ["directory-users", page],
    queryFn: () => apiFetch(`/api/directory-users?page=${page}&pageSize=10`)
  });
}

export function useCreateDirectoryUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      email: string;
      displayName: string;
      department?: string | null;
      title?: string | null;
      notes: string;
    }) =>
      apiFetch("/api/directory-users", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["directory-users"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
        queryClient.invalidateQueries({ queryKey: ["indexing-jobs"] })
      ]);
    }
  });
}
