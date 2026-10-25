"use client";

import { SignDocument, type SignChoice } from "@/components/sign-document";
import type { FormState } from "@/lib/form-state";

export interface DocSignatureView {
  name: string;
  /** data: URL of the image. */
  image: string;
  note: string;
}

/** The document's signatures (pastor, secretary) and the signing steps the current user may take. */
export function SignaturesCard({
  documentId,
  me,
  signatures,
  steps,
  canUseSaved,
  savedHint,
  freshOnly,
}: {
  documentId: string;
  me: string;
  signatures: Partial<Record<"PASTOR" | "SECRETAR", DocSignatureView>>;
  /** The roles this user may sign in, with the bound action for each. */
  steps: { role: "PASTOR" | "SECRETAR"; label: string; sign: (choice: SignChoice) => Promise<FormState> }[];
  canUseSaved: boolean;
  savedHint: string | null;
  freshOnly: boolean;
}) {
  const rows: ["PASTOR" | "SECRETAR", string][] = [
    ["PASTOR", "Pastor"],
    ["SECRETAR", "Secretar"],
  ];
  return (
    <div className="card">
      <h3>Semnături</h3>
      <div className="doc-signatures">
        {rows.map(([role, label]) => {
          const s = signatures[role];
          const step = steps.find((x) => x.role === role);
          return (
            <div key={role} className="doc-signature">
              <div className="font-medium">{label}</div>
              {s ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.image} alt={`Semnătura: ${s.name}`} />
                  <div>{s.name}</div>
                  <div className="hint !mt-0">{s.note}</div>
                </>
              ) : (
                <p className="hint !mt-0">nesemnat</p>
              )}
              {step ? (
                <SignDocument
                  documentId={documentId}
                  signer={me}
                  label={s ? `${step.label} din nou` : step.label}
                  canUseSaved={canUseSaved}
                  savedHint={savedHint}
                  freshOnly={freshOnly}
                  onSign={step.sign}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
