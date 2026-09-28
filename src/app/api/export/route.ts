import { toPrototypeJson } from "@/domain/backup";
import { todayIso } from "@/lib/dates";
import { permissions } from "@/lib/permissions";
import { loadBackup } from "@/server/backup";
import { getCurrentUser } from "@/server/session";
import { tenantDb } from "@/server/tenant-db";

/** Exportul complet al datelor bisericii, în formatul JSON al prototipului. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Neautentificat.", { status: 401 });
  if (!permissions.export(user.role)) return new Response("Nu aveți drept de export.", { status: 403 });
  const backup = await loadBackup({ user, db: tenantDb(user.churchId) });
  const json = JSON.stringify(toPrototypeJson(backup), null, 2);
  // Numele de fișier din prototip: secretariat-<nume-biserica>-<data>.json
  const slug = (backup.settings?.nume || "biserica")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-]/g, "")
    .toLowerCase();
  const name = `secretariat-${slug}-${todayIso()}.json`;
  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
