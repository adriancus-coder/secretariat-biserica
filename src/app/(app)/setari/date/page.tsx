import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { permissions } from "@/lib/permissions";
import { requirePermission } from "@/server/session";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Copie de siguranță" };

export default async function DataPage() {
  const user = await requirePermission("export");
  return (
    <>
      <BackLink href="/setari">Setări</BackLink>
      <PageHead title="Copie de siguranță" sub="Export și import JSON, compatibil cu formatul prototipului" />
      <div className="card">
        <h3>Export</h3>
        <p className="hint mb-3">
          Toate datele bisericii (persoane, ședințe, evenimente, documente, grupuri, mențiuni și setări) într-un fișier
          JSON. Fișierul conține date personale — păstrați-l în siguranță.
        </p>
        <a href="/api/export" className="btn" download>
          Exportă datele (JSON)
        </a>
      </div>
      {permissions.admin(user.role) ? (
        <div className="card">
          <h3>Import</h3>
          <p className="hint mb-3">
            Acceptă fișiere exportate din aplicație sau din prototipul HTML. Importul se face într-o singură tranzacție:
            dacă fișierul are erori, nu se modifică nimic.
          </p>
          <ImportForm />
        </div>
      ) : (
        <p className="hint">Importul poate fi făcut doar de administrator.</p>
      )}
    </>
  );
}
