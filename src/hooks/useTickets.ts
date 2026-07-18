"use client";

/**
 * This file owns ticket-page API reads and writes.
 * `src/app/tickets/page.tsx` calls it.
 * It calls the browser fetch client and invalidates ticket/search caches after mutations.
 * A junior engineer would likely forget cache invalidation and think their write path is broken.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/http/client";

export function useTickets(page = 1) {
  return useQuery({
    queryKey: ["tickets", page],
    queryFn: () => apiFetch(`/api/tickets?page=${page}&pageSize=10`)
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      title: string;
      description: string;
      priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      assigneeUserId?: string | null;
    }) =>
      apiFetch("/api/tickets", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tickets"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
        queryClient.invalidateQueries({ queryKey: ["indexing-jobs"] })
      ]);
    }
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { ticketId: string; nextStatus: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" }) =>
      apiFetch(`/api/tickets/${payload.ticketId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ nextStatus: payload.nextStatus })
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tickets"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
        queryClient.invalidateQueries({ queryKey: ["indexing-jobs"] })
      ]);
    }
  });
}
