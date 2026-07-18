import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequestContext } from "@/lib/testing/fakes";

const transactionMock = vi.fn();

vi.mock("@/db/client", () => ({
  db: {
    transaction: transactionMock
  }
}));

vi.mock("@/repositories/auditLogRepository", () => ({
  createAuditLog: vi.fn()
}));

vi.mock("@/repositories/indexingJobRepository", () => ({
  ensureQueuedIncrementalJob: vi.fn()
}));

vi.mock("@/repositories/ticketRepository", () => ({
  createTicketRecord: vi.fn(),
  findTicketById: vi.fn(),
  listTicketSnapshotForTenant: vi.fn(),
  listTicketsByTenant: vi.fn(),
  updateTicketStatusRecord: vi.fn()
}));

vi.mock("@/repositories/searchSyncEventRepository", () => ({
  enqueueSearchSyncEvent: vi.fn()
}));

vi.mock("@/repositories/tenantSearchStateRepository", () => ({
  touchTenantSourceChange: vi.fn()
}));

describe("createTicket authorization", () => {
  beforeEach(() => {
    transactionMock.mockReset();
  });

  it("rejects a viewer before any write transaction begins", async () => {
    // This matters because authorization bugs on write endpoints become real cross-role data mutation incidents in production.
    const { createTicket } = await import("@/services/ticketService");

    await expect(
      createTicket(
        buildRequestContext({
          session: {
            ...buildRequestContext().session,
            membershipRole: "VIEWER"
          }
        }),
        {
          title: "Payment retry loop is broken",
          description: "The customer remains stuck in a failed retry cycle after updating their billing details.",
          priority: "HIGH"
        }
      )
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN"
    });

    expect(transactionMock).not.toHaveBeenCalled();
  });
});
