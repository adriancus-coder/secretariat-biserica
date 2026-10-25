import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { reportYears } from "@/domain/stats";
import { todayIso } from "@/lib/dates";
import { DEFAULT_EXPORT_COLUMNS, EXPORT_COLUMN_KEYS, EXPORT_SORTS, type ExportColumn, type ExportSort } from "@/lib/person-export";
import { parseCategorySelection } from "@/lib/category-params";
import { EXPORT_GRANT_COOKIE, hasGrant } from "@/server/export-grant";
import { listRoleGroups } from "@/server/queries/roles";
import { loadPersonRecords } from "@/server/queries/stats";
import { requireCtx } from "@/server/session";
import { hasStepUp, stepUpMethod } from "@/server/step-up";
import { StepUpGate } from "@/components/passkey/step-up-gate";
import { ExportForm } from "./export-form";

export const metadata: Metadata = { title: "Exportă persoane" };

const ERRORS: Record<string, string> = {
  parola: "Parola nu este corectă. Nimic nu a fost exportat.",
  confirmare: "Confirmați întâi identitatea pe dispozitiv. Nimic nu a fost exportat.",
  date: "Alegeți cel puțin o categorie și o coloană.",
};

/** Export of any combination of person categories (Excel, CSV, PDF). Administrator and Secretar. */
export default async function PersonExportPage({ searchParams }: PageProps<"/persoane/export">) {
  const ctx = await requireCtx("export");
  const sp = await searchParams;
  const today = todayIso();
  const sel = parseCategorySelection((k) => sp[k], Number(today.slice(0, 4)));
  const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
  const coloane = list(sp.coloane).filter((c): c is ExportColumn => (EXPORT_COLUMN_KEYS as string[]).includes(c));
  const ordine = typeof sp.ordine === "string" && (EXPORT_SORTS as readonly string[]).includes(sp.ordine) ? (sp.ordine as ExportSort) : "alfabetic";
  const [persons, groups] = await Promise.all([loadPersonRecords(ctx), listRoleGroups(ctx)]);
  const [stepMethod, stepped] = await Promise.all([stepUpMethod(ctx.user.id), hasStepUp(ctx.user)]);
  // A user with a passkey confirms on the device (15 minutes); the others give the password every 10 minutes.
  const granted = stepped || (stepMethod === "password" && hasGrant((await cookies()).get(EXPORT_GRANT_COOKIE)?.value, ctx.user.id));
  const eroare = typeof sp.eroare === "string" ? (ERRORS[sp.eroare] ?? null) : null;
  return (
    <>
      <BackLink href="/persoane">Persoane</BackLink>
      <PageHead title="Exportă persoane" sub="Excel, CSV sau PDF, din orice combinație de categorii" />
      {stepMethod === "passkey" && !stepped ? <StepUpGate method="passkey" what="Lista conține date personale." compact /> : null}
      <ExportForm
        initial={{
          categorie: sel.keys,
          mod: sp.mod === "toate" ? "toate" : "oricare",
          an: sel.year ? String(sel.year) : "",
          functie: sel.functie,
          coloane: coloane.length ? coloane : DEFAULT_EXPORT_COLUMNS,
          ordine,
        }}
        years={reportYears(persons, Number(today.slice(0, 4)))}
        roles={groups.flatMap((g) => g.roles.map((r) => ({ id: r.id, nume: r.nume, group: g.nume })))}
        needPassword={!granted && stepMethod === "password"}
        error={eroare}
      />
    </>
  );
}
