-- Minutes: number per year, points instead of the free texts discutii/hotarari.

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "anRegistru" INTEGER,
ADD COLUMN     "formulaIncheiere" TEXT NOT NULL DEFAULT 'Toate punctele au fost votate în unanimitate de membrii prezenți.',
ADD COLUMN     "nr" INTEGER,
ADD COLUMN     "observatii" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "puncte" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "meetings_churchId_anRegistru_nr_key" ON "meetings"("churchId", "anRegistru", "nr");

-- Move the old texts into points and observations, without losing text. Mirrors splitDecisions()
-- in src/lib/minutes.ts. Existing meetings stay without a number until they are edited.
CREATE OR REPLACE FUNCTION pg_temp.split_decisions(hot TEXT, disc TEXT, OUT puncte TEXT[], OUT observatii TEXT) AS $$
DECLARE
  num CONSTANT TEXT := '^\s*\d{1,3}\s*[.)](\s+|$)';
  lines TEXT[] := regexp_split_to_array(hot, E'\r?\n');
  line TEXT;
  t TEXT;
  numbered BOOLEAN;
  pts TEXT[] := ARRAY[]::TEXT[];
  rest TEXT := '';
  d TEXT := regexp_replace(disc, '^\s+|\s+$', '', 'g');
BEGIN
  SELECT bool_or(l ~ num) INTO numbered FROM unnest(lines) AS l;
  FOREACH line IN ARRAY lines LOOP
    t := regexp_replace(line, '^\s+|\s+$', '', 'g');
    CONTINUE WHEN t = '';
    IF line ~ num THEN
      pts := pts || regexp_replace(regexp_replace(line, num, ''), '^\s+|\s+$', '', 'g');
    ELSIF numbered AND cardinality(pts) > 0 THEN
      pts[cardinality(pts)] := pts[cardinality(pts)] || E'\n' || t;
    ELSIF numbered THEN
      rest := CASE WHEN rest = '' THEN t ELSE rest || E'\n' || t END;
    ELSE
      pts := pts || t;
    END IF;
  END LOOP;
  SELECT coalesce(array_agg(regexp_replace(p, '^\s+|\s+$', '', 'g') ORDER BY o), ARRAY[]::TEXT[]) INTO puncte
  FROM unnest(pts) WITH ORDINALITY AS u(p, o) WHERE regexp_replace(p, '^\s+|\s+$', '', 'g') <> '';
  observatii := concat_ws(E'\n\n', NULLIF(rest, ''), CASE WHEN d <> '' THEN E'Discuții:\n' || d END);
END $$ LANGUAGE plpgsql;

UPDATE "meetings" m
SET "puncte" = s.puncte, "observatii" = s.observatii, "hotarari" = '', "discutii" = ''
FROM (
  SELECT id, (pg_temp.split_decisions("hotarari", "discutii")).* FROM "meetings"
  WHERE "hotarari" ~ '\S' OR "discutii" ~ '\S'
) s
WHERE m.id = s.id;

DROP FUNCTION pg_temp.split_decisions(TEXT, TEXT);
