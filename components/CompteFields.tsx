"use client";

import { useState } from "react";
import { selectClass, labelClass } from "@/lib/ui";

type Personne = { id: number; nom: string };

export function CompteFields({
  personnes,
  defaultCompte = "COMMUN",
  defaultPersonneId,
}: {
  personnes: Personne[];
  defaultCompte?: string;
  defaultPersonneId?: number;
}) {
  const [compte, setCompte] = useState(defaultCompte);

  return (
    <>
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="compte">
          Compte
        </label>
        <select
          className={selectClass}
          id="compte"
          name="compte"
          value={compte}
          onChange={(e) => setCompte(e.target.value)}
        >
          <option value="COMMUN">Commun</option>
          <option value="PERSO">Perso</option>
        </select>
      </div>
      {compte === "PERSO" && (
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="personneId">
            Personne
          </label>
          <select className={selectClass} id="personneId" name="personneId" defaultValue={defaultPersonneId} required>
            <option value="" disabled>
              Choisir une personne
            </option>
            {personnes.map((personne) => (
              <option key={personne.id} value={personne.id}>
                {personne.nom}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
