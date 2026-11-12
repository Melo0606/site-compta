-- AlterTable
ALTER TABLE "ChargeMensuelle" ADD COLUMN "dateFin" DATETIME;

-- AlterTable
ALTER TABLE "Revenu" ADD COLUMN "moisRecurrence" INTEGER;

-- CreateTable
CREATE TABLE "RevenuAnnuelMontant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "revenuId" INTEGER NOT NULL,
    "annee" INTEGER NOT NULL,
    "montant" REAL NOT NULL,
    CONSTRAINT "RevenuAnnuelMontant_revenuId_fkey" FOREIGN KEY ("revenuId") REFERENCES "Revenu" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RevenuAnnuelMontant_revenuId_annee_key" ON "RevenuAnnuelMontant"("revenuId", "annee");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Mois" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "annee" INTEGER NOT NULL,
    "mois" INTEGER NOT NULL,
    "entreesTheoriqueOverride" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Mois" ("id", "annee", "mois", "entreesTheoriqueOverride", "createdAt", "updatedAt") SELECT "id", "annee", "mois", "entreesTheoriqueOverride", "createdAt", "updatedAt" FROM "Mois";
DROP TABLE "Mois";
ALTER TABLE "new_Mois" RENAME TO "Mois";
CREATE UNIQUE INDEX "Mois_annee_mois_key" ON "Mois"("annee", "mois");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
