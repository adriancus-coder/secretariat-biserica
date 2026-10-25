import type { Metadata } from "next";
import { cookies } from "next/headers";
import { TextSizeControl } from "@/components/text-size-control";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { PageHead } from "@/components/ui/page-head";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/labels";
import { TEXT_SIZE_COOKIE, parseUiTextSize } from "@/lib/text-size";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { logoutAction, logoutEverywhereAction } from "@/server/actions/auth";
import { requireUser } from "@/server/session";
import { ChangePasswordForm } from "./change-password-form";
import { SecurityCard } from "./security-card";
import { PasskeysCard } from "./passkeys-card";
import { MySignatureCard } from "./my-signature-card";
import { isPasskeyConfigured, passkeyPolicyApplies } from "@/server/passkeys";
import { dotDateTime } from "@/lib/dates";
import { prisma } from "@/server/db";
import { isEmailConfigured } from "@/server/email";

export const metadata: Metadata = { title: "Contul meu" };
import { hasLegacyRecoveryCodes } from "@/server/two-factor";

export default async function AccountPage({ searchParams }: PageProps<"/cont">) {
  const user = await requireUser();
  const sp = await searchParams;
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const textSize = parseUiTextSize(jar.get(TEXT_SIZE_COOKIE)?.value);
  const security = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      totpEnabled: true,
      emailOtpEnabled: true,
      recoveryCodes: true,
      church: { select: { require2fa: true, passkeyPolicy: true } },
      passkeys: { orderBy: { createdAt: "asc" }, select: { id: true, deviceName: true, lastUsedAt: true, createdAt: true } },
      signaturePng: true,
      signatureSavedAt: true,
    },
  });
  const policy = passkeyPolicyApplies(user, security.church);
  return (
    <>
      <PageHead title="Contul meu" sub={user.churchName} />
      {sp.parola === "schimbata" ? (
        <div className="alert alert-ok" role="status">
          Parola a fost schimbată. Sesiunile de pe alte dispozitive au fost închise.
        </div>
      ) : null}
      <div className="card">
        <h3>{user.name}</h3>
        <dl className="detail">
          <dt>E-mail</dt>
          <dd>{user.email}</dd>
          <dt>Rol</dt>
          <dd>
            {ROLE_LABEL[user.role]} <span className="hint">— {ROLE_DESCRIPTION[user.role]}</span>
          </dd>
        </dl>
      </div>
      {sp.recuperare === "putine" ? (
        <div className="alert" role="status">
          Mai aveți puține coduri de recuperare. Generați coduri noi mai jos.
        </div>
      ) : null}
      {sp.dispozitiv === "necesar" && !security.passkeys.length ? (
        <div className="alert" role="status">
          Biserica cere pastorilor și administratorilor intrarea cu parolă + Face ID / amprentă. Adăugați acum acest dispozitiv.
        </div>
      ) : null}
      <PasskeysCard
        configured={isPasskeyConfigured()}
        required={policy}
        rows={security.passkeys.map((p) => ({
          id: p.id,
          deviceName: p.deviceName,
          created: dotDateTime(p.createdAt),
          lastUsed: p.lastUsedAt ? dotDateTime(p.lastUsedAt) : null,
        }))}
      />
      <MySignatureCard
        name={user.name}
        current={security.signaturePng ? `data:image/png;base64,${Buffer.from(security.signaturePng).toString("base64")}` : null}
        savedAt={security.signatureSavedAt ? dotDateTime(security.signatureSavedAt) : null}
        hasPasskey={security.passkeys.length > 0}
      />
      <SecurityCard
        totpEnabled={security.totpEnabled}
        emailOtpEnabled={security.emailOtpEnabled}
        recoveryLeft={security.recoveryCodes.length}
        recoveryLegacy={hasLegacyRecoveryCodes(security.recoveryCodes)}
        emailConfigured={isEmailConfigured()}
        required={security.church.require2fa}
      />
      <div className="card">
        <h3>Schimbă parola</h3>
        <ChangePasswordForm />
      </div>
      <div className="card">
        <h3>Aspect</h3>
        <p className="hint mb-3">Tema și mărimea textului se păstrează pe acest dispozitiv.</p>
        <ThemeSwitcher current={theme} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-medium">Mărimea textului</span>
          <TextSizeControl current={textSize} />
        </div>
      </div>
      <div className="actions mt-4">
        <form action={logoutAction}>
          <button type="submit" className="btn btn-danger">
            Ieșire din cont
          </button>
        </form>
        <form action={logoutEverywhereAction}>
          <button type="submit" className="btn">
            Deconectează-te de pe toate dispozitivele
          </button>
        </form>
      </div>
    </>
  );
}
