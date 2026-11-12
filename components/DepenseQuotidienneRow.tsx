"use client";

import { useState, type ReactNode } from "react";
import { modifierDepenseQuotidienne, supprimerDepenseQuotidienne, type DepenseQuotidienneRow as DepenseQuotidienneRowType } from "@/app/actions/mois";
import { formatEuros, formatDate } from "@/lib/format";
import {
  inputClass,
  selectClass,
  buttonSecondarySmallClass,
  buttonDangerSmallClass,
  tdClass,
  tdMutedClass,
  rowClass,
} from "@/lib/ui";

/** Ligne « Dépenses du quotidien », éditable sur place (bascule affichage/formulaire). */
export function DepenseQuotidienneRow({
  depense,
  categorieSelect,
}: {
  depense: DepenseQuotidienneRowType;
  categorieSelect: ReactNode;
}) {
  const [enEdition, setEnEdition] = useState(false);
  const modifierAvecId = modifierDepenseQuotidienne.bind(null, depense.id);
  const formId = `modifier-depense-${depense.id}`;
  // Un remboursement est stocké en négatif (voir `lireMontantSigneDepenseQuotidienne`).
  const estRemboursement = depense.montant < 0;

  if (!enEdition) {
    return (
      <tr className={rowClass}>
        <td className={tdClass}>{depense.libelle}</td>
        <td className={tdMutedClass}>{depense.categorieNom ?? "—"}</td>
        <td className={tdMutedClass}>{depense.date ? formatDate(depense.date) : "—"}</td>
        <td className={tdClass}>
          {estRemboursement ? (
            <span className="text-pos">
              +{formatEuros(-depense.montant)}
              <span className="ml-1.5 text-xs">remboursement</span>
            </span>
          ) : (
            formatEuros(depense.montant)
          )}
        </td>
        <td className="px-4 py-2.5 text-right">
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEnEdition(true)} className={buttonSecondarySmallClass}>
              Modifier
            </button>
            <form action={supprimerDepenseQuotidienne}>
              <input type="hidden" name="id" value={depense.id} />
              <button type="submit" className={buttonDangerSmallClass}>
                Supprimer
              </button>
            </form>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={rowClass}>
      <td className="px-4 py-2.5">
        <input
          className={inputClass}
          type="text"
          form={formId}
          name="libelle"
          defaultValue={depense.libelle}
          required
        />
      </td>
      <td className="px-4 py-2.5">{categorieSelect}</td>
      <td className="px-4 py-2.5">
        <input
          className={inputClass}
          type="date"
          form={formId}
          name="date"
          defaultValue={depense.date ? depense.date.toISOString().slice(0, 10) : ""}
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex gap-2">
          <select
            className={`${selectClass} w-auto! shrink-0`}
            form={formId}
            name="sens"
            defaultValue={estRemboursement ? "remboursement" : "depense"}
            aria-label="Type"
          >
            <option value="depense">Dépense</option>
            <option value="remboursement">Remboursement</option>
          </select>
          <input
            className={`${inputClass} w-24`}
            type="number"
            step="0.01"
            min="0.01"
            form={formId}
            name="montant"
            defaultValue={Math.abs(depense.montant)}
            required
          />
        </div>
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex justify-end gap-2">
          <button type="submit" form={formId} className={buttonSecondarySmallClass}>
            Enregistrer
          </button>
          <button type="button" onClick={() => setEnEdition(false)} className={buttonSecondarySmallClass}>
            Annuler
          </button>
        </div>
        <form id={formId} action={modifierAvecId} />
      </td>
    </tr>
  );
}
