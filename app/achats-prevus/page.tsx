import Link from "next/link";
import {
  getAchatsPrevus,
  createAchatPrevu,
  deleteAchatPrevu,
  marquerAchatAchete,
  demarquerAchatAchete,
} from "@/app/actions/achats-prevus";
import { getPersonnes } from "@/app/actions/personnes";
import { formatEuros, formatDate } from "@/lib/format";
import {
  inputClass,
  labelClass,
  buttonClass,
  buttonDangerSmallClass,
  buttonSecondarySmallClass,
  buttonPositiveSmallClass,
  pageHeadingClass,
  sectionHeadingClass,
  mutedClass,
  helpTextClass,
  tableWrapClass,
  theadRowClass,
  thClass,
  tdClass,
  tdMutedClass,
  rowClass,
  emptyRowClass,
  linkMutedClass,
  pillClass,
  checkboxLabelClass,
  checkboxClass,
} from "@/lib/ui";
import { provisionAchatPrevu } from "@/lib/calculs";
import { CategorieSelect } from "@/components/CategorieSelect";
import { CompteFields } from "@/components/CompteFields";

export default async function AchatsPrevusPage({
  searchParams,
}: {
  searchParams: Promise<{ affichage?: string }>;
}) {
  const { affichage } = await searchParams;
  const afficherTous = affichage === "tous";
  const [tousLesAchats, personnes] = await Promise.all([getAchatsPrevus(), getPersonnes()]);
  const achats = afficherTous ? tousLesAchats : tousLesAchats.filter((a) => !a.achete);
  const nbAchetes = tousLesAchats.filter((a) => a.achete).length;
  const aujourdhui = new Date();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className={pageHeadingClass}>Achats prévus</h1>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Dépenses exceptionnelles à venir et leur provisionnement mensuel.
        </p>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionHeadingClass}>Achats prévus</h2>
          {nbAchetes > 0 && (
            <Link
              href={afficherTous ? "/achats-prevus" : "/achats-prevus?affichage=tous"}
              className={`text-sm ${linkMutedClass}`}
            >
              {afficherTous
                ? "N'afficher que les achats en cours"
                : `Afficher tous les achats (${nbAchetes} déjà acheté${nbAchetes > 1 ? "s" : ""})`}
            </Link>
          )}
        </div>
        <div className={`mt-3 ${tableWrapClass}`}>
          <table className="w-full min-w-[820px] text-sm">
            <thead className={theadRowClass}>
              <tr>
                <th className={thClass}>Libellé</th>
                <th className={thClass}>Catégorie</th>
                <th className={thClass}>Compte</th>
                <th className={thClass}>Montant cible</th>
                <th className={thClass}>Déjà provisionné</th>
                <th className={thClass}>Date visée</th>
                <th className={thClass}>Provision / mois</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {achats.map((achat) => {
                const restant = Math.max(achat.montantCible - achat.dejaProvisionne, 0);
                const enRetard = !achat.achete && restant > 0 && achat.dateVisee < aujourdhui;
                return (
                  <tr key={achat.id} className={rowClass}>
                    <td className={tdClass}>
                      {achat.libelle}
                      {achat.achete && (
                        <span className={`ml-2 ${pillClass("pos")}`}>
                          Acheté
                        </span>
                      )}
                      {enRetard && (
                        <span className={`ml-2 ${pillClass("warn")}`}>
                          En retard
                        </span>
                      )}
                      {achat.sansProvisionnement && (
                        <span className={`ml-2 ${pillClass("neutral")}`}>
                          Sans provisionnement
                        </span>
                      )}
                    </td>
                    <td className={tdMutedClass}>{achat.categorie?.nom ?? "—"}</td>
                    <td className={tdMutedClass}>
                      {achat.compte === "COMMUN" ? "Commun" : `Perso — ${achat.personne?.nom ?? "?"}`}
                    </td>
                    <td className={tdClass}>{formatEuros(achat.montantCible)}</td>
                    <td className={tdClass}>{formatEuros(achat.dejaProvisionne)}</td>
                    <td className={tdMutedClass}>{formatDate(achat.dateVisee)}</td>
                    <td className={tdMutedClass}>{formatEuros(provisionAchatPrevu(achat))}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        {achat.achete ? (
                          <form action={demarquerAchatAchete}>
                            <input type="hidden" name="id" value={achat.id} />
                            <button type="submit" className={buttonSecondarySmallClass}>
                              Repasser en cours
                            </button>
                          </form>
                        ) : (
                          <form action={marquerAchatAchete.bind(null, null, null)}>
                            <input type="hidden" name="id" value={achat.id} />
                            <button type="submit" className={buttonPositiveSmallClass}>
                              Valider achat
                            </button>
                          </form>
                        )}
                        <Link href={`/achats-prevus/${achat.id}`} className={buttonSecondarySmallClass}>
                          Modifier
                        </Link>
                        <form action={deleteAchatPrevu}>
                          <input type="hidden" name="id" value={achat.id} />
                          <button type="submit" className={buttonDangerSmallClass}>
                            Supprimer
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {achats.length === 0 && (
                <tr>
                  <td colSpan={8} className={emptyRowClass}>
                    Aucun achat prévu pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className={`mt-2 text-sm ${mutedClass}`}>
          « En retard » : la date visée est passée mais l&apos;achat n&apos;est pas encore marqué
          acheté — sinon il continuera d&apos;apparaître comme dû chaque mois. « Valider achat »
          est réversible via « Repasser en cours ».
        </p>
      </section>

      <section className="max-w-sm">
        <h2 className={sectionHeadingClass}>Ajouter un achat prévu</h2>
        <form action={createAchatPrevu} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="libelle">
              Libellé
            </label>
            <input className={inputClass} type="text" id="libelle" name="libelle" required />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="montantCible">
              Montant cible (€)
            </label>
            <input className={inputClass} type="number" step="0.01" min="0" id="montantCible" name="montantCible" required />
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
              defaultValue={0}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dateVisee">
              Date visée
            </label>
            <input className={inputClass} type="date" id="dateVisee" name="dateVisee" required />
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
              Laisser vide pour commencer dès maintenant. Sinon, l&apos;achat n&apos;apparaît et n&apos;est
              provisionné qu&apos;à partir du mois de cette date (ex : créé en août, provisionné seulement
              à partir d&apos;octobre).
            </p>
          </div>
          <label className={checkboxLabelClass}>
            <input type="checkbox" name="sansProvisionnement" className={checkboxClass} />
            Pas de provisionnement
          </label>
          <p className={helpTextClass}>
            Si coché, aucune provision mensuelle n&apos;est collectée : l&apos;achat n&apos;apparaît et ne
            pèse sur le besoin qu&apos;au mois de l&apos;échéance, montant plein d&apos;un coup.
          </p>
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
