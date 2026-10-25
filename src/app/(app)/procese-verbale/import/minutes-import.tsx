"use client";

import { useActionState } from "react";
import type { ChecklistOption } from "@/components/person-checklist";
import { DocumentUploadFields } from "@/components/ui/document-upload";
import { FormMessage } from "@/components/ui/form-bits";
import type { AttendanceRule } from "@/lib/attendance";
import { extractMinutesAction, type ExtractMinutesState } from "@/server/actions/extract";
import { MeetingForm } from "../meeting-form";

/** Upload a scanned or photographed minutes page, then review the prefilled meeting form. */
export function MinutesImport({
  people,
  tipuri,
  rules,
  prefill,
}: {
  people: ChecklistOption[];
  tipuri: string[];
  rules: Record<string, AttendanceRule>;
  prefill: Record<"TOTI" | "COMITET", string[]>;
}) {
  const [state, action, pending] = useActionState(extractMinutesAction, {} as ExtractMinutesState);
  const m = state.meeting;
  if (m) {
    return (
      <>
        <div className="alert mb-4" role="status">
          Verificați datele extrase: au fost citite automat din document și pot conține greșeli.
          {m.warnings.length ? (
            <ul className="list-disc pl-5 mt-2">
              {m.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <MeetingForm
          id={null}
          initial={m.initial}
          points={m.points}
          selected={m.selected}
          people={people}
          tipuri={tipuri}
          rules={rules}
          prefill={prefill}
          cancelHref="/procese-verbale"
        />
      </>
    );
  }
  return (
    <form action={action} className="card">
      <p className="hint mb-3">
        Încărcați un proces-verbal scanat sau fotografiat. Numărul, data, tipul, prezenții și punctele completează formularul ședinței, pe
        care îl verificați înainte de salvare. Documentul nu se păstrează.
      </p>
      <DocumentUploadFields pending={pending} hint="Persoanele negăsite în registru sunt trecute la invitați." />
      <FormMessage state={state} />
    </form>
  );
}
