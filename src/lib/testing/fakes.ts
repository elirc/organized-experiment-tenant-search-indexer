import type { RequestContext } from "@/types/auth";

export function buildRequestContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: "req_test",
    session: {
      userId: "user_1",
      userName: "Avery Agent",
      userEmail: "avery@example.com",
      platformRole: "PLATFORM_USER",
      tenantId: "tenant_1",
      tenantName: "Acme Support",
      membershipRole: "ADMIN"
    },
    ...overrides
  };
}
