-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "extractEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privacyText" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastLoginIp" TEXT;

