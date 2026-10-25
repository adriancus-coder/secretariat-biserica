-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isPastor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pastorTitlu" TEXT NOT NULL DEFAULT '';

