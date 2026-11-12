import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getChargeMensuelle,
  updateChargeMensuelle,
  getHistoriqueMontantsPourCharge,
  changerMontantDepuis,
  supprimerHistoriqueMontant,
  corrigerMontantPeriode,
} from "@/app/actions/charges-mensuelles";
import { getPersonnes } from "@/app/actions/personnes";
import {
  inputClass,
  selectClass,
  labelClass,
  helpTextClass,
  checkboxLabelClass,
  checkboxClass,
  buttonClass,
  buttonSecondaryClass,
  buttonSecondarySmallClass,
  buttonDangerSmallClass,
  pillClass,
  sectionHeadingClass,
  mutedClass,
  tableWrapClass,
  theadRowClass,
  thClass,
  tdClass,
  tdMutedClass,
  rowClass,
} from "@/lib/ui";
import { MOIS_OPTIONS } from "@/lib/mois";
import { moisLabel, periodesMontantsCharge, type PeriodeMontantCharge } from "@/lib/calculs";
import { CompteFields } from "@/components/CompteFields";
import { MoisActifsFields } from "@/components/MoisActifsFields";
import { CategorieSelect } from "@/components/CategorieSelect";

export default async function EditChargeMensuellePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [charge, personnes, historique] = await Promise.all([
    getChargeMensuelle(Number(id)),
    getPersonnes(),
    getHistoriqueMontantsPourCharge(Number(id)),
  ]);
  if (!charge) notFound();

  const updateWithId = updateChargeMensuelle.bind(null, charge.id);
  const changerMontantWithId = changerMontantDepuis.bind(null, charge.id);
  const corrigerPeriodeWithId = corrigerMontantPeriode.bind(null, charge.id);
  const aujourdhui = new Date();
  const periodes = periodesMontantsCharge(charge, historique, aujourdhui);
  const montantActuel = periodes.find((p) => p.enCours)?.montant ?? charge.montant;
  const libellePeriode = (p: PeriodeMontantCharge) => {
    const debut = p.debut
      ? moisLabel(p.debut.annee, p.debut.mois)
      : charge.dateDebut
        ? moisLabel(charge.dateDebut.getFullYear(), charge.dateDebut.getMonth())
        : "début";
    const fin = p.fin
      ? moisLabel(p.fin.annee, p.fin.mois)
      : charge.dateFin
        ? moisLabel(charge.dateFin.getFullYear(), charge.dateFin.getMonth())
        : "sans fin pour le moment";
    return `${debut} → ${fin}`;
  };

  return (
    <div className="flex flex-col gap-8">
    <section className="max-w-sm">
      <h2 className={sectionHeadingClass}>Modifier la charge mensuelle</h2>
      <form action={updateWithId} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="libelle">
            Libellé
          </label>
          <input className={inputClass} type="text" id="libelle" name="libelle" defaultValue={charge.libelle} required />
        </div>
        <CategorieSelect defaultValue={charge.categorieId} required />
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="montant">
            Montant actuel
          </label>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            min="0"
            id="montant"
            name="montant"
            defaultValue={montantActuel}
            required
          />
          <p className={helpTextClass}>
            {historique.length > 0 ? (
              <>
                Montant en vigueur ce mois-ci ({moisLabel(aujourdhui.getFullYear(), aujourdhui.getMonth())}).
                Le modifier corrige uniquement la période en cours de l&apos;historique ci-dessous.
              </>
            ) : (
              <>Montant appliqué à tous les mois.</>
            )}{" "}
            Pour un changement réel de tarif, utiliser « Changer le montant à partir d&apos;un mois » :
            l&apos;ancien montant est conservé dans l&apos;historique.
          </p>
        </div>
        <CompteFields
          personnes={personnes}
          defaultCompte={charge.compte}
          defaultPersonneId={charge.personneId ?? undefined}
        />
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="dateDebut">
            Date de début (optionnel)
          </label>
          <input
            className={inputClass}
            type="date"
            id="dateDebut"
            name="dateDebut"
            defaultValue={charge.dateDebut ? charge.dateDebut.toISOString().slice(0, 10) : ""}
          />
          <p className={helpTextClass}>
            Laisser vide pour une charge active dès maintenant. Sinon, elle ne comptera qu&apos;à
            partir du mois de cette date.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="dateFin">
            Date de fin (optionnel)
          </label>
          <input
            className={inputClass}
            type="date"
            id="dateFin"
            name="dateFin"
            defaultValue={charge.dateFin ? charge.dateFin.toISOString().slice(0, 10) : ""}
          />
          <p className={helpTextClass}>
            Laisser vide pour une charge active indéfiniment. Sinon, elle ne comptera plus à
            partir du mois suivant cette date (ex : fin de crédit, résiliation).
          </p>
        </div>
        <MoisActifsFields defaultDebut={charge.moisDebutAnnee} defaultFin={charge.moisFinAnnee} />
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            name="montantVariable"
            defaultChecked={charge.montantVariable}
            className={checkboxClass}
          />
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
            defaultValue={charge.jourDebit ?? ""}
          />
          <p className={helpTextClass}>
            Jour du mois où le prélèvement a réellement lieu (ex : 5). Laisser vide si inconnu ou
            variable. Sert uniquement à affiner le solde projeté du mois en cours : avant ce jour,
            la charge n&apos;est pas encore comptée comme débitée.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass}>
            Enregistrer
          </button>
          <Link href="/charges-mensuelles" className={buttonSecondaryClass}>
            Annuler
          </Link>
        </div>
      </form>
    </section>

    <section className="max-w-sm">
      <h2 className={sectionHeadingClass}>Changer le montant à partir d&apos;un mois</h2>
      <p className={`mt-1 text-sm ${mutedClass}`}>
        Pour un changement réel (ex : l&apos;assurance passe de 150 € à 120 € à partir de mars) — seuls
        ce mois et les suivants sont affectés, les mois antérieurs gardent leur montant.
      </p>
      <form action={changerMontantWithId} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="montant-depuis">
            Nouveau montant (€)
          </label>
          <input className={inputClass} type="number" step="0.01" min="0" id="montant-depuis" name="montant" required />
        </div>
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label className={labelClass} htmlFor="depuisMois">
              À partir du mois
            </label>
            <select className={selectClass} id="depuisMois" name="depuisMois" defaultValue={aujourdhui.getMonth() + 1}>
              {MOIS_OPTIONS.map((mois) => (
                <option key={mois.value} value={mois.value}>
                  {mois.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="depuisAnnee">
              Année
            </label>
            <input
              className={`${inputClass} w-24`}
              type="number"
              id="depuisAnnee"
              name="depuisAnnee"
              defaultValue={aujourdhui.getFullYear()}
              required
            />
          </div>
        </div>
        <button type="submit" className={`${buttonClass} self-start`}>
          Appliquer à partir de ce mois
        </button>
      </form>
    </section>

    {historique.length > 0 && (
      <section>
        <h2 className={sectionHeadingClass}>Historique des montants</h2>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          En cas d&apos;erreur de saisie, corriger le montant d&apos;une période ici : les dates ne
          changent pas. Supprimer un changement daté rattache ses mois à la période précédente.
        </p>
        <div className={`mt-3 ${tableWrapClass}`}>
          <table className="w-full min-w-[520px] text-sm">
            <thead className={theadRowClass}>
              <tr>
                <th className={thClass}>Période</th>
                <th className={thClass}>Montant</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {periodes.map((p) => {
                const formId = `corriger-periode-${p.historiqueId ?? "base"}`;
                return (
                  <tr key={formId} className={rowClass}>
                    <td className={tdMutedClass}>
                      <span className="first-letter:uppercase inline-block">{libellePeriode(p)}</span>
                      {p.enCours && <span className={`ml-2 ${pillClass("neutral")}`}>en cours</span>}
                    </td>
                    <td className={tdClass}>
                      <form id={formId} action={corrigerPeriodeWithId} className="flex items-center gap-2">
                        <input type="hidden" name="historiqueId" value={p.historiqueId ?? ""} />
                        <input
                          className={`${inputClass} w-28`}
                          type="number"
                          step="0.01"
                          min="0"
                          name="montant"
                          defaultValue={p.montant}
                          aria-label={`Montant ${libellePeriode(p)}`}
                          required
                        />
                        <span className={mutedClass}>€</span>
                      </form>
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <div className="flex justify-end gap-2">
                        <button type="submit" form={formId} className={buttonSecondarySmallClass}>
                          Corriger
                        </button>
                        {p.historiqueId !== null && (
                          <form action={supprimerHistoriqueMontant}>
                            <input type="hidden" name="id" value={p.historiqueId} />
                            <button type="submit" className={buttonDangerSmallClass}>
                              Supprimer
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    )}
    </div>
  );
}
