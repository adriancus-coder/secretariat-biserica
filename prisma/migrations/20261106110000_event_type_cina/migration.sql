-- "Cina Domnului" joins the default event types (Statut art. 30). A church whose saved list is exactly
-- the previous defaults gets it before "Altele"; customised lists are left alone.
UPDATE "churches"
SET "tipuriEvenimente" = ARRAY['Serviciu divin','Evanghelizare','Botez','Binecuvântare copil','Ordinare','Agapă','Conferință','Tineret','Nuntă','Înmormântare','Cina Domnului','Altele']
WHERE "tipuriEvenimente" = ARRAY['Serviciu divin','Evanghelizare','Botez','Binecuvântare copil','Ordinare','Agapă','Conferință','Tineret','Nuntă','Înmormântare','Altele'];
