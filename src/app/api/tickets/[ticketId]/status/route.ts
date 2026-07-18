/**
 * This file exposes ticket status transitions.
 * It is called by `src/hooks/useTickets.ts`.
 * It calls request context resolution, status validation, and `src/services/ticketService.ts`.
 * A junior engineer would likely treat status changes as a generic PATCH and forget the workflow-specific validation boundary.
 */
import { ok } from "@/lib/http/responses";
import { withRouteContext } from "@/lib/http/with-route-context";
import { updateTicketStatusSchema } from "@/lib/validation/ticketSchemas";
import { updateTicketStatus } from "@/services/ticketService";

export async function PATCH(
  request: Request,
  contextValue: {
    params: Promise<{ ticketId: string }>;
  }
) {
  return withRouteContext(request, async (context) => {
    const params = await contextValue.params;
    const body = updateTicketStatusSchema.parse(await request.json());
    const ticket = await updateTicketStatus(context, params.ticketId, body);

    return ok(ticket);
  });
}
