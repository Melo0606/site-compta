import { notFound } from "next/navigation";
import Link from "next/link";
import { getChargeAnnuelle, updateChargeAnnuelle } from "@/app/actions/charges-annuelles";
import { getPersonnes } from "@/app/actions/personnes";
import {
  inputClass,
  selectClass,
  labelClass,
  buttonClass,
  buttonSecondaryClass,
  sectionHeadingClass,
  helpTextClass,
} from "@/lib/ui";
import { MOIS_OPTIONS } from "@/lib/mois";
import { CompteFields } from "@/components/CompteFields";
import { CategorieSelect } from "@/components/CategorieSelect";

export default async function EditChargeAnnuellePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [charge, personnes] = await Promise.all([getChargeAnnuelle(Number(id)), getPersonnes()]);
  if (!charge) notFound();

  const updateWithId = updateChargeAnnuelle.bind(null, charge.id);

  return (
    <section className="max-w-sm">
      <h2 className={sectionHeadingClass}>Modifier la charge annuelle</h2>
      <form action={updateWithId} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="libelle">
            Libellé
          </label>
          <input className={inputClass} type="text" id="libelle" name="libelle" defaultValue={charge.libelle} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="montant">
            Montant (€)
          </label>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            min="0"
            id="montant"
            name="montant"
            defaultValue={charge.montant}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="moisEcheance">
            Mois d&apos;échéance
          </label>
          <select className={selectClass} id="moisEcheance" name="moisEcheance" defaultValue={charge.moisEcheance}>
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
          <input
            className={inputClass}
            type="number"
            step="0.01"
            min="0"
            id="dejaProvisionne"
            name="dejaProvisionne"
            defaultValue={charge.dejaProvisionne ?? ""}
          />
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
            defaultValue={
              charge.dateDebutProvisionnement ? charge.dateDebutProvisionnement.toISOString().slice(0, 10) : ""
            }
          />
          <p className={helpTextClass}>
            Uniquement pris en compte avec « Déjà provisionné » renseigné ci-dessus. Laisser vide pour
            commencer dès ce mois-ci. Sinon, aucune provision n&apos;est comptée pour cette charge
            avant le mois de cette date (ex : charge créée en cours de mois, ce mois-ci n&apos;a pas pu
            être provisionné).
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="anneeDerniereEcheance">
            Dernière échéance en (année, optionnel)
          </label>
          <input
            className={inputClass}
            type="number"
            step="1"
            min="2000"
            id="anneeDerniereEcheance"
            name="anneeDerniereEcheance"
            placeholder="ex : 2026"
            defaultValue={charge.anneeDerniereEcheance ?? ""}
          />
          <p className={helpTextClass}>
            Pour une charge qui s&apos;arrête (ex : taxe foncière qui passe en mensualisation) : année
            de sa toute dernière échéance. Après ce mois-là, plus rien n&apos;est provisionné ni dû,
            mais les échéances passées restent dans l&apos;historique. Laisser vide pour une charge qui
            se répète chaque année.
          </p>
        </div>
        <CompteFields
          personnes={personnes}
          defaultCompte={charge.compte}
          defaultPersonneId={charge.personneId ?? undefined}
        />
        <CategorieSelect defaultValue={charge.categorieId} />
        <div className="flex gap-2">
          <button type="submit" className={buttonClass}>
            Enregistrer
          </button>
          <Link href="/charges-annuelles" className={buttonSecondaryClass}>
            Annuler
          </Link>
        </div>
      </form>
    </section>
  );
}
