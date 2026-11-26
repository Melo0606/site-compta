"use client";

import { useState, type ReactNode } from "react";
import {
  modifierRevenuExceptionnel,
  supprimerRevenuExceptionnel,
  type RevenuExceptionnelRow as RevenuExceptionnelRowType,
} from "@/app/actions/mois";
import { formatEuros, formatDate } from "@/lib/format";
import { inputClass, buttonSecondarySmallClass, buttonDangerSmallClass, tdClass, tdMutedClass, rowClass } from "@/lib/ui";

/** Ligne « Revenus exceptionnels », éditable sur place (bascule affichage/formulaire). */
export function RevenuExceptionnelRow({
  revenu,
  categorieSelect,
}: {
  revenu: RevenuExceptionnelRowType;
  categorieSelect: ReactNode;
}) {
  const [enEdition, setEnEdition] = useState(false);
  const modifierAvecId = modifierRevenuExceptionnel.bind(null, revenu.id);
  const formId = `modifier-revenu-exceptionnel-${revenu.id}`;

  if (!enEdition) {
    return (
      <tr className={rowClass}>
        <td className={tdClass}>{revenu.libelle}</td>
        <td className={tdMutedClass}>{revenu.categorieNom ?? "—"}</td>
        <td className={tdMutedClass}>{revenu.date ? formatDate(revenu.date) : "—"}</td>
        <td className={tdClass}>
          <span className="text-pos">+{formatEuros(revenu.montant)}</span>
        </td>
        <td className="px-4 py-2.5 text-right">
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEnEdition(true)} className={buttonSecondarySmallClass}>
              Modifier
            </button>
            <form action={supprimerRevenuExceptionnel}>
              <input type="hidden" name="id" value={revenu.id} />
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
        <input className={inputClass} type="text" form={formId} name="libelle" defaultValue={revenu.libelle} required />
      </td>
      <td className="px-4 py-2.5">{categorieSelect}</td>
      <td className="px-4 py-2.5">
        <input
          className={inputClass}
          type="date"
          form={formId}
          name="date"
          defaultValue={revenu.date ? revenu.date.toISOString().slice(0, 10) : ""}
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          className={`${inputClass} w-28`}
          type="number"
          step="0.01"
          min="0.01"
          form={formId}
          name="montant"
          defaultValue={revenu.montant}
          required
        />
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
