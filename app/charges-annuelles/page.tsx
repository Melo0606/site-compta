import Link from "next/link";
import {
  getChargesAnnuelles,
  createChargeAnnuelle,
  deleteChargeAnnuelle,
  marquerChargeAnnuellePayee,
  demarquerChargeAnnuellePayee,
} from "@/app/actions/charges-annuelles";
import { getPersonnes } from "@/app/actions/personnes";
import { formatEuros } from "@/lib/format";
import {
  inputClass,
  selectClass,
  labelClass,
  buttonClass,
  buttonDangerSmallClass,
  buttonSecondarySmallClass,
  buttonPositiveSmallClass,
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
  helpTextClass,
  pillClass,
} from "@/lib/ui";
import { MOIS_OPTIONS } from "@/lib/mois";
import { provisionChargeAnnuelle, dejaPayeeCeCycle, chargeAnnuelleTerminee } from "@/lib/calculs";
import { CompteFields } from "@/components/CompteFields";
import { CategorieSelect } from "@/components/CategorieSelect";

export default async function ChargesAnnuellesPage() {
  const [charges, personnes] = await Promise.all([getChargesAnnuelles(), getPersonnes()]);
  const aujourdhui = new Date();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className={pageHeadingClass}>Charges annuelles</h1>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Les charges qui reviennent une fois par an, provisionnées mois par mois.
        </p>
      </div>

      <section>
        <h2 className={sectionHeadingClass}>Charges annuelles</h2>
        <div className={`mt-3 ${tableWrapClass}`}>
          <table className="w-full min-w-[640px] text-sm">
            <thead className={theadRowClass}>
              <tr>
                <th className={thClass}>Libellé</th>
                <th className={thClass}>Catégorie</th>
                <th className={thClass}>Mois d&apos;échéance</th>
                <th className={thClass}>Compte</th>
                <th className={thClass}>Montant</th>
                <th className={thClass}>Provision / mois</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {charges.map((charge) => {
                const dejaPayee = dejaPayeeCeCycle(charge, aujourdhui.getFullYear(), aujourdhui.getMonth());
                const terminee = chargeAnnuelleTerminee(charge, aujourdhui.getFullYear(), aujourdhui.getMonth());
                return (
                  <tr key={charge.id} className={rowClass}>
                    <td className={tdClass}>
                      {charge.libelle}
                      {dejaPayee && <span className={`ml-2 ${pillClass("pos")}`}>Payée</span>}
                      {charge.anneeDerniereEcheance !== null && (
                        <span className={`ml-2 ${pillClass("neutral")}`}>
                          {terminee ? "Terminée" : "Dernière échéance"} :{" "}
                          {MOIS_OPTIONS.find((m) => m.value === charge.moisEcheance)?.label.toLowerCase()}{" "}
                          {charge.anneeDerniereEcheance}
                        </span>
                      )}
                    </td>
                    <td className={tdMutedClass}>{charge.categorie?.nom ?? "—"}</td>
                    <td className={tdMutedClass}>
                      {MOIS_OPTIONS.find((m) => m.value === charge.moisEcheance)?.label}
                    </td>
                    <td className={tdMutedClass}>
                      {charge.compte === "COMMUN" ? "Commun" : `Perso — ${charge.personne?.nom ?? "?"}`}
                    </td>
                    <td className={tdClass}>{formatEuros(charge.montant)}</td>
                    <td className={tdMutedClass}>
                      {formatEuros(provisionChargeAnnuelle(charge))}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <div className="flex justify-end gap-2">
                        {dejaPayee ? (
                          <form action={demarquerChargeAnnuellePayee}>
                            <input type="hidden" name="id" value={charge.id} />
                            <button type="submit" className={buttonSecondarySmallClass}>
                              Repasser en attente
                            </button>
                          </form>
                        ) : terminee ? null : (
                          <form action={marquerChargeAnnuellePayee.bind(null, null, null)}>
                            <input type="hidden" name="id" value={charge.id} />
                            <button type="submit" className={buttonPositiveSmallClass}>
                              Marquer comme payé
                            </button>
                          </form>
                        )}
                        <Link
                          href={`/charges-annuelles/${charge.id}`}
                          className={buttonSecondarySmallClass}
                        >
                          Modifier
                        </Link>
                        <form action={deleteChargeAnnuelle}>
                          <input type="hidden" name="id" value={charge.id} />
                          <button type="submit" className={buttonDangerSmallClass}>
                            Supprimer
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {charges.length === 0 && (
                <tr>
                  <td colSpan={7} className={emptyRowClass}>
                    Aucune charge annuelle pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-sm">
        <h2 className={sectionHeadingClass}>Ajouter une charge annuelle</h2>
        <form action={createChargeAnnuelle} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="libelle">
              Libellé
            </label>
            <input className={inputClass} type="text" id="libelle" name="libelle" required />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="montant">
              Montant (€)
            </label>
            <input className={inputClass} type="number" step="0.01" min="0" id="montant" name="montant" required />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="moisEcheance">
              Mois d&apos;échéance
            </label>
            <select className={selectClass} id="moisEcheance" name="moisEcheance" defaultValue={1}>
              {MOIS_OPTIONS.map((mois) => (
                <option key={mois.value} value={mois.value}>
                  {mois.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dejaProvisionne">
              Déjà provisionné (€, optionnel)
            </label>
            <input className={inputClass} type="number" step="0.01" min="0" id="dejaProvisionne" name="dejaProvisionne" />
            <p className={helpTextClass}>
              À remplir uniquement pour une charge tout juste créée dont la prochaine échéance est
              proche (ex : 0€ si rien n&apos;a encore été mis de côté) : la provision est alors répartie
              sur les mois restants avant cette échéance au lieu du lissage sur 12 mois habituel. Laisser
              vide pour le comportement classique. Ne s&apos;applique qu&apos;à la toute prochaine
              échéance, plus besoin d&apos;y toucher ensuite.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dateDebutProvisionnement">
              Début du provisionnement (optionnel)
            </label>
            <input
              className={inputClass}
              type="date"
              id="dateDebutProvisionnement"
              name="dateDebutProvisionnement"
            />
            <p className={helpTextClass}>
              Uniquement pris en compte avec « Déjà provisionné » renseigné ci-dessus. Laisser vide pour
              commencer dès ce mois-ci. Sinon, aucune provision n&apos;est comptée pour cette charge
              avant le mois de cette date (ex : charge créée en cours de mois, ce mois-ci n&apos;a pas
              pu être provisionné).
            </p>
          </div>
          <CompteFields personnes={personnes} />
          <CategorieSelect />
          <button type="submit" className={`${buttonClass} self-start`}>
            Ajouter
          </button>
        </form>
      </section>
    </div>
  );
}
