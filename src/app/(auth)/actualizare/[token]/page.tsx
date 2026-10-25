import type { Metadata } from "next";
import { fmt } from "@/lib/format";
import { OPTIONAL_CONSENTS, type OptionalConsentKey } from "@/lib/labels";
import type { DataUpdateProposal } from "@/lib/schemas/data-update";
import { submitPersonalUpdateAction, verifyPersonalIdentityAction } from "@/server/actions/data-update";
import { adultChildren, childSnapshot, personalIdentityOk, resolvePersonalLink, selfSnapshot } from "@/server/data-update";
import { prisma } from "@/server/db";
import { tenantDb } from "@/server/tenant-db";
import { IdentityForm } from "../identity-form";
import { churchForCampaign, InvalidLink, LockedLink } from "../shared";
import { UpdateForm, type ChildState } from "../update-form";

export const metadata: Metadata = { title: "Actualizarea datelor", robots: { index: false } };

type Answers = Partial<Record<OptionalConsentKey, boolean>>;

/** Public: a personal link of a data-update campaign. Step 1 identity, step 2 the person's own data. */
export default async function PersonalUpdatePage({ params }: PageProps<"/actualizare/[token]">) {
  const { token } = await params;
  const r = await resolvePersonalLink(token);
  if (r.state === "invalid") return <InvalidLink />;
  if (r.state === "locked") return <LockedLink />;
  if (!r.link.openedAt) await prisma.dataUpdateLink.update({ where: { id: r.link.id }, data: { openedAt: new Date() } });
  const church = await churchForCampaign(r.link.churchId);
  const head = (
    <>
      <h2 className="text-2xl mb-1">Actualizarea datelor</h2>
      <p className="hint mb-4">
        Biserica {church.nume} · până la {fmt(r.campaign.deadline)}
      </p>
    </>
  );
  if (!(await personalIdentityOk(r.link))) {
    return (
      <>
        {head}
        <IdentityForm action={verifyPersonalIdentityAction.bind(null, token)} />
      </>
    );
  }
  const db = tenantDb(r.link.churchId);
  const adult = await db.person.findUniqueOrThrow({ where: { id: r.link.personId }, include: { family: { select: { headId: true } } } });
  const kids = await adultChildren(db, adult);
  const pending = await db.dataUpdateSubmission.findFirst({ where: { linkId: r.link.id, status: "PENDING" }, orderBy: { updatedAt: "desc" } });
  const proposal = pending ? (pending.proposed as unknown as DataUpdateProposal) : null;
  // Answers already given: the pending submission's, else the latest consents in the register.
  const current = await db.consent.findMany({
    where: { personId: { in: [adult.id, ...kids.map((k) => k.id)] }, kind: { in: [...OPTIONAL_CONSENTS] } },
    orderBy: [{ givenAt: "asc" }, { createdAt: "asc" }],
    select: { personId: true, kind: true, granted: true, withdrawnAt: true },
  });
  const latest = (personId: string): Answers =>
    Object.fromEntries(current.filter((c) => c.personId === personId && !c.withdrawnAt).map((c) => [c.kind, c.granted]));
  const register = selfSnapshot(adult);
  const children: ChildState[] = [
    ...kids.map((k) => {
      const snap = childSnapshot(k);
      const fromProposal = proposal?.children.find((c) => c.id === k.id);
      const base = fromProposal ?? snap;
      return {
        key: k.id,
        id: k.id,
        nume: base.nume,
        prenume: base.prenume,
        gen: base.gen ?? "",
        dataNasterii: base.dataNasterii ?? "",
        dataBinecuvantare: base.dataBinecuvantare ?? "",
        consents: fromProposal?.consents ?? latest(k.id),
      };
    }),
    ...(proposal?.children.filter((c) => !c.id) ?? []).map((c, i) => ({
      key: `p${i}`,
      id: null,
      nume: c.nume,
      prenume: c.prenume,
      gen: c.gen ?? "",
      dataNasterii: c.dataNasterii ?? "",
      dataBinecuvantare: c.dataBinecuvantare ?? "",
      consents: c.consents,
    })),
  ];
  return (
    <>
      {head}
      {proposal ? <p className="alert alert-ok mb-3">Ați trimis deja datele; le puteți modifica până la data limită.</p> : null}
      <UpdateForm
        action={submitPersonalUpdateAction.bind(null, token)}
        self={proposal?.self ?? register}
        register={register}
        childrenInitial={children}
        consents={proposal?.consents ?? latest(adult.id)}
        privacyText={church.notice}
      />
    </>
  );
}
