-- DISCIPLINE-ACCESS (Statut art. 44 lit. d; art. 14 alin. 3 lit. d): access to the disciplinary measures
-- is given by a pastor, no longer by the Administrator role. The administrators who are not pastors keep
-- today's access (given by nobody: accesDisciplinaDeLa stays NULL).
ALTER TABLE "users" ADD COLUMN "accesDisciplina" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "accesDisciplinaDeLa" TEXT,
ADD COLUMN "accesDisciplinaLa" TIMESTAMP(3);

UPDATE "users" SET "accesDisciplina" = true, "accesDisciplinaLa" = CURRENT_TIMESTAMP WHERE "role" = 'ADMIN' AND "isPastor" = false;
