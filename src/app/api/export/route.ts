import { toPrototypeJson } from "@/domain/backup";
import { todayIso } from "@/lib/dates";
import { permissions } from "@/lib/permissions";
import { applicationsToJson } from "@/lib/application-backup";
import { addMemberRoles, rolesToJson } from "@/lib/roles-backup";
import { addMeetingExtras } from "@/lib/meeting-backup";
import { addMemberFamilies, familiesToJson } from "@/lib/families-backup";
import { addMemberBaptism } from "@/lib/baptism-backup";
import { loadApplications, loadBackup, loadBaptism, loadFamilies, loadMeetingExtras, loadRoles } from "@/server/backup";
import { getCurrentUser } from "@/server/session";
import { tenantDb } from "@/server/tenant-db";

/** Exportul complet al datelor bisericii, în formatul JSON al prototipului. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Neautentificat.", { status: 401 });
  if (!permissions.export(user.role)) return new Response("Nu aveți drept de export.", { status: 403 });
  const ctx = { user, db: tenantDb(user.churchId) };
  const [backup, applications, roles, attendance, families, baptism] = await Promise.all([
    loadBackup(ctx),
    loadApplications(ctx),
    loadRoles(ctx),
    loadMeetingExtras(ctx),
    loadFamilies(ctx),
    loadBaptism(ctx),
  ]);
  const data = toPrototypeJson(backup);
  addMemberFamilies(data.members as Record<string, Record<string, unknown>>, families.familyOf);
  addMeetingExtras(data.meetings as Record<string, Record<string, unknown>>, attendance);
  addMemberBaptism(data.members as Record<string, Record<string, unknown>>, baptism);
  addMemberRoles(data.members as Record<string, Record<string, unknown>>, roles.functii);
  const json = JSON.stringify({ ...data, applications: applicationsToJson(applications), roles: rolesToJson(roles.roles), families: familiesToJson(families.families) }, null, 2);
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
