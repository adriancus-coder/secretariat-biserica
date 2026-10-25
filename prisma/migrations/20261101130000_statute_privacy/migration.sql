-- Privacy notice 1.1 (version and adoption date) and the church's Comunitate.
-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "comunitate" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "privacyAdoptedAt" DATE,
ADD COLUMN     "privacyVersion" TEXT NOT NULL DEFAULT '';

