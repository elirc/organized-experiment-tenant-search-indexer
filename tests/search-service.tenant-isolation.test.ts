import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequestContext } from "@/lib/testing/fakes";

const searchIndexedDocumentsMock = vi.fn();
const getTenantSearchStateMock = vi.fn();
const estimatePendingEventCountMock = vi.fn();

vi.mock("@/repositories/searchDocumentRepository", () => ({
  searchIndexedDocuments: searchIndexedDocumentsMock
}));

vi.mock("@/repositories/tenantSearchStateRepository", () => ({
  estimatePendingEventCount: estimatePendingEventCountMock,
  getTenantSearchState: getTenantSearchStateMock
}));

describe("searchDocuments tenant isolation", () => {
  beforeEach(() => {
    searchIndexedDocumentsMock.mockReset();
    getTenantSearchStateMock.mockReset();
    estimatePendingEventCountMock.mockReset();
  });

  it("passes the authenticated tenant into the repository query", async () => {
    // This matters because dropping tenant context before the repository call is one of the fastest ways to leak one customer's data to another.
    const { searchDocuments } = await import("@/services/searchService");

    getTenantSearchStateMock.mockResolvedValue({
      activeGeneration: 3,
      rebuildingGeneration: null,
      lastIndexedAt: new Date("2026-04-12T10:00:00Z"),
      lastSourceChangeAt: new Date("2026-04-12T09:59:00Z")
    });
    estimatePendingEventCountMock.mockResolvedValue(0);
    searchIndexedDocumentsMock.mockResolvedValue({
      items: [],
      total: 0
    });

    await searchDocuments(
      buildRequestContext({
        session: {
          ...buildRequestContext().session,
          tenantId: "tenant_critical"
        }
      }),
      {
        query: "billing",
        sortBy: "relevance",
        sortDirection: "desc",
        page: 1,
        pageSize: 10
      }
    );

    expect(searchIndexedDocumentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_critical",
        activeGeneration: 3
      })
    );
  });
});
