import { describe, expect, it } from "vitest";

import { createTicketSchema } from "@/lib/validation/ticketSchemas";

describe("createTicketSchema", () => {
  it("rejects descriptions that are too short to be operationally useful", () => {
    // This matters because weak validation lets low-signal records into both the source table and the search index, which hurts operators later.
    const result = createTicketSchema.safeParse({
      title: "Too short description example",
      description: "Not enough detail",
      priority: "MEDIUM"
    });

    expect(result.success).toBe(false);
  });
});
