"use client";

/** The QR code and the secret of an authenticator app setup. */
export function TotpQr({ svg, secret }: { svg: string; secret: string }) {
  return (
    <div className="totp-qr">
      {/* The SVG is generated on the server by the qrcode package from the otpauth:// URL. */}
      <div className="totp-qr-img" role="img" aria-label="Cod QR pentru aplicația de autentificare" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="hint">
        Scanați codul cu aplicația de autentificare (Google Authenticator, Microsoft Authenticator, Aegis…) sau introduceți manual cheia:
      </p>
      <code className="totp-secret">{secret.replace(/(.{4})/g, "$1 ").trim()}</code>
    </div>
  );
}

/** The recovery codes, shown once. */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="alert alert-ok" role="status">
      <p className="mb-2">
        <b>Coduri de recuperare.</b> Păstrați-le într-un loc sigur: fiecare cod poate înlocui o singură dată codul din aplicație sau de pe
        e-mail. Nu vor mai fi afișate.
      </p>
      <ul className="recovery-codes">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
