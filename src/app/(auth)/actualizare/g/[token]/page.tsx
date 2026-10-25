import type { Metadata } from "next";
import { fmt } from "@/lib/format";
import { submitGeneralUpdateAction, verifyGeneralIdentityAction } from "@/server/actions/data-update";
import { generalIdentity, resolveGeneralLink } from "@/server/data-update";
import { IdentityForm } from "../../identity-form";
import { churchForCampaign, InvalidLink } from "../../shared";
import { UpdateForm } from "../../update-form";

export const metadata: Metadata = { title: "Actualizarea datelor", robots: { index: false } };

/**
 * Public: the general link of a campaign. The identity step always proceeds the same way and the form
 * always opens empty: nothing from the register is shown or hinted, not even whether a person matched.
 */
export default async function GeneralUpdatePage({ params }: PageProps<"/actualizare/g/[token]">) {
  const { token } = await params;
  const r = await resolveGeneralLink(token);
  if (r.state === "invalid") return <InvalidLink />;
  const church = await churchForCampaign(r.campaign.churchId);
  const confirmed = await generalIdentity(r.campaign.id);
  return (
    <>
      <h2 className="text-2xl mb-1">Actualizarea datelor</h2>
      <p className="hint mb-4">
        Biserica {church.nume} · până la {fmt(r.campaign.deadline)}
      </p>
      {confirmed ? (
        <UpdateForm action={submitGeneralUpdateAction.bind(null, token)} self={{}} childrenInitial={[]} consents={{}} privacyText={church.notice} />
      ) : (
        <IdentityForm action={verifyGeneralIdentityAction.bind(null, token)} />
      )}
    </>
  );
}
