import "server-only";
import { deriveKey, KEY_INFO, seal, unseal } from "./secret-box";
import type { Ctx } from "./session";

/**
 * Confidential pastoral notes (Statut art. 39 alin. 3): pastors only (permission `pastoral`), behind
 * the step-up. The text is stored encrypted (AES-256-GCM, key derived from AUTH_SECRET), so a
 * database dump alone does not reveal it; it is never exported, searched or written to the log.
 */
const key = () => deriveKey(process.env.AUTH_SECRET ?? "", KEY_INFO.pastoralNote);

export const encryptNote = (text: string) => seal(key(), text);

/** The text, or null when it cannot be read (AUTH_SECRET changed without re-encrypting). */
export function decryptNote(enc: string): string | null {
  try {
    return unseal(key(), enc);
  } catch {
    return null;
  }
}

export interface PastoralNoteView {
  id: string;
  text: string | null;
  author: string;
  mine: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** The person's notes, newest first, decrypted. The caller has checked `pastoral` and the step-up. */
export async function loadPastoralNotes(ctx: Ctx, personId: string): Promise<PastoralNoteView[]> {
  const rows = await ctx.db.pastoralNote.findMany({
    where: { personId },
    orderBy: { createdAt: "desc" },
    select: { id: true, textEnc: true, createdByUserId: true, createdAt: true, updatedAt: true, createdBy: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    text: decryptNote(r.textEnc),
    author: r.createdBy?.name ?? "utilizator șters",
    mine: r.createdByUserId === ctx.user.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}
