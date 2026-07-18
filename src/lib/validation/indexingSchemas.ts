/**
 * This file validates administrative indexing commands.
 * Indexing job routes call it before they reach `src/services/indexingService.ts`.
 * It couples to the indexing domain enums defined in `src/db/schema.ts`.
 * A junior engineer would likely leave rebuild inputs as free-form strings and create dead-letter jobs that can never run.
 */
import { z } from "zod";

export const rebuildIndexSchema = z.object({
  entityTypes: z
    .array(z.enum(["TICKET", "DIRECTORY_USER"]))
    .min(1)
    .default(["TICKET", "DIRECTORY_USER"])
});

export const runPendingJobsSchema = z.object({
  // ⚠️ SENIOR NOTE: Worker batch size is capped so one privileged request cannot monopolize the process on a backlog.
  limit: z.coerce.number().int().min(1).max(20).default(5)
});
