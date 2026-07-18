import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequestContext } from "@/lib/testing/fakes";

const transactionMock = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({}));
const findTicketByIdMock = vi.fn();
const updateTicketStatusRecordMock = vi.fn();

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
  findTicketById: findTicketByIdMock,
  listTicketSnapshotForTenant: vi.fn(),
  listTicketsByTenant: vi.fn(),
  updateTicketStatusRecord: updateTicketStatusRecordMock
}));

vi.mock("@/repositories/searchSyncEventRepository", () => ({
  enqueueSearchSyncEvent: vi.fn()
}));

vi.mock("@/repositories/tenantSearchStateRepository", () => ({
  touchTenantSourceChange: vi.fn()
}));

describe("updateTicketStatus", () => {
  beforeEach(() => {
    transactionMock.mockClear();
    findTicketByIdMock.mockReset();
    updateTicketStatusRecordMock.mockReset();
  });

  it("rejects an invalid CLOSED -> OPEN transition before persisting anything", async () => {
    // This matters because silent invalid transitions create impossible workflow states that reporting and automation can no longer trust.
    const { updateTicketStatus } = await import("@/services/ticketService");

    findTicketByIdMock.mockResolvedValue({
      id: "ticket_1",
      tenantId: "tenant_1",
      status: "CLOSED"
    });

    await expect(
      updateTicketStatus(buildRequestContext(), "ticket_1", {
        nextStatus: "OPEN"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT"
    });

    expect(updateTicketStatusRecordMock).not.toHaveBeenCalled();
  });
});
