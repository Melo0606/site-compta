import Link from "next/link";
import { getPersonnes } from "@/app/actions/personnes";
import { getChargesMensuelles, getHistoriqueMontantsParCharge } from "@/app/actions/charges-mensuelles";
import { getChargesAnnuelles } from "@/app/actions/charges-annuelles";
import { getAchatsPrevus } from "@/app/actions/achats-prevus";
import { getCategories } from "@/app/actions/categories";
import { getDepensesQuotidiennesPourPeriodes, getSoldesArchives, getSuiviBrutParMoisMap } from "@/app/actions/mois";
import { getRevenus, getRevenuAnnuelMontantsParAnnee, getRevenuMensuelMontantsParMois } from "@/app/actions/revenus";
import { getParametres } from "@/app/actions/parametres";
import { projectionPersonnes } from "@/lib/calculs";
import { statsParCategorie, evolutionSoldesPersonne, type StatsPeriode } from "@/lib/stats";
import { moisEnAbs, parseMoisAbs } from "@/lib/dates";
import { StatsView } from "@/components/StatsView";
import { EvolutionSoldes } from "@/components/EvolutionSoldes";
import { SelecteurMois } from "@/components/SelecteurMois";
import { Tabs } from "@/components/Tabs";
import { pageHeadingClass, sectionHeadingClass, mutedClass, buttonSecondarySmallClass, linkClass } from "@/lib/ui";

const MOIS_COURTS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

/** Toutes les périodes mensuelles (incluses) entre deux mois absolus, dans l'ordre chronologique. */
function periodesEntre(depuisAbs: number, jusquaAbs: number): StatsPeriode[] {
  const periodes: StatsPeriode[] = [];
  for (let abs = depuisAbs; abs <= jusquaAbs; abs++) {
    periodes.push({ annee: Math.floor(abs / 12), mois: (abs % 12) + 1 });
  }
  return periodes;
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{
    depuisMois?: string;
    depuisAnnee?: string;
    jusquaMois?: string;
    jusquaAnnee?: string;
    tab?: string;
  }>;
}) {
  const { depuisMois, depuisAnnee, jusquaMois, jusquaAnnee, tab } = await searchParams;
  const aujourdhui = new Date();
  const todayAbs = moisEnAbs(aujourdhui.getFullYear(), aujourdhui.getMonth());

  // Par défaut : les 12 derniers mois glissants (mois en cours inclus).
  const jusquaAbs = parseMoisAbs(jusquaMois, jusquaAnnee) ?? todayAbs;
  const depuisAbs = Math.min(parseMoisAbs(depuisMois, depuisAnnee) ?? todayAbs - 11, jusquaAbs);

  const periodes = periodesEntre(depuisAbs, jusquaAbs);
  const anneesDistinctes = new Set(periodes.map((p) => p.annee)).size;
  const colonnes = periodes.map((p) =>
    anneesDistinctes > 1 ? `${MOIS_COURTS[p.mois - 1]} ${String(p.annee).slice(2)}` : MOIS_COURTS[p.mois - 1]
  );

  const [
    personnes,
    chargesMensuelles,
    chargesAnnuelles,
    achatsPrevus,
    categories,
    depensesQuotidiennes,
    historiqueParCharge,
    revenus,
    parametres,
    suiviBrutParMois,
    revenuAnnuelOverrides,
    revenuMensuelOverrides,
    soldesArchives,
  ] = await Promise.all([
    getPersonnes(),
    getChargesMensuelles(),
    getChargesAnnuelles(),
    getAchatsPrevus(),
    getCategories(),
    getDepensesQuotidiennesPourPeriodes(periodes),
    getHistoriqueMontantsParCharge(),
    getRevenus(),
    getParametres(),
    getSuiviBrutParMoisMap(),
    getRevenuAnnuelMontantsParAnnee(),
    getRevenuMensuelMontantsParMois(),
    getSoldesArchives(),
  ]);

  // Soldes de fin de mois projetés, du mois en cours jusqu'à la fin de la période (si elle n'est pas entièrement passée).
  const nbMoisProjetes = jusquaAbs - todayAbs + 1;
  const projections =
    nbMoisProjetes > 0
      ? projectionPersonnes({
          personnes,
          revenus,
          chargesMensuelles,
          chargesAnnuelles,
          achatsPrevus,
          cleRepartition: parametres.cleRepartition,
          suiviBrutParMois,
          revenuAnnuelOverrides,
          revenuMensuelOverrides,
          historiqueParCharge,
          from: aujourdhui,
          nbMois: nbMoisProjetes,
        })
      : new Map();

  const statsCommun = statsParCategorie({
    periodes,
    categories,
    chargesMensuelles: chargesMensuelles.filter((c) => c.compte === "COMMUN"),
    chargesAnnuelles: chargesAnnuelles.filter((c) => c.compte === "COMMUN"),
    achatsPrevus: achatsPrevus.filter((a) => a.compte === "COMMUN"),
    depensesQuotidiennes: depensesQuotidiennes.filter((d) => d.personneId === null),
    historiqueParCharge,
  });

  const tabs = [
    { id: "commun", label: "Compte commun", content: <StatsView lignes={statsCommun} colonnes={colonnes} /> },
    ...personnes.map((personne) => {
      const statsPersonne = statsParCategorie({
        periodes,
        categories,
        chargesMensuelles: chargesMensuelles.filter((c) => c.compte === "PERSO" && c.personneId === personne.id),
        chargesAnnuelles: chargesAnnuelles.filter((c) => c.compte === "PERSO" && c.personneId === personne.id),
        achatsPrevus: achatsPrevus.filter((a) => a.compte === "PERSO" && a.personneId === personne.id),
        depensesQuotidiennes: depensesQuotidiennes.filter((d) => d.personneId === personne.id),
        historiqueParCharge,
      });
      return {
        id: `personne-${personne.id}`,
        label: personne.nom,
        content: (
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-3">
              <div>
                <h3 className={sectionHeadingClass}>Évolution des soldes</h3>
                <p className={`mt-1 text-sm ${mutedClass}`}>
                  Solde du compte perso et de l&apos;épargne en fin de mois : archivé pour les mois passés, projeté
                  pour le mois en cours et les mois à venir (en pointillés).
                </p>
              </div>
              <EvolutionSoldes
                points={evolutionSoldesPersonne({
                  periodes,
                  labels: colonnes,
                  todayAbs,
                  archives: new Map(
                    Array.from(soldesArchives, ([cle, archive]) => [cle, archive.personnes.get(personne.id)]).filter(
                      (e): e is [string, { soldePerso: number; soldeEpargne: number }] => e[1] !== undefined
                    )
                  ),
                  projection: projections.get(personne.id) ?? [],
                })}
              />
            </section>
            <section className="flex flex-col gap-3">
              <h3 className={sectionHeadingClass}>Dépenses par catégorie</h3>
              <StatsView lignes={statsPersonne} colonnes={colonnes} />
            </section>
          </div>
        ),
      };
    }),
  ];
  const defaultTabId = tab && tabs.some((t) => t.id === tab) ? tab : "commun";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className={pageHeadingClass}>Statistiques</h1>
        <p className={`mt-1 text-sm ${mutedClass}`}>Dépenses réparties par catégorie et évolution des soldes de chaque personne sur la période choisie.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={sectionHeadingClass}>Période ({periodes.length} mois)</h2>
        <form action="/stats" method="get" className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="tab" value={defaultTabId} />
          <label className="flex items-center gap-1.5">
            <span className={mutedClass}>Depuis</span>
            <SelecteurMois name="depuis" abs={depuisAbs} anneeCourante={aujourdhui.getFullYear()} />
          </label>
          <label className="flex items-center gap-1.5">
            <span className={mutedClass}>Jusqu&apos;à</span>
            <SelecteurMois name="jusqua" abs={jusquaAbs} anneeCourante={aujourdhui.getFullYear()} />
          </label>
          <button type="submit" className={buttonSecondarySmallClass}>
            OK
          </button>
        </form>
      </div>
      <p className={`text-sm ${mutedClass}`}>
        Charges mensuelles (comptées chaque mois actif), charges annuelles (sur leur mois d&apos;échéance),
        achats prévus (sur leur date visée, sans prorata) et dépenses du quotidien, par catégorie. Les
        catégories se gèrent dans{" "}
        <Link href="/categories" className={linkClass}>
          Catégories
        </Link>
        .
      </p>
      <Tabs tabs={tabs} defaultTabId={defaultTabId} />
    </div>
  );
}
