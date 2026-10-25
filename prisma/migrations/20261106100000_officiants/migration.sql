-- CreateEnum
CREATE TYPE "OrdinationKind" AS ENUM ('DIACON', 'PREZBITER', 'PASTOR');

-- AlterTable
ALTER TABLE "church_roles" ADD COLUMN     "ordinat" "OrdinationKind";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "oficiant" TEXT NOT NULL DEFAULT '';


-- Backfill: the default ordained roles (Statut art. 30) by name.
UPDATE "church_roles" SET "ordinat" = 'DIACON' WHERE lower(trim("nume")) = 'diacon';
UPDATE "church_roles" SET "ordinat" = 'PREZBITER' WHERE lower(trim("nume")) = 'prezbiter';
UPDATE "church_roles" SET "ordinat" = 'PASTOR' WHERE lower(trim("nume")) = 'pastor';
