import Link from "next/link";
import {
  getChargesMensuelles,
  createChargeMensuelle,
  deleteChargeMensuelle,
  getHistoriqueMontantsParCharge,
} from "@/app/actions/charges-mensuelles";
import { getPersonnes } from "@/app/actions/personnes";
import { formatEuros, formatDate } from "@/lib/format";
import {
  inputClass,
  labelClass,
  helpTextClass,
  checkboxLabelClass,
  checkboxClass,
  buttonClass,
  buttonDangerSmallClass,
  buttonSecondarySmallClass,
  linkClass,
  pageHeadingClass,
  sectionHeadingClass,
  mutedClass,
  tableWrapClass,
  theadRowClass,
  thClass,
  tdClass,
  tdMutedClass,
  rowClass,
  emptyRowClass,
  pillClass,
} from "@/lib/ui";
import { CompteFields } from "@/components/CompteFields";
import { MoisActifsFields, libelleMoisActifs } from "@/components/MoisActifsFields";
import { CategorieSelect } from "@/components/CategorieSelect";
import { withMontantResolu } from "@/lib/calculs";

export default async function ChargesMensuellesPage() {
  const [chargesBrutes, personnes, historiqueParCharge] = await Promise.all([
    getChargesMensuelles(),
    getPersonnes(),
    getHistoriqueMontantsParCharge(),
  ]);
  // Montant affiché = celui en vigueur ce mois-ci (changements datés compris).
  const aujourdhui = new Date();
  const charges = withMontantResolu(chargesBrutes, historiqueParCharge, aujourdhui.getFullYear(), aujourdhui.getMonth());

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className={pageHeadingClass}>Charges mensuelles</h1>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Les charges récurrentes du foyer, mois après mois.
        </p>
      </div>

      <section>
        <h2 className={sectionHeadingClass}>Charges mensuelles</h2>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Pour cocher au fur et à mesure les charges déjà payées, ça se passe sur la{" "}
          <Link href="/" className={linkClass}>
            page du mois concerné
          </Link>{" "}
          (accessible depuis le tableau de bord).
        </p>
        <div className={`mt-3 ${tableWrapClass}`}>
          <table className="w-full min-w-[640px] text-sm">
            <thead className={theadRowClass}>
              <tr>
                <th className={thClass}>Libellé</th>
                <th className={thClass}>Catégorie</th>
                <th className={thClass}>Compte</th>
                <th className={thClass}>Montant actuel</th>
                <th className={thClass}>Jour de prélèvement</th>
                <th className={thClass}>Actif à partir de</th>
                <th className={thClass}>Actif jusqu&apos;à</th>
                <th className={thClass}>Montant variable</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {charges.map((charge) => (
                <tr key={charge.id} className={rowClass}>
                  <td className={tdClass}>
                    {charge.libelle}
                    {charge.budgetDepensesQuotidiennes && (
                      <span className={`ml-2 ${pillClass("neutral")}`}>
                        budget quotidien
                      </span>
                    )}
                    {charge.budgetDepensesQuotidiennes && charge.montant === 0 && (
                      <span
                        className="ml-1 text-warn"
                        title="Montant de référence à 0 € — il est conseillé de réserver un montant mensuel pour que le solde prévisionnel en tienne compte."
                      >
                        ⚠
                      </span>
                    )}
                    {libelleMoisActifs(charge.moisDebutAnnee, charge.moisFinAnnee) && (
                      <span
                        className={`ml-2 ${pillClass("neutral")}`}
                        title="Ne tombe que ces mois-là chaque année."
                      >
                        {libelleMoisActifs(charge.moisDebutAnnee, charge.moisFinAnnee)}
                      </span>
                    )}
                    {(historiqueParCharge.get(charge.id)?.length ?? 0) > 0 && (
                      <span
                        className={`ml-2 ${pillClass("neutral")}`}
                        title="Cette charge a des changements de montant datés — voir Modifier pour l'historique."
                      >
                        historique
                      </span>
                    )}
                  </td>
                  <td className={tdMutedClass}>{charge.categorie?.nom ?? "—"}</td>
                  <td className={tdMutedClass}>
                    {charge.compte === "COMMUN" ? "Commun" : `Perso — ${charge.personne?.nom ?? "?"}`}
                  </td>
                  <td className={tdClass}>{formatEuros(charge.montant)}</td>
                  <td className={tdMutedClass}>{charge.jourDebit ? `Le ${charge.jourDebit}` : "—"}</td>
                  <td className={tdMutedClass}>
                    {charge.dateDebut ? formatDate(charge.dateDebut) : "—"}
                  </td>
                  <td className={tdMutedClass}>
                    {charge.dateFin ? formatDate(charge.dateFin) : "—"}
                  </td>
                  <td className={tdMutedClass}>{charge.montantVariable ? "Oui" : "Non"}</td>
                  <td className={`${tdClass} text-right`}>
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/charges-mensuelles/${charge.id}`}
                        className={buttonSecondarySmallClass}
                      >
                        Modifier
                      </Link>
                      <form action={deleteChargeMensuelle}>
                        <input type="hidden" name="id" value={charge.id} />
                        <button type="submit" className={buttonDangerSmallClass}>
                          Supprimer
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {charges.length === 0 && (
                <tr>
                  <td colSpan={8} className={emptyRowClass}>
                    Aucune charge mensuelle pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-sm">
        <h2 className={sectionHeadingClass}>Ajouter une charge mensuelle</h2>
        <form action={createChargeMensuelle} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="libelle">
              Libellé
            </label>
            <input className={inputClass} type="text" id="libelle" name="libelle" required />
          </div>
          <CategorieSelect required />
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="montant">
              Montant (€)
            </label>
            <input className={inputClass} type="number" step="0.01" min="0" id="montant" name="montant" required />
          </div>
          <CompteFields personnes={personnes} />
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dateDebut">
              Date de début (optionnel)
            </label>
            <input className={inputClass} type="date" id="dateDebut" name="dateDebut" />
            <p className={helpTextClass}>
              Laisser vide pour une charge active dès maintenant. Sinon, elle ne comptera qu&apos;à
              partir du mois de cette date.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dateFin">
              Date de fin (optionnel)
            </label>
            <input className={inputClass} type="date" id="dateFin" name="dateFin" />
            <p className={helpTextClass}>
              Laisser vide pour une charge active indéfiniment. Sinon, elle ne comptera plus à
              partir du mois suivant cette date (ex : fin de crédit, résiliation).
            </p>
          </div>
          <MoisActifsFields />
          <label className={checkboxLabelClass}>
            <input type="checkbox" name="montantVariable" className={checkboxClass} />
            Montant variable (le montant réel peut différer du montant de référence, ex. carburant)
          </label>
          <p className={helpTextClass}>
            Si coché, tu pourras saisir chaque mois le montant réellement payé. Sinon, la charge est
            considérée payée au montant de référence par défaut.
          </p>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="jourDebit">
              Jour de prélèvement (optionnel)
            </label>
            <input
              className={inputClass}
              type="number"
              step="1"
              min="1"
              max="31"
              id="jourDebit"
              name="jourDebit"
            />
            <p className={helpTextClass}>
              Jour du mois où le prélèvement a réellement lieu (ex : 5). Laisser vide si inconnu ou
              variable. Sert uniquement à affiner le solde projeté du mois en cours : avant ce jour,
              la charge n&apos;est pas encore comptée comme débitée.
            </p>
          </div>
          <button type="submit" className={`${buttonClass} self-start`}>
            Ajouter
          </button>
        </form>
      </section>
    </div>
  );
}
