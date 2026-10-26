-- PATRIMONY (Statut art. 43 alin. 7; art. 54–55): the inventory of the church's goods, and the categories nomenclature.
-- CreateEnum
CREATE TYPE "AssetOrigin" AS ENUM ('CUMPARARE', 'DONATIE', 'ALTELE');

-- CreateEnum
CREATE TYPE "AssetState" AS ENUM ('BUN', 'NECESITA_REPARATII', 'SCOS_DIN_UZ');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'ASSET';

-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "categoriiPatrimoniu" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "nrInventar" INTEGER NOT NULL,
    "denumire" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "cantitate" INTEGER NOT NULL DEFAULT 1,
    "valoare" INTEGER,
    "dataIntrarii" DATE,
    "provenienta" "AssetOrigin" NOT NULL DEFAULT 'CUMPARARE',
    "loc" TEXT NOT NULL DEFAULT '',
    "stare" "AssetState" NOT NULL DEFAULT 'BUN',
    "dataIesirii" DATE,
    "motivIesirii" TEXT NOT NULL DEFAULT '',
    "observatii" TEXT NOT NULL DEFAULT '',
    "responsabil" TEXT NOT NULL DEFAULT '',
    "responsabilId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_churchId_categorie_idx" ON "assets"("churchId", "categorie");

-- CreateIndex
CREATE INDEX "assets_responsabilId_idx" ON "assets"("responsabilId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_churchId_nrInventar_key" ON "assets"("churchId", "nrInventar");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_responsabilId_fkey" FOREIGN KEY ("responsabilId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

