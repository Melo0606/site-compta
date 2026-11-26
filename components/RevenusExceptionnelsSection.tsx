import { ajouterRevenuExceptionnel, type RevenuExceptionnelRow as RevenuExceptionnelRowType } from "@/app/actions/mois";
import { formatEuros } from "@/lib/format";
import { inputClass, buttonClass, sectionHeadingClass, mutedClass, tableWrapClass, theadRowClass, thClass } from "@/lib/ui";
import { CategorieSelect } from "@/components/CategorieSelect";
import { RevenuExceptionnelRow } from "@/components/RevenuExceptionnelRow";

/** Revenus exceptionnels (ventes, cadeaux…) du compte commun ou d'une personne, selon `personneId`, pour un mois donné. */
export function RevenusExceptionnelsSection({
  titre,
  annee,
  moisStocke,
  personneId,
  revenus,
  sousSection = false,
}: {
  titre: string;
  annee: number;
  moisStocke: number;
  personneId: number | null;
  revenus: RevenuExceptionnelRowType[];
  /** Affichée sous un autre tableau (titre plus discret). */
  sousSection?: boolean;
}) {
  const total = revenus.reduce((sum, r) => sum + r.montant, 0);
  const ajouterAvecContexte = ajouterRevenuExceptionnel.bind(null, annee, moisStocke, personneId);
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const formId = `ajout-revenu-exceptionnel-${personneId ?? "commun"}`;

  return (
    <div className={sousSection ? "mt-5" : undefined}>
      {sousSection ? (
        <h4 className="text-sm font-semibold text-text">{titre}</h4>
      ) : (
        <h3 className={sectionHeadingClass}>{titre}</h3>
      )}
      <p className={`mt-1 text-sm ${mutedClass}`}>
        Rentrées d&apos;argent ponctuelles (vente, cadeau…), autant de lignes que nécessaire. Le solde est crédité dès
        la saisie.
      </p>
      <div className={`mt-3 ${tableWrapClass}`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead className={theadRowClass}>
            <tr>
              <th className={thClass}>Libellé</th>
              <th className={thClass}>Catégorie</th>
              <th className={thClass}>Date</th>
              <th className={thClass}>Montant</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody>
            {revenus.map((r) => (
              <RevenuExceptionnelRow
                key={r.id}
                revenu={r}
                categorieSelect={
                  <CategorieSelect
                    type="REVENU"
                    formHtmlId={`modifier-revenu-exceptionnel-${r.id}`}
                    defaultValue={r.categorieId}
                    hideLabel
                  />
                }
              />
            ))}
            <tr className="border-t border-border bg-surface-muted/60">
              <td className="px-4 py-2.5">
                <input className={inputClass} type="text" form={formId} name="libelle" placeholder="Libellé" required />
              </td>
              <td className="px-4 py-2.5">
                <CategorieSelect type="REVENU" id={`${formId}-categorie`} formHtmlId={formId} hideLabel />
              </td>
              <td className="px-4 py-2.5">
                <input className={inputClass} type="date" form={formId} name="date" defaultValue={aujourdHui} />
              </td>
              <td className="px-4 py-2.5">
                <input
                  className={`${inputClass} w-28`}
                  type="number"
                  step="0.01"
                  min="0.01"
                  form={formId}
                  name="montant"
                  placeholder="0,00"
                  required
                />
              </td>
              <td className="px-4 py-2.5 text-right">
                <button type="submit" form={formId} className={buttonClass}>
                  Ajouter
                </button>
              </td>
            </tr>
          </tbody>
          {revenus.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-medium text-text">
                <td className="px-4 py-2.5" colSpan={3}>
                  Total
                </td>
                <td className="px-4 py-2.5" colSpan={2}>
                  +{formatEuros(total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <form id={formId} action={ajouterAvecContexte} />
    </div>
  );
}
