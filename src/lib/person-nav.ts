/** Links that keep the Persoane list a person was opened from (`?din=<list query>`). Pure. */

/** The list query of the Persoane page: its filters and search, without the page number. */
export function listQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  return sp.toString();
}

/** `path?din=…` when the page was opened from the list (din defined, even empty), else `path`. */
export function withDin(path: string, din: string | undefined, extra: Record<string, string> = {}): string {
  const sp = new URLSearchParams(extra);
  if (din !== undefined) sp.set("din", din);
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

/** The Persoane list itself, with the filters it had. */
export function listHref(din: string | undefined): string {
  return din ? `/persoane?${din}` : "/persoane";
}
