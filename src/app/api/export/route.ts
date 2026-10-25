import { todayIso } from "@/lib/dates";
import { permissions } from "@/lib/permissions";
import { buildExportJson } from "@/server/backup-json";
import { getCurrentUser } from "@/server/session";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/password";
import { tenantDb } from "@/server/tenant-db";

/** The export starts from the form in Setări → Date (with the password), never from a plain link. */
export function GET() {
  return Response.redirect(new URL("/setari/date", process.env.APP_URL || "http://localhost:3000"), 303);
}

/**
 * Exportul complet al datelor bisericii, în formatul JSON al prototipului. The password is asked
 * again (the file holds the whole register); each export is audited with its size.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Neautentificat.", { status: 401 });
  if (!permissions.export(user.role)) return new Response("Nu aveți drept de export.", { status: 403 });
  const form = await req.formData().catch(() => null);
  const password = String(form?.get("parola") ?? "");
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!password || !account || !(await verifyPassword(password, account.passwordHash))) {
    return Response.redirect(new URL("/setari/date?export=parola", req.url), 303);
  }
  const ctx = { user, db: tenantDb(user.churchId) };
  const { data, churchName } = await buildExportJson(ctx);
  const json = JSON.stringify(data, null, 2);
  // Numele de fișier din prototip: secretariat-<nume-biserica>-<data>.json
  const slug = (churchName || "biserica")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-]/g, "")
    .toLowerCase();
  const name = `secretariat-${slug}-${todayIso()}.json`;
  await prisma.auditLog.create({
    data: {
      churchId: user.churchId,
      userId: user.id,
      userName: user.name,
      entity: "SECURITY",
      entityId: user.churchId,
      entityLabel: "Export date",
      action: "CREATE",
      changes: { export: name, marime: `${Math.max(1, Math.round(Buffer.byteLength(json) / 1024))} KB` },
    },
  });
  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
