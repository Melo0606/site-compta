"use client";

import { useState } from "react";
import { inputClass, labelClass, helpTextClass } from "@/lib/ui";
import { MOIS_OPTIONS } from "@/lib/mois";

export function RevenuTypeFields({
  defaultType = "MENSUEL",
  defaultDate,
  defaultMoisRecurrence,
  defaultJourVersement,
}: {
  defaultType?: string;
  defaultDate?: string;
  defaultMoisRecurrence?: number;
  defaultJourVersement?: number;
}) {
  const [type, setType] = useState(defaultType);

  return (
    <>
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="type">
          Type
        </label>
        <select
          className={inputClass}
          id="type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="MENSUEL">Mensuel</option>
          <option value="PONCTUEL">Ponctuel</option>
          <option value="ANNUEL">Annuel</option>
        </select>
      </div>
      {type === "PONCTUEL" && (
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="date">
            Date
          </label>
          <input className={inputClass} type="date" id="date" name="date" defaultValue={defaultDate} required />
        </div>
      )}
      {type === "ANNUEL" && (
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="moisRecurrence">
            Mois de versement
          </label>
          <select
            className={inputClass}
            id="moisRecurrence"
            name="moisRecurrence"
            defaultValue={defaultMoisRecurrence}
            required
          >
            {MOIS_OPTIONS.map((mois) => (
              <option key={mois.value} value={mois.value}>
                {mois.label}
              </option>
            ))}
          </select>
          <p className={helpTextClass}>
            Revient chaque année à ce mois-là. Le montant réel de chaque année est ajustable
            directement sur la page du mois concerné.
          </p>
        </div>
      )}
      {(type === "MENSUEL" || type === "ANNUEL") && (
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="jourVersement">
            Jour de versement (optionnel)
          </label>
          <input
            className={inputClass}
            type="number"
            step="1"
            min="1"
            max="31"
            id="jourVersement"
            name="jourVersement"
            defaultValue={defaultJourVersement ?? ""}
          />
          <p className={helpTextClass}>
            Jour du mois où ce revenu est réellement versé (ex : 28). Laisser vide si inconnu ou
            variable. Une fois ce jour atteint dans le mois en cours, le montant est crédité
            automatiquement sur le solde perso.
          </p>
        </div>
      )}
    </>
  );
}
