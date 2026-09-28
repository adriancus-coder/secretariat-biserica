-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "notes_searchText_idx" ON "notes" USING GIN ("searchText" gin_trgm_ops);

-- Completarea valorilor pentru mențiunile existente (litere mici, fără diacriticele românești;
-- aplicația recalculează valoarea la fiecare salvare cu normalizarea completă).
UPDATE "notes"
SET "searchText" = translate(lower("text" || ' ' || "tip" || ' ' || "familie"), 'ăâîșşțţ', 'aaiisstt');
