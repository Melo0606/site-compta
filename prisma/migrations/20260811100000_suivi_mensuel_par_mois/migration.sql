-- AlterTable
ALTER TABLE "ChargeMensuelle" DROP COLUMN "payeeCeMois";

-- AlterTable
ALTER TABLE "Personne" DROP COLUMN "virementRecuCeMois";

-- AlterTable
ALTER TABLE "Parametres" DROP COLUMN "chargesDejaPayeesCeMois";

-- CreateTable
CREATE TABLE "Mois" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "annee" INTEGER NOT NULL,
    "mois" INTEGER NOT NULL,
    "ajustementManuel" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Paiement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "moisId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "refId" INTEGER NOT NULL,
    "payee" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Paiement_moisId_fkey" FOREIGN KEY ("moisId") REFERENCES "Mois" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VirementMois" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "moisId" INTEGER NOT NULL,
    "personneId" INTEGER NOT NULL,
    "montant" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "VirementMois_moisId_fkey" FOREIGN KEY ("moisId") REFERENCES "Mois" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VirementMois_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Mois_annee_mois_key" ON "Mois"("annee", "mois");

-- CreateIndex
CREATE UNIQUE INDEX "Paiement_moisId_type_refId_key" ON "Paiement"("moisId", "type", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "VirementMois_moisId_personneId_key" ON "VirementMois"("moisId", "personneId");
