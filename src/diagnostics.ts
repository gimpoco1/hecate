export type ErrorDiagnostic = { name: string; code?: string; status?: number };

/** Diagnostics deliberately exclude error messages, request URLs, account data, and coordinates. */
export function errorDiagnostic(error: unknown): ErrorDiagnostic {
  const detail: ErrorDiagnostic = { name: error instanceof Error ? error.name : "ExternalError" };
  if (error !== null && typeof error === "object") {
    if ("code" in error && typeof error.code === "string" && /^[A-Z0-9_-]{1,40}$/i.test(error.code)) detail.code = error.code;
    if ("status" in error && typeof error.status === "number" && Number.isInteger(error.status)) detail.status = error.status;
  }
  return detail;
}
