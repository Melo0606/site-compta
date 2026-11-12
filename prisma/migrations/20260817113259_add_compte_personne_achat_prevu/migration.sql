-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AchatPrevu" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle" TEXT NOT NULL,
    "montantCible" REAL NOT NULL,
    "dateVisee" DATETIME NOT NULL,
    "dateDebutProvisionnement" DATETIME,
    "sansProvisionnement" BOOLEAN NOT NULL DEFAULT false,
    "dejaProvisionne" REAL NOT NULL DEFAULT 0,
    "achete" BOOLEAN NOT NULL DEFAULT false,
    "compte" TEXT NOT NULL DEFAULT 'COMMUN',
    "personneId" INTEGER,
    "categorieId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AchatPrevu_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AchatPrevu_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "Categorie" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AchatPrevu" ("achete", "categorieId", "createdAt", "dateDebutProvisionnement", "dateVisee", "dejaProvisionne", "id", "libelle", "montantCible", "sansProvisionnement", "updatedAt") SELECT "achete", "categorieId", "createdAt", "dateDebutProvisionnement", "dateVisee", "dejaProvisionne", "id", "libelle", "montantCible", "sansProvisionnement", "updatedAt" FROM "AchatPrevu";
DROP TABLE "AchatPrevu";
ALTER TABLE "new_AchatPrevu" RENAME TO "AchatPrevu";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
