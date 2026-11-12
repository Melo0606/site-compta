-- CreateTable
CREATE TABLE "ChargeMensuelleMontant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chargeMensuelleId" INTEGER NOT NULL,
    "montant" REAL NOT NULL,
    "depuisAnnee" INTEGER NOT NULL,
    "depuisMois" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChargeMensuelleMontant_chargeMensuelleId_fkey" FOREIGN KEY ("chargeMensuelleId") REFERENCES "ChargeMensuelle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ChargeMensuelleMontant_chargeMensuelleId_depuisAnnee_depuisMois_key" ON "ChargeMensuelleMontant"("chargeMensuelleId", "depuisAnnee", "depuisMois");
