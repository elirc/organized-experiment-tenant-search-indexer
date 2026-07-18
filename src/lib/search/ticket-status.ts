/**
 * This file defines valid ticket state transitions.
 * It is called by `src/services/ticketService.ts`.
 * It does not depend on persistence, which makes transition rules easy to test in isolation.
 * A junior engineer would likely allow any enum-to-enum update and accidentally permit impossible workflows.
 */
import type { TicketStatus } from "@/db/schema";

const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "CLOSED"],
  IN_PROGRESS: ["RESOLVED", "OPEN"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: []
};

export function canTransitionTicketStatus(currentStatus: TicketStatus, nextStatus: TicketStatus) {
  // ⚠️ SENIOR NOTE: State transitions are explicit data, not switch-case sprawl, so reviewers can reason about workflow changes in one place.
  return allowedTransitions[currentStatus].includes(nextStatus);
}
