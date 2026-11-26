-- CreateTable
CREATE TABLE "RevenuExceptionnel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "moisId" INTEGER NOT NULL,
    "personneId" INTEGER,
    "libelle" TEXT NOT NULL,
    "montant" REAL NOT NULL,
    "date" DATETIME,
    "categorieId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RevenuExceptionnel_moisId_fkey" FOREIGN KEY ("moisId") REFERENCES "Mois" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RevenuExceptionnel_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RevenuExceptionnel_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "Categorie" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Categorie" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nom" TEXT NOT NULL,
    "parentId" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'DEPENSE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Categorie_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Categorie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Categorie" ("createdAt", "id", "nom") SELECT "createdAt", "id", "nom" FROM "Categorie";
DROP TABLE "Categorie";
ALTER TABLE "new_Categorie" RENAME TO "Categorie";
CREATE UNIQUE INDEX "Categorie_parentId_nom_key" ON "Categorie"("parentId", "nom");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Catégories de revenus par défaut
INSERT INTO "Categorie" ("nom", "type") SELECT 'Cadeaux', 'REVENU' WHERE NOT EXISTS (SELECT 1 FROM "Categorie" WHERE "nom" = 'Cadeaux' AND "parentId" IS NULL);
INSERT INTO "Categorie" ("nom", "type") SELECT 'Ventes', 'REVENU' WHERE NOT EXISTS (SELECT 1 FROM "Categorie" WHERE "nom" = 'Ventes' AND "parentId" IS NULL);
