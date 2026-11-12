import {
  ajouterDepenseQuotidienne,
  type DepenseQuotidienneRow as DepenseQuotidienneRowType,
} from "@/app/actions/mois";
import { formatEuros } from "@/lib/format";
import {
  inputClass,
  selectClass,
  buttonClass,
  sectionHeadingClass,
  mutedClass,
  tableWrapClass,
  theadRowClass,
  thClass,
} from "@/lib/ui";
import { CategorieSelect } from "@/components/CategorieSelect";
import { DepenseQuotidienneRow } from "@/components/DepenseQuotidienneRow";

/** Section « Dépenses du quotidien » (compte commun ou une personne, selon `personneId`), pour un mois donné. */
export function DepensesQuotidiennesSection({
  titre,
  annee,
  moisStocke,
  personneId,
  depenses,
}: {
  titre: string;
  annee: number;
  moisStocke: number;
  personneId: number | null;
  depenses: DepenseQuotidienneRowType[];
}) {
  const total = depenses.reduce((sum, d) => sum + d.montant, 0);
  const avecRemboursements = depenses.some((d) => d.montant < 0);
  const ajouterAvecContexte = ajouterDepenseQuotidienne.bind(null, annee, moisStocke, personneId);
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const idSuffix = personneId ?? "commun";
  const formId = `ajout-depense-${idSuffix}`;

  return (
    <section>
      <h3 className={sectionHeadingClass}>{titre}</h3>
      <p className={`mt-1 text-sm ${mutedClass}`}>
        Dépenses ponctuelles hors charges et achats planifiés (ex : vues sur le relevé bancaire), pour
        que le solde ci-dessus corresponde exactement au compte réel. Un remboursement reçu se saisit
        ici aussi (choisir « Remboursement ») : il recrédite le solde et vient en déduction des dépenses
        du mois.
      </p>
      <div className={`mt-3 ${tableWrapClass}`}>
        <table className="w-full min-w-[780px] text-sm">
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
            {depenses.map((d) => (
              <DepenseQuotidienneRow
                key={d.id}
                depense={d}
                categorieSelect={
                  <CategorieSelect
                    formHtmlId={`modifier-depense-${d.id}`}
                    defaultValue={d.categorieId}
                    hideLabel
                  />
                }
              />
            ))}
            <tr className="border-t border-border bg-surface-muted/60">
              <td className="px-4 py-2.5">
                <input
                  className={inputClass}
                  type="text"
                  form={formId}
                  name="libelle"
                  placeholder="Libellé"
                  required
                />
              </td>
              <td className="px-4 py-2.5">
                <CategorieSelect formHtmlId={formId} hideLabel />
              </td>
              <td className="px-4 py-2.5">
                <input className={inputClass} type="date" form={formId} name="date" defaultValue={aujourdHui} />
              </td>
              <td className="px-4 py-2.5">
                <div className="flex gap-2">
                  <select className={`${selectClass} w-auto! shrink-0`} form={formId} name="sens" defaultValue="depense" aria-label="Type">
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
                    placeholder="0,00"
                    required
                  />
                </div>
              </td>
              <td className="px-4 py-2.5 text-right">
                <button type="submit" form={formId} className={buttonClass}>
                  Ajouter
                </button>
              </td>
            </tr>
          </tbody>
          {depenses.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-medium text-text">
                <td className="px-4 py-2.5" colSpan={3}>
                  {avecRemboursements ? "Total (remboursements déduits)" : "Total"}
                </td>
                <td className="px-4 py-2.5" colSpan={2}>
                  {formatEuros(total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <form id={formId} action={ajouterAvecContexte} />
    </section>
  );
}
