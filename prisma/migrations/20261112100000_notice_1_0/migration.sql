-- NOTICE-1.0: the first published privacy notice is version 1.0; the earlier 1.1 / 1.2 were drafts
-- on dev only. Churches that recorded a draft version move to 1.0. Consents, answers and campaigns
-- that recorded "1.1" / "1.2" are NOT changed: they are only counted here (no names), so the owner
-- can decide. Idempotent: a second run changes nothing and reports zeros.
DO $$
DECLARE
  n_church integer;
  n_consent_online integer;
  n_consent_paper integer;
  n_consent_staff integer;
  n_submission integer;
  n_campaign integer;
BEGIN
  SELECT count(*) INTO n_consent_online FROM "consents" WHERE "textVersion" IN ('1.1', '1.2') AND "source" = 'ONLINE';
  SELECT count(*) INTO n_consent_paper FROM "consents" WHERE "textVersion" IN ('1.1', '1.2') AND "source" = 'PAPER';
  SELECT count(*) INTO n_consent_staff FROM "consents" WHERE "textVersion" IN ('1.1', '1.2') AND "source" = 'STAFF';
  SELECT count(*) INTO n_submission FROM "data_update_submissions" WHERE "proposed"->>'versiuneNota' IN ('1.1', '1.2');
  SELECT count(*) INTO n_campaign FROM "data_campaigns" WHERE "privacyTextVersion" IN ('1.1', '1.2');
  UPDATE "churches" SET "privacyVersion" = '1.0' WHERE "privacyVersion" IN ('1.1', '1.2');
  GET DIAGNOSTICS n_church = ROW_COUNT;
  RAISE NOTICE 'notice_1_0: churches moved to 1.0: %', n_church;
  RAISE NOTICE 'notice_1_0: consents with 1.1/1.2 (unchanged): online %, paper %, staff %', n_consent_online, n_consent_paper, n_consent_staff;
  RAISE NOTICE 'notice_1_0: data-update answers with 1.1/1.2 (unchanged): %', n_submission;
  RAISE NOTICE 'notice_1_0: campaigns started under 1.1/1.2 (unchanged): %', n_campaign;
END $$;
