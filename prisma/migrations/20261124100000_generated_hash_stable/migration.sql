-- GENERATED-HASH-STABLE: the fingerprint of a saved generated document is now taken from its source's
-- data, not from the printed text (which held the day's date). Versions saved before keep version 1 and
-- are checked once by the app (src/server/generated.ts, upgradeHash): unchanged ones get the data's
-- fingerprint, changed ones keep the notice. New versions get version 2. Idempotent.
ALTER TABLE "generated_documents" ADD COLUMN IF NOT EXISTS "hashVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "generated_documents" ALTER COLUMN "hashVersion" SET DEFAULT 2;
