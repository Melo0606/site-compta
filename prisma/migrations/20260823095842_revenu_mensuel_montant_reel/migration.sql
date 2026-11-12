-- CreateTable
CREATE TABLE "RevenuMensuelMontant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "revenuId" INTEGER NOT NULL,
    "annee" INTEGER NOT NULL,
    "mois" INTEGER NOT NULL,
    "montant" REAL NOT NULL,
    CONSTRAINT "RevenuMensuelMontant_revenuId_fkey" FOREIGN KEY ("revenuId") REFERENCES "Revenu" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RevenuMensuelMontant_revenuId_annee_mois_key" ON "RevenuMensuelMontant"("revenuId", "annee", "mois");
