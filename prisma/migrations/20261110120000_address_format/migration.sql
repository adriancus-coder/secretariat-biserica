-- ADDRESS-FORMAT: the address is shown as "Ulveveien 20, 4323 Sandnes". `adresa` stays the street and
-- number; the postal code and the locality get their own columns.
ALTER TABLE "churches" ADD COLUMN "codPostal" TEXT NOT NULL DEFAULT '', ADD COLUMN "localitate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "persons" ADD COLUMN "codPostal" TEXT NOT NULL DEFAULT '', ADD COLUMN "localitate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "families" ADD COLUMN "codPostal" TEXT NOT NULL DEFAULT '', ADD COLUMN "localitate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "applications" ADD COLUMN "codPostal" TEXT NOT NULL DEFAULT '', ADD COLUMN "localitate" TEXT NOT NULL DEFAULT '';

-- Data migration (idempotent: it touches only rows without a postal code and a locality; the test
-- tests/integration/address-migration.test.ts runs this block again). Same rule as splitLegacyAddress()
-- in src/lib/address.ts: "<street>[, ]<4 digits> <locality>", multiple spaces collapse to one, a part
-- written only in lower case gets its first letter capitalised, anything else stays as typed. What does
-- not match stays whole in "adresa" (the register then lists it under "De verificat"). The report
-- counts only; no names or addresses reach the log.
CREATE OR REPLACE FUNCTION pg_temp.cap_if_lower(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN t <> '' AND t = lower(t) THEN upper(left(t, 1)) || substr(t, 2) ELSE t END
$$;

DO $$
DECLARE
  tbl text;
  split_n integer;
  left_n integer;
  tot_split integer := 0;
  tot_left integer := 0;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['persons', 'families', 'applications', 'churches'] LOOP
    EXECUTE format($f$
      WITH parsed AS (
        SELECT id,
               regexp_match(btrim(regexp_replace(adresa, '\s+', ' ', 'g')), '^(.+?)[,\s]+(\d{4})\s+([^\d,\s][^,]*)$') AS m
        FROM %1$I
        WHERE adresa <> '' AND "codPostal" = '' AND localitate = ''
      )
      UPDATE %1$I t
         SET adresa = pg_temp.cap_if_lower(btrim(p.m[1])),
             "codPostal" = p.m[2],
             localitate = pg_temp.cap_if_lower(btrim(p.m[3]))
        FROM parsed p
       WHERE t.id = p.id AND p.m IS NOT NULL
    $f$, tbl);
    GET DIAGNOSTICS split_n = ROW_COUNT;
    EXECUTE format($f$SELECT count(*) FROM %1$I WHERE adresa <> '' AND "codPostal" = ''$f$, tbl) INTO left_n;
    RAISE NOTICE 'ADDRESS-FORMAT %: % separated, % left for review', tbl, split_n, left_n;
    tot_split := tot_split + split_n;
    tot_left := tot_left + left_n;
  END LOOP;
  RAISE NOTICE 'ADDRESS-FORMAT total: % addresses separated, % left for review', tot_split, tot_left;
END
$$;
