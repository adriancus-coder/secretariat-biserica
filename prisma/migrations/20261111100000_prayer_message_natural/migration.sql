-- The weekly prayer message in the church's own words: a second template for a person without a family.
ALTER TABLE "churches" ADD COLUMN "prayerMessagePerson" TEXT NOT NULL DEFAULT '';

-- Churches still on the first default text move to the new default (""); an edited message is kept.
UPDATE "churches" SET "prayerMessage" = '' WHERE "prayerMessage" = 'Săptămâna aceasta ne rugăm pentru {familia}. Să-i purtăm în rugăciune!';
