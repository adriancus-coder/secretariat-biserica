-- Reading scanned documents was withdrawn at the church's request (2026-10): no personal data goes to an AI provider.
-- The EXTRACT audit value stays so older log entries remain readable.
ALTER TABLE "churches" DROP COLUMN "extractEnabled";
