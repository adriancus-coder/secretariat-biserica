-- Page layout of the registered documents: the church's default and each document's own.
-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "docLayout" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "layout" JSONB;

