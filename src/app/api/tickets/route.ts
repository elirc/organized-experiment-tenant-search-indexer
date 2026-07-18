/**
 * This file exposes ticket list and create endpoints.
 * It is called by `src/hooks/useTickets.ts`.
 * It calls request context resolution, ticket validation, and `src/services/ticketService.ts`.
 * A junior engineer would likely let GET and POST drift into separate authorization styles inside the same file.
 */
import { ok } from "@/lib/http/responses";
import { withRouteContext } from "@/lib/http/with-route-context";
import { createTicketSchema, ticketListSchema } from "@/lib/validation/ticketSchemas";
import { createTicket, listTickets } from "@/services/ticketService";

export async function GET(request: Request) {
  return withRouteContext(request, async (context) => {
    const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
    const input = ticketListSchema.parse(searchParams);
    const result = await listTickets(context, input);

    return ok(result);
  });
}

export async function POST(request: Request) {
  return withRouteContext(request, async (context) => {
    const body = createTicketSchema.parse(await request.json());
    const ticket = await createTicket(context, body);

    return ok(ticket, { status: 201 });
  });
}
