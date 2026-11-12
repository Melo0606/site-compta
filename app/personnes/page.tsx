import Link from "next/link";
import { getPersonnes, createPersonne, deletePersonne } from "@/app/actions/personnes";
import { formatEuros } from "@/lib/format";
import {
  inputClass,
  labelClass,
  buttonClass,
  buttonDangerSmallClass,
  buttonSecondarySmallClass,
  pageHeadingClass,
  sectionHeadingClass,
  mutedClass,
  tableWrapClass,
  theadRowClass,
  thClass,
  tdClass,
  rowClass,
  emptyRowClass,
  helpTextClass,
} from "@/lib/ui";

export default async function PersonnesPage() {
  const personnes = await getPersonnes();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className={pageHeadingClass}>Personnes</h1>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Membres du foyer, leurs soldes et leur virement mensuel habituel.
        </p>
      </div>

      <section>
        <h2 className={sectionHeadingClass}>Personnes</h2>
        <div className={`mt-3 ${tableWrapClass}`}>
          <table className="w-full min-w-[720px] text-sm">
            <thead className={theadRowClass}>
              <tr>
                <th className={thClass}>Nom</th>
                <th className={thClass}>Solde perso actuel</th>
                <th className={thClass}>Solde épargne actuel</th>
                <th className={thClass}>Virement mensuel habituel</th>
                <th className={thClass}>Virement épargne habituel</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {personnes.map((personne) => (
                <tr key={personne.id} className={rowClass}>
                  <td className={tdClass}>{personne.nom}</td>
                  <td className={tdClass}>{formatEuros(personne.soldePerso)}</td>
                  <td className={tdClass}>{formatEuros(personne.soldeEpargne)}</td>
                  <td className={tdClass}>
                    {formatEuros(personne.virementMensuelHabituel)}
                  </td>
                  <td className={tdClass}>
                    {formatEuros(personne.virementEpargneMensuelHabituel)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/personnes/${personne.id}`} className={buttonSecondarySmallClass}>
                        Modifier
                      </Link>
                      <form action={deletePersonne}>
                        <input type="hidden" name="id" value={personne.id} />
                        <button type="submit" className={buttonDangerSmallClass}>
                          Supprimer
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {personnes.length === 0 && (
                <tr>
                  <td colSpan={6} className={emptyRowClass}>
                    Aucune personne pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-sm">
        <h2 className={sectionHeadingClass}>Ajouter une personne</h2>
        <form action={createPersonne} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="nom">
              Nom
            </label>
            <input className={inputClass} type="text" id="nom" name="nom" required />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="soldePerso">
              Solde actuel du compte perso (€)
            </label>
            <input className={inputClass} type="number" step="0.01" id="soldePerso" name="soldePerso" defaultValue={0} />
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
              defaultValue={0}
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
              defaultValue={0}
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
              defaultValue={0}
            />
            <p className={helpTextClass}>
              Ce que cette personne vire habituellement chaque mois de son compte perso vers son compte
              épargne. Modifiable mois par mois (positif = dépôt, négatif = retrait) dans le détail du
              mois.
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
