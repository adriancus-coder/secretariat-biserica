-- Baptism year: filled from the full date, or alone when only the year is known.
ALTER TABLE "persons" ADD COLUMN "botezAn" INTEGER;
ALTER TABLE "applications" ADD COLUMN "botezAn" INTEGER;

UPDATE "persons" SET "botezAn" = EXTRACT(YEAR FROM "dataBotez")::int WHERE "dataBotez" IS NOT NULL;
UPDATE "applications" SET "botezAn" = EXTRACT(YEAR FROM "dataBotez")::int WHERE "dataBotez" IS NOT NULL;
