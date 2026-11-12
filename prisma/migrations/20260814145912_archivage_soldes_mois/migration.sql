-- AlterTable
ALTER TABLE "Mois" ADD COLUMN "soldeCommunFinDeMois" REAL;

-- CreateTable
CREATE TABLE "SoldePersonneMois" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "moisId" INTEGER NOT NULL,
    "personneId" INTEGER NOT NULL,
    "soldePerso" REAL NOT NULL,
    "soldeEpargne" REAL NOT NULL,
    CONSTRAINT "SoldePersonneMois_moisId_fkey" FOREIGN KEY ("moisId") REFERENCES "Mois" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SoldePersonneMois_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SoldePersonneMois_moisId_personneId_key" ON "SoldePersonneMois"("moisId", "personneId");
