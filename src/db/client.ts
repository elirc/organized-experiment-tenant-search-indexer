/**
 * This file creates the shared Drizzle database client.
 * Repository files import it directly or receive it through dependency injection in tests.
 * It calls the table definitions in `src/db/schema.ts`.
 * A junior engineer would likely open a new database connection per request and create avoidable pool pressure.
 */
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase, PostgresJsTransaction } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/tenant_search_indexer";

const client = postgres(connectionString, {
  max: 10
});

export const db = drizzle(client, { schema });

export type Database = PostgresJsDatabase<typeof schema>;
export type DatabaseTransaction = PostgresJsTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
export type DbExecutor = Database | DatabaseTransaction;
