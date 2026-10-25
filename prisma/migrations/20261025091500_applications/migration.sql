-- Membership applications sent through the public form /cerere/<slug>,
-- plus the church slug and the switch that opens the form.

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApplicationKind" AS ENUM ('TRANSFER', 'BOTEZ', 'ALTUL');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'APPLICATION';

-- AlterTable: the slug starts nullable, is backfilled from the church name, then becomes required.
ALTER TABLE "churches" ADD COLUMN "applicationsOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "slug" TEXT;

-- Backfill, mirroring slugify() and slugVariant() in src/lib/slug.ts:
-- diacritics removed (before lower(), so the result does not depend on the database locale),
-- anything else than a-z/0-9 becomes a hyphen, 3-40 characters; the oldest church keeps the
-- plain slug and later ones with the same name get -2, -3, ...
DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN SELECT id, nume FROM "churches" ORDER BY "createdAt", id LOOP
    base := regexp_replace(normalize(r.nume, NFD), '[̀-ͯ]', '', 'g');
    base := replace(replace(replace(replace(replace(replace(replace(replace(base,
      'ß', 'ss'), 'ẞ', 'ss'), 'æ', 'ae'), 'Æ', 'ae'), 'œ', 'oe'), 'Œ', 'oe'), 'þ', 'th'), 'Þ', 'th');
    base := lower(translate(base, 'øØđĐðÐłŁı', 'ooddddlli'));
    base := btrim(regexp_replace(base, '[^a-z0-9]+', '-', 'g'), '-');
    IF length(base) > 40 THEN
      base := rtrim(left(base, 40), '-');
    END IF;
    IF base = '' THEN
      base := 'biserica';
    ELSIF length(base) < 3 THEN
      base := 'biserica-' || base;
    END IF;

    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "churches" WHERE "slug" = candidate) LOOP
      n := n + 1;
      candidate := rtrim(left(base, 40 - length('-' || n)), '-') || '-' || n;
    END LOOP;
    UPDATE "churches" SET "slug" = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "churches" ALTER COLUMN "slug" SET NOT NULL;

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "kind" "ApplicationKind" NOT NULL,
    "nume" TEXT NOT NULL,
    "prenume" TEXT NOT NULL DEFAULT '',
    "gen" "Gender",
    "dataNasterii" DATE,
    "telefon" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "adresa" TEXT NOT NULL DEFAULT '',
    "familie" TEXT NOT NULL DEFAULT '',
    "rudenie" TEXT NOT NULL DEFAULT '',
    "bisericaProvenienta" TEXT NOT NULL DEFAULT '',
    "dataBotez" DATE,
    "locBotez" TEXT NOT NULL DEFAULT '',
    "mesaj" TEXT NOT NULL DEFAULT '',
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "personId" TEXT,
    "rejectReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "applications_personId_key" ON "applications"("personId");

-- CreateIndex
CREATE INDEX "applications_churchId_status_createdAt_idx" ON "applications"("churchId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "churches_slug_key" ON "churches"("slug");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
