-- Statut art. 14, 20–24: marriage date, parents' names, the minutes of an entry or exclusion, the
-- written request of a withdrawal and a temporary absence.

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "dataCasatoriei" DATE,
ADD COLUMN     "dataCerereRetragere" DATE,
ADD COLUMN     "iesireMeetingId" TEXT,
ADD COLUMN     "intrareMeetingId" TEXT,
ADD COLUMN     "numeMama" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "numeTata" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "plecatDin" DATE,
ADD COLUMN     "plecatUnde" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "persons_intrareMeetingId_idx" ON "persons"("intrareMeetingId");

-- CreateIndex
CREATE INDEX "persons_iesireMeetingId_idx" ON "persons"("iesireMeetingId");

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_intrareMeetingId_fkey" FOREIGN KEY ("intrareMeetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_iesireMeetingId_fkey" FOREIGN KEY ("iesireMeetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

