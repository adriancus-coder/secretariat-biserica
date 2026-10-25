-- A new TOTP secret waits here until the first code confirms it.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pendingTotpSecretEnc" TEXT;
