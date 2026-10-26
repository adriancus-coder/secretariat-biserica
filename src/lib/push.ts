import { permissions, type Who } from "./permissions";

/**
 * Web Push notifications for the work that waits for someone. A payload carries only a generic title,
 * the address to open and the number of waiting items — never a name or any other personal data.
 * Pure.
 */
export const PUSH_TYPES = ["DOCUMENT_SIGN", "DOCUMENT_DECIDED", "APPLICATION", "PROPOSAL", "CAMPAIGN", "REMINDER", "PRAYER"] as const;
export type PushType = (typeof PUSH_TYPES)[number];

/** The switches in Cont → Notificări. */
export const PUSH_TYPE_LABEL: Record<PushType, string> = {
  DOCUMENT_SIGN: "Documente de semnat",
  DOCUMENT_DECIDED: "Răspunsul pastorului la documentele trimise",
  APPLICATION: "Cereri de membru noi",
  PROPOSAL: "Cereri și propuneri de aprobat",
  CAMPAIGN: "Răspunsuri la actualizarea datelor (zilnic)",
  REMINDER: "Adunarea Generală și mandatul comitetului (săptămânal)",
  PRAYER: "Familia săptămânii pentru rugăciune (lunea dimineața)",
};

export const PUSH_MESSAGE: Record<PushType | "TEST", { title: string; url: string }> = {
  DOCUMENT_SIGN: { title: "Un document așteaptă semnătura dumneavoastră", url: "/documente/de-semnat" },
  DOCUMENT_DECIDED: { title: "Pastorul a răspuns la un document trimis spre semnare", url: "/documente" },
  APPLICATION: { title: "A sosit o cerere de membru nouă", url: "/cereri" },
  PROPOSAL: { title: "O cerere așteaptă aprobarea dumneavoastră", url: "/cereri?stare=propuse" },
  CAMPAIGN: { title: "Răspunsuri noi la actualizarea datelor, de verificat", url: "/de-verificat" },
  REMINDER: { title: "Memento: Adunarea Generală sau mandatul comitetului", url: "/" },
  PRAYER: { title: "Familia săptămânii este pregătită.", url: "/rugaciune" },
  TEST: { title: "Notificare de test: notificările funcționează pe acest dispozitiv", url: "/cont" },
};

/** The types a user may receive: only work they can act on. */
export function pushTypesFor(user: Exclude<Who, string>): PushType[] {
  const write = permissions.write(user);
  const pastor = permissions.pastor(user);
  return PUSH_TYPES.filter((t) => {
    if (t === "DOCUMENT_SIGN" || t === "PROPOSAL") return pastor;
    if (t === "REMINDER") return write || pastor;
    if (t === "PRAYER") return permissions.rugaciune(user);
    return write;
  });
}

/** The JSON sent to the browser: title, address, tag (one notification per type) and the badge count. */
export function pushPayload(type: PushType | "TEST", badge?: number): string {
  const m = PUSH_MESSAGE[type];
  return JSON.stringify({ title: m.title, url: m.url, tag: type, ...(badge !== undefined ? { badge } : {}) });
}

/** At most one notification per user and type in `windowMs` (5 minutes); the rest are coalesced. */
export class PushCoalescer {
  private last = new Map<string, number>();
  constructor(private windowMs = 5 * 60_000) {}
  hit(userId: string, type: string, now = Date.now()): boolean {
    const key = `${userId}|${type}`;
    const prev = this.last.get(key);
    if (prev !== undefined && now - prev < this.windowMs) return false;
    this.last.set(key, now);
    if (this.last.size > 5000) for (const [k, t] of this.last) if (now - t >= this.windowMs) this.last.delete(k);
    return true;
  }
}

/** A short device name for the list ("Chrome pe Android", "Safari pe iPhone"). */
export function deviceLabel(userAgent: string): string {
  const os = /iPhone/.test(userAgent) ? "iPhone" : /iPad/.test(userAgent) ? "iPad" : /Android/.test(userAgent) ? "Android" : /Windows/.test(userAgent) ? "Windows" : /Mac OS X/.test(userAgent) ? "Mac" : /Linux/.test(userAgent) ? "Linux" : "";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Browser";
  return os ? `${browser} pe ${os}` : browser;
}
