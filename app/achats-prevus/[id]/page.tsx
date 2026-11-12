import { notFound } from "next/navigation";
import Link from "next/link";
import { getAchatPrevu, updateAchatPrevu } from "@/app/actions/achats-prevus";
import { getPersonnes } from "@/app/actions/personnes";
import {
  inputClass,
  labelClass,
  buttonClass,
  buttonSecondaryClass,
  sectionHeadingClass,
  helpTextClass,
  checkboxLabelClass,
  checkboxClass,
} from "@/lib/ui";
import { CategorieSelect } from "@/components/CategorieSelect";
import { CompteFields } from "@/components/CompteFields";

export default async function EditAchatPrevuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [achat, personnes] = await Promise.all([getAchatPrevu(Number(id)), getPersonnes()]);
  if (!achat) notFound();

  const updateWithId = updateAchatPrevu.bind(null, achat.id);
  const dateViseeValue = achat.dateVisee.toISOString().slice(0, 10);
  const dateDebutValue = achat.dateDebutProvisionnement
    ? achat.dateDebutProvisionnement.toISOString().slice(0, 10)
    : "";

  return (
    <section className="max-w-sm">
      <h2 className={sectionHeadingClass}>Modifier l&apos;achat prévu</h2>
      <form action={updateWithId} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="libelle">
            Libellé
          </label>
          <input className={inputClass} type="text" id="libelle" name="libelle" defaultValue={achat.libelle} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="montantCible">
            Montant cible (€)
          </label>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            min="0"
            id="montantCible"
            name="montantCible"
            defaultValue={achat.montantCible}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="dejaProvisionne">
            Déjà provisionné (€)
          </label>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            min="0"
            id="dejaProvisionne"
            name="dejaProvisionne"
            defaultValue={achat.dejaProvisionne}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="dateVisee">
            Date visée
          </label>
          <input
            className={inputClass}
            type="date"
            id="dateVisee"
            name="dateVisee"
            defaultValue={dateViseeValue}
            required
          />
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
            defaultValue={dateDebutValue}
          />
          <p className={helpTextClass}>
            Laisser vide pour commencer dès maintenant. Sinon, l&apos;achat n&apos;apparaît et
            n&apos;est provisionné qu&apos;à partir du mois de cette date.
          </p>
        </div>
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            name="sansProvisionnement"
            defaultChecked={achat.sansProvisionnement}
            className={checkboxClass}
          />
          Pas de provisionnement
        </label>
        <p className={helpTextClass}>
          Si coché, aucune provision mensuelle n&apos;est collectée : l&apos;achat n&apos;apparaît et ne
          pèse sur le besoin qu&apos;au mois de l&apos;échéance, montant plein d&apos;un coup.
        </p>
        <CompteFields
          personnes={personnes}
          defaultCompte={achat.compte}
          defaultPersonneId={achat.personneId ?? undefined}
        />
        <CategorieSelect defaultValue={achat.categorieId} />
        <div className="flex gap-2">
          <button type="submit" className={buttonClass}>
            Enregistrer
          </button>
          <Link href="/achats-prevus" className={buttonSecondaryClass}>
            Annuler
          </Link>
        </div>
      </form>
    </section>
  );
}
