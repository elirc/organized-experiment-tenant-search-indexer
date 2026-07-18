/**
 * This file exposes directory user list and create endpoints.
 * It is called by `src/hooks/useDirectoryUsers.ts`.
 * It calls request context resolution, validation, and `src/services/directoryUserService.ts`.
 * A junior engineer would likely skip pagination for a "small" table and create an endpoint that ages badly.
 */
import { z } from "zod";

import { ok } from "@/lib/http/responses";
import { withRouteContext } from "@/lib/http/with-route-context";
import { createDirectoryUserSchema } from "@/lib/validation/directoryUserSchemas";
import { createDirectoryUser, listDirectoryUsers } from "@/services/directoryUserService";

const listDirectoryUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10)
});

export async function GET(request: Request) {
  return withRouteContext(request, async (context) => {
    const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
    const input = listDirectoryUsersSchema.parse(searchParams);
    const result = await listDirectoryUsers(context, input);

    return ok(result);
  });
}

export async function POST(request: Request) {
  return withRouteContext(request, async (context) => {
    const body = createDirectoryUserSchema.parse(await request.json());
    const directoryUser = await createDirectoryUser(context, body);

    return ok(directoryUser, { status: 201 });
  });
}
