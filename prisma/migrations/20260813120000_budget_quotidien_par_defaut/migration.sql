-- Assure l'existence de la catégorie "Quotidien"
INSERT INTO "Categorie" ("nom", "createdAt")
SELECT 'Quotidien', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Categorie" WHERE "nom" = 'Quotidien');

-- Charge budget "Dépenses du quotidien" pour le compte commun, si absente
INSERT INTO "ChargeMensuelle" ("libelle", "categorieId", "montant", "compte", "personneId", "montantVariable", "budgetDepensesQuotidiennes", "createdAt", "updatedAt")
SELECT 'Dépenses du quotidien', (SELECT "id" FROM "Categorie" WHERE "nom" = 'Quotidien'), 0, 'COMMUN', NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ChargeMensuelle" WHERE "budgetDepensesQuotidiennes" = 1 AND "compte" = 'COMMUN');

-- Charge budget "Dépenses du quotidien" pour chaque personne existante qui n'en a pas encore
INSERT INTO "ChargeMensuelle" ("libelle", "categorieId", "montant", "compte", "personneId", "montantVariable", "budgetDepensesQuotidiennes", "createdAt", "updatedAt")
SELECT 'Dépenses du quotidien', (SELECT "id" FROM "Categorie" WHERE "nom" = 'Quotidien'), 0, 'PERSO', p."id", 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Personne" AS p
WHERE NOT EXISTS (
  SELECT 1 FROM "ChargeMensuelle" cm
  WHERE cm."budgetDepensesQuotidiennes" = 1 AND cm."compte" = 'PERSO' AND cm."personneId" = p."id"
);
