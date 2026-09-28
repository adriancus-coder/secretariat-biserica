/** Tipurile jurnalului, fără dependență de clientul Prisma (utilizabile și în componente). */
export type AuditAction = "CREATE" | "UPDATE" | "DELETE";
export type AuditEntityKey = "PERSON" | "DOCUMENT" | "MEETING" | "EVENT" | "GROUP" | "NOTE" | "SETTINGS" | "USER" | "IMPORT";
