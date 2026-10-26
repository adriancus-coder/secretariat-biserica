-- Weekly prayer for families: the week rows, the families' (and lone persons') objection / children consent, the message and the Monday push claim.
-- CreateEnum
CREATE TYPE "PrayerSource" AS ENUM ('CAMPANIE', 'HARTIE', 'SECRETARIAT');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'PRAYER';

-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "prayerMessage" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "pushPrayerWeek" DATE;

-- AlterTable
ALTER TABLE "families" ADD COLUMN     "prayerChangedAt" TIMESTAMP(3),
ADD COLUMN     "prayerIncludeChildren" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prayerOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prayerSource" "PrayerSource";

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "prayerChangedAt" TIMESTAMP(3),
ADD COLUMN     "prayerIncludeChildren" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prayerOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prayerSource" "PrayerSource";

-- CreateTable
CREATE TABLE "prayer_weeks" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "familyId" TEXT,
    "personId" TEXT,
    "weekStart" DATE NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prayer_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prayer_weeks_churchId_familyId_idx" ON "prayer_weeks"("churchId", "familyId");

-- CreateIndex
CREATE INDEX "prayer_weeks_churchId_personId_idx" ON "prayer_weeks"("churchId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "prayer_weeks_churchId_weekStart_key" ON "prayer_weeks"("churchId", "weekStart");

-- AddForeignKey
ALTER TABLE "prayer_weeks" ADD CONSTRAINT "prayer_weeks_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayer_weeks" ADD CONSTRAINT "prayer_weeks_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayer_weeks" ADD CONSTRAINT "prayer_weeks_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayer_weeks" ADD CONSTRAINT "prayer_weeks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

