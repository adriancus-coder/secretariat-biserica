/**
 * Re-encrypts the data stored under keys derived from AUTH_SECRET before the secret is rotated:
 * authenticator (TOTP) secrets and pastoral notes. Without this, a new AUTH_SECRET makes them
 * unreadable (docs/SECURITY.md, "Rotating AUTH_SECRET").
 *
 *   OLD_AUTH_SECRET=<current> AUTH_SECRET=<new> DATABASE_URL=<db> npm run secrets:reencrypt            (dry run)
 *   OLD_AUTH_SECRET=<current> AUTH_SECRET=<new> DATABASE_URL=<db> npm run secrets:reencrypt -- --apply
 *
 * Everything happens in one transaction: a value that the old secret cannot open stops the run and
 * nothing is changed. Prints counts only — never a secret or a note.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { deriveKey, KEY_INFO, seal, unseal } from "../src/server/secret-box";

const oldSecret = process.env.OLD_AUTH_SECRET ?? "";
const newSecret = process.env.AUTH_SECRET ?? "";
const apply = process.argv.includes("--apply");

async function main() {
  if (!oldSecret || !newSecret) throw new Error("Set OLD_AUTH_SECRET (the current one) and AUTH_SECRET (the new one).");
  if (oldSecret === newSecret) throw new Error("OLD_AUTH_SECRET and AUTH_SECRET are the same.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const rekey = (info: string) => {
    const from = deriveKey(oldSecret, info);
    const to = deriveKey(newSecret, info);
    return (enc: string) => {
      let plain: string;
      try {
        plain = unseal(from, enc);
      } catch {
        throw new Error("A stored value cannot be opened with OLD_AUTH_SECRET (wrong secret?). Nothing was changed.");
      }
      return seal(to, plain);
    };
  };
  const totp = rekey(KEY_INFO.totp);
  const note = rekey(KEY_INFO.pastoralNote);
  try {
    const counts = await prisma.$transaction(
      async (tx) => {
        let users = 0;
        let notes = 0;
        const withTotp = await tx.user.findMany({
          where: { OR: [{ totpSecretEnc: { not: null } }, { pendingTotpSecretEnc: { not: null } }] },
          select: { id: true, totpSecretEnc: true, pendingTotpSecretEnc: true },
        });
        for (const u of withTotp) {
          const data = {
            totpSecretEnc: u.totpSecretEnc ? totp(u.totpSecretEnc) : null,
            pendingTotpSecretEnc: u.pendingTotpSecretEnc ? totp(u.pendingTotpSecretEnc) : null,
          };
          if (apply) await tx.user.update({ where: { id: u.id }, data });
          users++;
        }
        for (const n of await tx.pastoralNote.findMany({ select: { id: true, textEnc: true } })) {
          const textEnc = note(n.textEnc);
          if (apply) await tx.pastoralNote.update({ where: { id: n.id }, data: { textEnc } });
          notes++;
        }
        return { users, notes };
      },
      { timeout: 120_000 },
    );
    console.log(`${apply ? "Re-encrypted" : "Dry run, would re-encrypt"}: ${counts.users} authenticator secrets, ${counts.notes} pastoral notes.`);
    if (!apply) console.log("Run again with --apply, then set the new AUTH_SECRET in Render and redeploy.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "Failed.");
  process.exit(1);
});
