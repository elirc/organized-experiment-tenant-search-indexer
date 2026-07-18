/**
 * This file converts service-layer success values and typed errors into stable JSON responses.
 * Route handlers in `src/app/api/**/route.ts` call it after validation and business logic complete.
 * It consumes `src/lib/http/errors.ts`.
 * A junior engineer would likely leak raw exception stacks or return different response shapes from every endpoint.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AppError, ValidationBoundaryError } from "@/lib/http/errors";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    const validationError = new ValidationBoundaryError("Request validation failed", error.flatten());
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: validationError.code,
          message: validationError.message,
          details: validationError.details
        }
      },
      { status: validationError.statusCode }
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      },
      { status: error.statusCode }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred"
      }
    },
    { status: 500 }
  );
}
