"use client";

import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { createCampaignAction } from "@/server/actions/campaigns";

/** Starts a data-update campaign (administrators). */
export function CampaignForm({ defaultDeadline }: { defaultDeadline: string }) {
  const { state, pending, onSubmit } = useActionForm(createCampaignAction);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="row2">
        <TextField name="nume" label="Numele campaniei" placeholder="ex. Actualizare date 2026" defaultValue={v.nume ?? ""} error={e.nume} />
        <TextField name="deadline" label="Data limită" type="date" defaultValue={v.deadline ?? defaultDeadline} error={e.deadline} />
      </div>
      <label className="switch-row">
        <input type="checkbox" role="switch" name="generalLinkEnabled" defaultChecked={v.generalLinkEnabled === "on"} />
        <span>
          <span className="block font-medium">Link general cu cod QR</span>
          <span className="hint block !mt-0">
            Pentru afișul din biserică: oricine îl deschide completează un formular gol, fără să vadă datele din evidență.
          </span>
        </span>
      </label>
      <FormMessage state={state} />
      <div className="actions">
        <div className="spacer" />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se pornește…" : "Pornește campania"}
        </button>
      </div>
    </form>
  );
}
