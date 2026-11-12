-- CreateTable
CREATE TABLE "Categorie" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nom" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AchatPrevu" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle" TEXT NOT NULL,
    "montantCible" REAL NOT NULL,
    "dateVisee" DATETIME NOT NULL,
    "dateDebutProvisionnement" DATETIME,
    "dejaProvisionne" REAL NOT NULL DEFAULT 0,
    "achete" BOOLEAN NOT NULL DEFAULT false,
    "categorieId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AchatPrevu_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "Categorie" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AchatPrevu" ("achete", "createdAt", "dateVisee", "dejaProvisionne", "id", "libelle", "montantCible", "updatedAt") SELECT "achete", "createdAt", "dateVisee", "dejaProvisionne", "id", "libelle", "montantCible", "updatedAt" FROM "AchatPrevu";
DROP TABLE "AchatPrevu";
ALTER TABLE "new_AchatPrevu" RENAME TO "AchatPrevu";
CREATE TABLE "new_ChargeAnnuelle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle" TEXT NOT NULL,
    "montant" REAL NOT NULL,
    "moisEcheance" INTEGER NOT NULL,
    "compte" TEXT NOT NULL DEFAULT 'COMMUN',
    "personneId" INTEGER,
    "categorieId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChargeAnnuelle_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChargeAnnuelle_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "Categorie" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ChargeAnnuelle" ("compte", "createdAt", "id", "libelle", "moisEcheance", "montant", "personneId", "updatedAt") SELECT "compte", "createdAt", "id", "libelle", "moisEcheance", "montant", "personneId", "updatedAt" FROM "ChargeAnnuelle";
DROP TABLE "ChargeAnnuelle";
ALTER TABLE "new_ChargeAnnuelle" RENAME TO "ChargeAnnuelle";
CREATE TABLE "new_ChargeMensuelle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "categorieId" INTEGER,
    "montant" REAL NOT NULL,
    "compte" TEXT NOT NULL DEFAULT 'COMMUN',
    "dateDebut" DATETIME,
    "dateFin" DATETIME,
    "montantVariable" BOOLEAN NOT NULL DEFAULT false,
    "personneId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChargeMensuelle_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "Categorie" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChargeMensuelle_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChargeMensuelle" ("categorie", "compte", "createdAt", "dateDebut", "dateFin", "id", "libelle", "montant", "montantVariable", "personneId", "updatedAt") SELECT "categorie", "compte", "createdAt", "dateDebut", "dateFin", "id", "libelle", "montant", "montantVariable", "personneId", "updatedAt" FROM "ChargeMensuelle";
DROP TABLE "ChargeMensuelle";
ALTER TABLE "new_ChargeMensuelle" RENAME TO "ChargeMensuelle";

-- DataMigration: convertit le texte libre "categorie" existant en lignes Categorie + FK
INSERT INTO "Categorie" ("nom") SELECT DISTINCT "categorie" FROM "ChargeMensuelle" WHERE "categorie" IS NOT NULL AND TRIM("categorie") != '';
UPDATE "ChargeMensuelle" SET "categorieId" = (SELECT "id" FROM "Categorie" WHERE "Categorie"."nom" = "ChargeMensuelle"."categorie") WHERE "categorie" IS NOT NULL;

CREATE TABLE "new_DepenseQuotidienne" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "moisId" INTEGER NOT NULL,
    "personneId" INTEGER,
    "libelle" TEXT NOT NULL,
    "montant" REAL NOT NULL,
    "date" DATETIME,
    "categorieId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DepenseQuotidienne_moisId_fkey" FOREIGN KEY ("moisId") REFERENCES "Mois" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepenseQuotidienne_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepenseQuotidienne_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "Categorie" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DepenseQuotidienne" ("createdAt", "date", "id", "libelle", "moisId", "montant", "personneId") SELECT "createdAt", "date", "id", "libelle", "moisId", "montant", "personneId" FROM "DepenseQuotidienne";
DROP TABLE "DepenseQuotidienne";
ALTER TABLE "new_DepenseQuotidienne" RENAME TO "DepenseQuotidienne";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Categorie_nom_key" ON "Categorie"("nom");
