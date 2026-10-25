import "server-only";
import { consentState, currentConsents, type ConsentState } from "@/lib/consents";
import type { ConsentKindKey } from "@/lib/labels";
import type { Ctx } from "./session";

export type ConsentStates = Map<string, Partial<Record<ConsentKindKey, ConsentState>>>;

/** Person id → the current state of each consent kind (absent kinds = Neexprimat). */
export async function loadConsentStates(ctx: Pick<Ctx, "db">, personIds?: string[]): Promise<ConsentStates> {
  const rows = await ctx.db.consent.findMany({
    where: personIds ? { personId: { in: personIds } } : {},
    select: { personId: true, kind: true, granted: true, givenAt: true, createdAt: true, source: true, withdrawnAt: true },
  });
  const byPerson = new Map<string, typeof rows>();
  for (const r of rows) byPerson.set(r.personId, [...(byPerson.get(r.personId) ?? []), r]);
  const out: ConsentStates = new Map();
  for (const [id, list] of byPerson) {
    const cur = currentConsents(list);
    out.set(id, Object.fromEntries(Object.entries(cur).map(([k, r]) => [k, consentState(r)])));
  }
  return out;
}
