import Link from "next/link";
import { getRevenus, createRevenu, deleteRevenu } from "@/app/actions/revenus";
import { getPersonnes } from "@/app/actions/personnes";
import { formatEuros, formatDate } from "@/lib/format";
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
  tdMutedClass,
  rowClass,
  emptyRowClass,
  linkClass,
  linkMutedClass,
} from "@/lib/ui";
import { RevenuTypeFields } from "@/components/RevenuTypeFields";
import { MOIS_OPTIONS } from "@/lib/mois";

export default async function RevenusPage({
  searchParams,
}: {
  searchParams: Promise<{ historique?: string }>;
}) {
  const { historique } = await searchParams;
  const afficherHistorique = historique === "1";
  const [tousLesRevenus, personnes] = await Promise.all([getRevenus(), getPersonnes()]);

  // Un revenu ponctuel est archivé (masqué par défaut) à partir du mois
  // suivant son versement, pour ne pas garder une liste infinie.
  const debutMoisEnCours = new Date();
  debutMoisEnCours.setDate(1);
  debutMoisEnCours.setHours(0, 0, 0, 0);
  const estArchive = (revenu: (typeof tousLesRevenus)[number]) =>
    revenu.type === "PONCTUEL" && revenu.date !== null && revenu.date < debutMoisEnCours;
  const revenus = afficherHistorique ? tousLesRevenus : tousLesRevenus.filter((r) => !estArchive(r));
  const nbArchives = tousLesRevenus.filter(estArchive).length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className={pageHeadingClass}>Revenus</h1>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Sources de revenus du foyer, mensuelles, annuelles ou ponctuelles.
        </p>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionHeadingClass}>Revenus</h2>
          {nbArchives > 0 && (
            <Link
              href={afficherHistorique ? "/revenus" : "/revenus?historique=1"}
              className={`text-sm ${linkMutedClass}`}
            >
              {afficherHistorique
                ? "Masquer l'historique"
                : `Afficher l'historique (${nbArchives} revenu${nbArchives > 1 ? "s" : ""} ponctuel${nbArchives > 1 ? "s" : ""} passé${nbArchives > 1 ? "s" : ""})`}
            </Link>
          )}
        </div>
        <div className={`mt-3 ${tableWrapClass}`}>
          <table className="w-full min-w-[560px] text-sm">
            <thead className={theadRowClass}>
              <tr>
                <th className={thClass}>Libellé</th>
                <th className={thClass}>Personne</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Date</th>
                <th className={thClass}>Jour de versement</th>
                <th className={thClass}>Montant</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {revenus.map((revenu) => (
                <tr key={revenu.id} className={rowClass}>
                  <td className={tdClass}>{revenu.libelle}</td>
                  <td className={tdMutedClass}>{revenu.personne.nom}</td>
                  <td className={tdMutedClass}>
                    {revenu.type === "MENSUEL"
                      ? "Mensuel"
                      : revenu.type === "ANNUEL"
                        ? "Annuel"
                        : "Ponctuel"}
                  </td>
                  <td className={tdMutedClass}>
                    {revenu.type === "PONCTUEL" && revenu.date
                      ? formatDate(revenu.date)
                      : revenu.type === "ANNUEL" && revenu.moisRecurrence
                        ? MOIS_OPTIONS.find((m) => m.value === revenu.moisRecurrence)?.label
                        : "—"}
                  </td>
                  <td className={tdMutedClass}>{revenu.jourVersement ? `Le ${revenu.jourVersement}` : "—"}</td>
                  <td className={tdClass}>{formatEuros(revenu.montant)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/revenus/${revenu.id}`} className={buttonSecondarySmallClass}>
                        Modifier
                      </Link>
                      <form action={deleteRevenu}>
                        <input type="hidden" name="id" value={revenu.id} />
                        <button type="submit" className={buttonDangerSmallClass}>
                          Supprimer
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {revenus.length === 0 && (
                <tr>
                  <td colSpan={7} className={emptyRowClass}>
                    Aucun revenu pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-sm">
        <h2 className={sectionHeadingClass}>Ajouter un revenu</h2>
        {personnes.length === 0 ? (
          <p className={`mt-2 text-sm ${mutedClass}`}>
            Ajoutez d&apos;abord une personne dans l&apos;écran{" "}
            <Link href="/personnes" className={linkClass}>
              Personnes
            </Link>
            .
          </p>
        ) : (
          <form action={createRevenu} className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="libelle">
                Libellé
              </label>
              <input className={inputClass} type="text" id="libelle" name="libelle" required />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="personneId">
                Personne
              </label>
              <select className={inputClass} id="personneId" name="personneId" required>
                {personnes.map((personne) => (
                  <option key={personne.id} value={personne.id}>
                    {personne.nom}
                  </option>
                ))}
              </select>
            </div>
            <RevenuTypeFields />
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="montant">
                Montant (€)
              </label>
              <input className={inputClass} type="number" step="0.01" min="0" id="montant" name="montant" required />
            </div>
            <button type="submit" className={`${buttonClass} self-start`}>
              Ajouter
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
