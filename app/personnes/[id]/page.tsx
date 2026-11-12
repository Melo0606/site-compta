import { notFound } from "next/navigation";
import { getPersonne, updatePersonne } from "@/app/actions/personnes";
import { inputClass, labelClass, buttonClass, buttonSecondaryClass, sectionHeadingClass, helpTextClass } from "@/lib/ui";
import Link from "next/link";

export default async function EditPersonnePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personne = await getPersonne(Number(id));
  if (!personne) notFound();

  const updateWithId = updatePersonne.bind(null, personne.id);

  return (
    <section className="max-w-sm">
      <h2 className={sectionHeadingClass}>Modifier la personne</h2>
      <form action={updateWithId} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="nom">
            Nom
          </label>
          <input className={inputClass} type="text" id="nom" name="nom" defaultValue={personne.nom} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="soldePerso">
            Solde actuel du compte perso (€)
          </label>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            id="soldePerso"
            name="soldePerso"
            defaultValue={personne.soldePerso}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="soldeEpargne">
            Solde actuel du compte épargne (€)
          </label>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            id="soldeEpargne"
            name="soldeEpargne"
            defaultValue={personne.soldeEpargne}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="virementMensuelHabituel">
            Virement mensuel habituel vers le compte commun (€)
          </label>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            min="0"
            id="virementMensuelHabituel"
            name="virementMensuelHabituel"
            defaultValue={personne.virementMensuelHabituel}
          />
          <p className={helpTextClass}>
            Ce que cette personne transfère réellement chaque mois (peut différer du virement dû
            théorique). Utilisé pour projeter les mois futurs.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="virementEpargneMensuelHabituel">
            Virement épargne mensuel habituel (€)
          </label>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            min="0"
            id="virementEpargneMensuelHabituel"
            name="virementEpargneMensuelHabituel"
            defaultValue={personne.virementEpargneMensuelHabituel}
          />
          <p className={helpTextClass}>
            Ce que cette personne vire habituellement chaque mois de son compte perso vers son compte
            épargne. Modifiable mois par mois (positif = dépôt, négatif = retrait) dans le détail du
            mois.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass}>
            Enregistrer
          </button>
          <Link href="/personnes" className={buttonSecondaryClass}>
            Annuler
          </Link>
        </div>
      </form>
    </section>
  );
}
