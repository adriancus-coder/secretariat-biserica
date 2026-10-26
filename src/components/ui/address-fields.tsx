"use client";

import { useRef, useState } from "react";
import { TextField } from "./fields";

export interface AddressValues {
  adresa?: string;
  codPostal?: string;
  localitate?: string;
}

/** Locality for a four-digit postal code, from the bundled Bring register (loaded on first use). */
async function localityFor(code: string): Promise<string | null> {
  const table = (await import("@/lib/postal-codes-no.json")).default as Record<string, string>;
  return table[code] ?? null;
}

/**
 * The three address fields: "Stradă și număr", "Cod poștal" (exactly four digits, numeric keyboard) and
 * "Localitate". The locality fills itself when the fourth digit is typed; it stays editable, and a
 * locality the user typed is not overwritten.
 */
export function AddressFields({
  values,
  errors,
  streetLabel = "Stradă și număr",
  autoComplete = false,
  highlight,
  onValue,
}: {
  values: AddressValues;
  errors: Record<string, string | undefined>;
  streetLabel?: string;
  autoComplete?: boolean;
  /** Marks a field as changed (data-update form). */
  highlight?: (name: "adresa" | "codPostal" | "localitate") => boolean;
  /** Called with every new value of a field (data-update form). */
  onValue?: (name: "adresa" | "codPostal" | "localitate", value: string) => void;
}) {
  const [street, setStreet] = useState(values.adresa ?? "");
  const [code, setCode] = useState(values.codPostal ?? "");
  const [place, setPlace] = useState(values.localitate ?? "");
  const placeRef = useRef(place);
  const lastAuto = useRef<string | null>(null);
  const changePlace = (v: string) => {
    placeRef.current = v;
    setPlace(v);
    onValue?.("localitate", v);
  };

  async function onCode(next: string) {
    const digits = next.replace(/\D/g, "").slice(0, 4);
    setCode(digits);
    onValue?.("codPostal", digits);
    if (digits.length !== 4) return;
    const found = await localityFor(digits);
    if (found && (placeRef.current === "" || placeRef.current === lastAuto.current)) {
      lastAuto.current = found;
      changePlace(found);
    }
  }

  return (
    <>
      <TextField
        name="adresa"
        label={streetLabel}
        value={street}
        onChange={(e) => {
          setStreet(e.target.value);
          onValue?.("adresa", e.target.value);
        }}
        className={highlight?.("adresa") ? "field-changed" : undefined}
        error={errors.adresa}
        autoComplete={autoComplete ? "address-line1" : undefined}
      />
      <div className="addr-row">
        <TextField
          name="codPostal"
          label="Cod poștal"
          value={code}
          onChange={(e) => void onCode(e.target.value)}
          error={errors.codPostal}
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          className={highlight?.("codPostal") ? "field-changed" : undefined}
          autoComplete={autoComplete ? "postal-code" : undefined}
        />
        <TextField
          name="localitate"
          label="Localitate"
          value={place}
          onChange={(e) => changePlace(e.target.value)}
          error={errors.localitate}
          className={highlight?.("localitate") ? "field-changed" : undefined}
          autoComplete={autoComplete ? "address-level2" : undefined}
        />
      </div>
    </>
  );
}
