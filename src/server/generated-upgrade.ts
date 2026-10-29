import "server-only";
import { createHash } from "node:crypto";
import { blocksFingerprintText } from "@/lib/generated-blocks";
import { isGeneratedKind, keyParams } from "@/lib/generated-kinds";
import { todayIso } from "@/lib/dates";
import { prisma } from "./db";
import { HASH_VERSION, loadSource, upgradeHash, sourceHash } from "./generated";
import { logError } from "./log";
import type { Ctx } from "./session";
import { scopeToChurch } from "./tenant-scope";

/*
 * GENERATED-HASH-STABLE: the one-time move of the versions saved with the text's fingerprint
 * (hashVersion 1) to the data's fingerprint, for every church, at the server's start (it also happens
 * when such a version is opened). Idempotent; reports counts only — never a key, a title or content.
 */

/** A reader that sees what the saving users saw at most (discipline included): it reads, never writes data. */
function systemCtx(churchId: string): Ctx {
  return {
    user: { id: "sistem", name: "Sistem", email: "", role: "ADMIN", isPastor: false, pastorTitlu: "", accesDisciplina: true, sessionVersion: 0, churchId, churchName: "" },
    db: scopeToChurch(prisma, churchId),
  } as unknown as Ctx;
}

export interface UpgradeCounts {
  /** Versions still on the text's fingerprint. */
  checked: number;
  /** How many showed „Datele s-au schimbat” before (the old fingerprint against today's text). */
  noticeBefore: number;
  /** How many show it after (a real change since they were saved). */
  noticeAfter: number;
  /** Versions whose source no longer exists (left as they are). */
  missing: number;
}

export async function upgradeGeneratedHashes(): Promise<UpgradeCounts> {
  const counts: UpgradeCounts = { checked: 0, noticeBefore: 0, noticeAfter: 0, missing: 0 };
  const rows = await prisma.generatedDocument.findMany({
    where: { hashVersion: { lt: HASH_VERSION } },
    select: { id: true, churchId: true, kind: true, sourceKey: true, sourceHash: true, hashVersion: true, updatedAt: true },
  });
  for (const row of rows) {
    counts.checked++;
    try {
      if (!isGeneratedKind(row.kind)) {
        counts.missing++;
        continue;
      }
      const ctx = systemCtx(row.churchId);
      const src = await loadSource(ctx, row.kind, keyParams(row.kind, row.sourceKey));
      if (!src) {
        counts.missing++;
        continue;
      }
      const todayText = createHash("sha256").update(blocksFingerprintText(src.spec.blocks)).digest("hex");
      if (todayText !== row.sourceHash) counts.noticeBefore++;
      if ((await upgradeHash(ctx, src, row)) !== sourceHash(src)) counts.noticeAfter++;
    } catch (error) {
      counts.missing++;
      logError("generated-upgrade", error);
    }
  }
  return counts;
}

/** At the server's start: once, after a short wait, with the counts in the log. */
export function scheduleGeneratedUpgrade(delayMs = 20_000) {
  const timer = setTimeout(async () => {
    try {
      const c = await upgradeGeneratedHashes();
      if (c.checked) console.info(`GENERATED-HASH-STABLE ${todayIso()}: ${c.checked} versiuni verificate; cu „Datele s-au schimbat” înainte: ${c.noticeBefore}, după: ${c.noticeAfter}; fără sursă: ${c.missing}.`);
    } catch (error) {
      logError("generated-upgrade", error);
    }
  }, delayMs);
  timer.unref?.();
}
