"use client";

import { useId, useState } from "react";
import { TextField } from "@/components/ui/fields";
import { ORDINATION_LABEL, officiantWarning, type OfficiantOption } from "@/lib/officiants";

/**
 * "Oficiat de": the persons holding an ordained role are suggested (Statut art. 30); any other name can be
 * typed (officiants from other churches). A diacon named for a baptism or a wedding gets a warning.
 */
export function OfficiantField({
  name,
  label = "Oficiat de",
  act,
  defaultValue,
  options,
  error,
}: {
  name: string;
  label?: string;
  /** The act: "Botez", or the event type. */
  act: string;
  defaultValue?: string;
  options: OfficiantOption[];
  error?: string;
}) {
  const listId = useId();
  const [value, setValue] = useState(defaultValue ?? "");
  const warning = officiantWarning(act, value, options);
  return (
    <div>
      <TextField
        name={name}
        label={label}
        list={listId}
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={error}
        hint={options.length ? "Alegeți un slujitor ordinat sau scrieți alt nume (de exemplu din altă biserică)." : undefined}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.name} value={o.name} label={ORDINATION_LABEL[o.ordinat]} />
        ))}
      </datalist>
      {warning ? (
        <p className="alert !mt-1" role="status">
          {warning}
        </p>
      ) : null}
    </div>
  );
}
