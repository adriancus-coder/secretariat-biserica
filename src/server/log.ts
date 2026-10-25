import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Logs an unexpected error without the error object itself (no stack with request data, no
 * parameters, no personal data): a short request id, the error's name and code, and the first line
 * of its message, shortened and with e-mail addresses masked. Returns the id.
 */
export function logError(scope: string, error: unknown): string {
  const id = randomUUID().slice(0, 8);
  const e = (error ?? {}) as { name?: unknown; code?: unknown; message?: unknown };
  const message = String(e.message ?? error ?? "")
    .split("\n")[0]
    .replace(/[^\s@]+@[^\s@]+/g, "<e-mail>")
    .slice(0, 160);
  console.error(`[${scope}]`, { id, name: typeof e.name === "string" ? e.name : typeof error, code: typeof e.code === "string" ? e.code : undefined, message });
  return id;
}
