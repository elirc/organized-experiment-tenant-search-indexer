export type PlatformRole = "PLATFORM_ADMIN" | "PLATFORM_USER";
export type MembershipRole = "OWNER" | "ADMIN" | "AGENT" | "VIEWER";

export type AuthenticatedSession = {
  userId: string;
  userName: string;
  userEmail: string;
  platformRole: PlatformRole;
  tenantId: string;
  tenantName: string;
  membershipRole: MembershipRole;
};

export type RequestContext = {
  requestId: string;
  session: AuthenticatedSession;
};
