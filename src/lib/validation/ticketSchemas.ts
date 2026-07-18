/**
 * This file defines the request validation boundary for ticket APIs.
 * Route handlers call these schemas before touching service code.
 * Service logic in `src/services/ticketService.ts` consumes the parsed output.
 * A junior engineer would likely validate only on the client and let invalid status or priority values hit the database.
 */
import { z } from "zod";

export const createTicketSchema = z.object({
  title: z.string().min(5).max(180),
  // ⚠️ SENIOR NOTE: Minimum descriptive length is intentional because the same text feeds both agent workflow and search relevance.
  description: z.string().min(20).max(4000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  assigneeUserId: z.string().uuid().nullable().optional()
});

export const updateTicketStatusSchema = z
  .object({
    nextStatus: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
  })
  .strict();

export const ticketListSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10)
});
