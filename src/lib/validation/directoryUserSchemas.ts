/**
 * This file defines the request validation boundary for directory user APIs.
 * It is called from `src/app/api/directory-users/route.ts`.
 * Parsed values flow into `src/services/directoryUserService.ts`.
 * A junior engineer would likely skip length limits and accidentally allow index-bloating free text into a high-cardinality entity.
 */
import { z } from "zod";

export const createDirectoryUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(160),
  department: z.string().min(2).max(120).optional().nullable(),
  title: z.string().min(2).max(120).optional().nullable(),
  // ⚠️ SENIOR NOTE: Notes length is capped because high-volume free text on a searchable entity can silently bloat index storage and query cost.
  notes: z.string().max(2000).default("")
});
