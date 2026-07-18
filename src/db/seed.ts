/**
 * This file inserts demo data that matches the browser client's default session headers.
 * Developers call it manually through `package.json` scripts when they want a runnable local demo.
 * It calls `src/db/client.ts`, `src/db/schema.ts`, and the document builders for initial index rows.
 * A junior engineer would likely seed source rows but forget that the search index and tenant state need starter records too.
 */
import { db } from "@/db/client";
import {
  directoryUsers,
  memberships,
  searchDocuments,
  tenantSearchStates,
  tenants,
  tickets,
  users
} from "@/db/schema";
import { buildDirectoryUserSearchDocument, buildTicketSearchDocument } from "@/lib/search/document-builder";

const demoTenantId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const demoUserId = "11111111-1111-1111-1111-111111111111";

async function seed() {
  await db.insert(tenants).values({
    id: demoTenantId,
    name: "Acme Support",
    slug: "acme-support"
  }).onConflictDoNothing();

  await db.insert(users).values({
    id: demoUserId,
    email: "owner@acme.example",
    name: "Avery Owner",
    platformRole: "PLATFORM_USER"
  }).onConflictDoNothing();

  await db.insert(memberships).values({
    tenantId: demoTenantId,
    userId: demoUserId,
    role: "OWNER"
  }).onConflictDoNothing();

  const [ticket] = await db
    .insert(tickets)
    .values({
      tenantId: demoTenantId,
      externalId: "TCK-1001",
      title: "Billing retry loop fails after card update",
      description:
        "A recurring customer remains in a failed renewal state after updating their card. Support needs this indexed so similar incidents can be found quickly.",
      priority: "HIGH",
      createdByUserId: demoUserId
    })
    .onConflictDoNothing()
    .returning();

  const [directoryUser] = await db
    .insert(directoryUsers)
    .values({
      tenantId: demoTenantId,
      email: "jordan@acme.example",
      displayName: "Jordan Rivera",
      department: "Revenue Operations",
      title: "Senior Customer Analyst",
      notes: "Owns high-touch billing escalations and VIP retention workflows."
    })
    .onConflictDoNothing()
    .returning();

  await db.insert(tenantSearchStates).values({
    tenantId: demoTenantId,
    activeGeneration: 1
  }).onConflictDoNothing();

  const initialDocuments = [
    ticket
      ? {
          ...buildTicketSearchDocument(ticket),
          generation: 1
        }
      : null,
    directoryUser
      ? {
          ...buildDirectoryUserSearchDocument(directoryUser),
          generation: 1
        }
      : null
  ].filter(Boolean);

  if (initialDocuments.length > 0) {
    // ⚠️ SENIOR NOTE: Seed data writes the initial denormalized documents too, so the demo app exercises the read model immediately.
    await db.insert(searchDocuments).values(initialDocuments as typeof searchDocuments.$inferInsert[]).onConflictDoNothing();
  }
}

seed().finally(() => process.exit(0));
