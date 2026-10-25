-- Page layout of the printed minutes: church default and per-meeting override.
-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "pvLayout" JSONB NOT NULL DEFAULT '{}';
-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "layout" JSONB;
