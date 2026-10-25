-- CreateEnum
CREATE TYPE "AppealResult" AS ENUM ('ADMISA', 'RESPINSA');

-- AlterTable
ALTER TABLE "disciplinary_measures" ADD COLUMN     "abatere" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "audiereLa" DATE,
ADD COLUMN     "audiereLoc" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "audiereOra" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cerereRepunereLa" DATE,
ADD COLUMN     "comunicatLa" DATE,
ADD COLUMN     "contestatieLa" DATE,
ADD COLUMN     "contestatieRezultat" "AppealResult",
ADD COLUMN     "incadrare" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "nuSaPrezentat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "raspuns" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "repunereMeetingId" TEXT,
ADD COLUMN     "temei" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "disciplinary_measures_repunereMeetingId_idx" ON "disciplinary_measures"("repunereMeetingId");

-- AddForeignKey
ALTER TABLE "disciplinary_measures" ADD CONSTRAINT "disciplinary_measures_repunereMeetingId_fkey" FOREIGN KEY ("repunereMeetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

