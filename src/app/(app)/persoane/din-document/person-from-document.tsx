"use client";

import { useActionState } from "react";
import { DocumentUploadFields } from "@/components/ui/document-upload";
import { FormMessage } from "@/components/ui/form-bits";
import { todayIso } from "@/lib/dates";
import { extractPersonAction, type ExtractPersonState } from "@/server/actions/extract";
import type { FamilyChoice } from "../family-field";
import { PersonForm } from "../person-form";
import type { RoleChoiceGroup } from "../roles-picker";

/** Upload a transfer certificate or membership application, then review the prefilled person form. */
export function PersonFromDocument({ families, rudenie, roles }: { families: FamilyChoice[]; rudenie: string[]; roles: RoleChoiceGroup[] }) {
  const [state, action, pending] = useActionState(extractPersonAction, {} as ExtractPersonState);
  const d = state.draft;
  if (d) {
    const initial: Record<string, string> = {
      nume: d.nume ?? "",
      prenume: d.prenume ?? "",
      statut: "MEMBRU",
      gen: d.gen ?? "",
      dataNasterii: d.dataNasterii ?? "",
      telefon: d.telefon ?? "",
      email: d.email ?? "",
      adresa: d.adresa ?? "",
      modIntrare: d.kind ?? "",
      dataMembru: todayIso(),
      bisericaProvenienta: d.bisericaProvenienta ?? "",
      dataBotez: d.dataBotez ?? "",
      botezBiserica: d.botezBiserica ?? "",
      botezLocalitate: d.botezLocalitate ?? "",
      botezOficiant: d.botezOficiant ?? "",
    };
    return (
      <>
        <div className="alert mb-4" role="status">
          Verificați datele extrase: au fost citite automat din document și pot conține greșeli.
        </div>
        <PersonForm id={null} initial={initial} families={families} rudenie={rudenie} roles={roles} cancelHref="/persoane" />
      </>
    );
  }
  return (
    <form action={action} className="card">
      <p className="hint mb-3">
        Încărcați un certificat de transfer sau o cerere de membru (scanată sau fotografiată). Datele citite completează formularul
        persoanei, pe care îl verificați înainte de salvare. Documentul nu se păstrează.
      </p>
      <DocumentUploadFields pending={pending} hint="Pe telefon puteți fotografia documentul direct." />
      <FormMessage state={state} />
    </form>
  );
}
