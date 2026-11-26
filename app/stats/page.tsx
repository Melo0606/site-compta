import Link from "next/link";
import { getPersonnes } from "@/app/actions/personnes";
import { getChargesMensuelles, getHistoriqueMontantsParCharge } from "@/app/actions/charges-mensuelles";
import { getChargesAnnuelles } from "@/app/actions/charges-annuelles";
import { getAchatsPrevus } from "@/app/actions/achats-prevus";
import { getCategories } from "@/app/actions/categories";
import {
  getDepensesQuotidiennesPourPeriodes,
  getRevenusExceptionnelsPourPeriodes,
  getSuiviBrutParMoisMap,
} from "@/app/actions/mois";
import { getRevenus, getRevenuAnnuelMontantsParAnnee, getRevenuMensuelMontantsParMois } from "@/app/actions/revenus";
import { statsParCategorie, fluxMensuelMoyenPersonne, type StatsPeriode } from "@/lib/stats";
import { moisEnAbs, parseMoisAbs } from "@/lib/dates";
import { StatsView } from "@/components/StatsView";
import { FluxArgent } from "@/components/FluxArgent";
import { SelecteurMois } from "@/components/SelecteurMois";
import { Tabs } from "@/components/Tabs";
import { pageHeadingClass, sectionHeadingClass, mutedClass, buttonSecondarySmallClass, linkClass } from "@/lib/ui";

const MOIS_COURTS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const MOIS_LONGS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

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
    anneesDistinctes > 1 ? `${MOIS_COURTS[p.mois - 1]} ${String(p.annee).slice(2)}` : MOIS_COURTS[p.mois - 1],
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
    suiviBrutParMois,
    revenuAnnuelOverrides,
    revenuMensuelOverrides,
    revenusExceptionnelsSaisis,
  ] = await Promise.all([
    getPersonnes(),
    getChargesMensuelles(),
    getChargesAnnuelles(),
    getAchatsPrevus(),
    getCategories(),
    getDepensesQuotidiennesPourPeriodes(periodes),
    getHistoriqueMontantsParCharge(),
    getRevenus(),
    getSuiviBrutParMoisMap(),
    getRevenuAnnuelMontantsParAnnee(),
    getRevenuMensuelMontantsParMois(),
    getRevenusExceptionnelsPourPeriodes(periodes),
  ]);

  // « Où va l'argent » : moyenne sur les mois écoulés de la période (un mois futur n'a pas encore de
  // dépenses réelles, le mois en cours est incomplet) — à défaut, sur le mois en cours seul.
  let moisFlux = periodes.filter((p) => moisEnAbs(p.annee, p.mois - 1) < todayAbs);
  if (moisFlux.length === 0) moisFlux = periodes.filter((p) => moisEnAbs(p.annee, p.mois - 1) === todayAbs);
  const libelleMoisFlux =
    moisFlux.length === 0
      ? null
      : moisFlux.length === 1
        ? `${MOIS_LONGS[moisFlux[0].mois - 1]} ${moisFlux[0].annee}`
        : `les ${moisFlux.length} mois écoulés de la période (${MOIS_LONGS[moisFlux[0].mois - 1]} ${moisFlux[0].annee} → ${MOIS_LONGS[moisFlux[moisFlux.length - 1].mois - 1]} ${moisFlux[moisFlux.length - 1].annee})`;

  const statsCommun = statsParCategorie({
    periodes,
    categories,
    chargesMensuelles: chargesMensuelles.filter((c) => c.compte === "COMMUN"),
    chargesAnnuelles: chargesAnnuelles.filter((c) => c.compte === "COMMUN"),
    achatsPrevus: achatsPrevus.filter((a) => a.compte === "COMMUN"),
    depensesQuotidiennes: depensesQuotidiennes.filter((d) => d.personneId === null),
    historiqueParCharge,
    replier: false,
  });

  const tabs = [
    { id: "commun", label: "Compte commun", content: <StatsView lignes={statsCommun} colonnes={colonnes} /> },
    ...personnes.map((personne) => {
      const chargesPerso = {
        chargesMensuelles: chargesMensuelles.filter((c) => c.compte === "PERSO" && c.personneId === personne.id),
        chargesAnnuelles: chargesAnnuelles.filter((c) => c.compte === "PERSO" && c.personneId === personne.id),
        achatsPrevus: achatsPrevus.filter((a) => a.compte === "PERSO" && a.personneId === personne.id),
      };
      const depensesQuotidiennesPerso = depensesQuotidiennes.filter((d) => d.personneId === personne.id);
      const virementsSaisis = (champ: "virements" | "virementsEpargne") =>
        new Map(
          Array.from(suiviBrutParMois, ([cle, suivi]) => [cle, suivi[champ].get(personne.id)] as const).filter(
            (e): e is readonly [string, number] => e[1] !== undefined,
          ),
        );
      const flux = fluxMensuelMoyenPersonne({
        periodes: moisFlux,
        personne,
        revenus,
        revenuAnnuelOverrides,
        revenuMensuelOverrides,
        virementsCommun: virementsSaisis("virements"),
        virementsEpargne: virementsSaisis("virementsEpargne"),
        revenusExceptionnelsSaisis: revenusExceptionnelsSaisis.filter((r) => r.personneId === personne.id),
        statsCharges: statsParCategorie({
          periodes: moisFlux,
          categories,
          ...chargesPerso,
          depensesQuotidiennes: [],
          historiqueParCharge,
          chargesAnnuellesLissees: true,
        }),
        statsQuotidien: statsParCategorie({
          periodes: moisFlux,
          categories,
          chargesMensuelles: [],
          chargesAnnuelles: [],
          achatsPrevus: [],
          depensesQuotidiennes: depensesQuotidiennesPerso,
          historiqueParCharge,
        }),
      });
      const statsPersonne = statsParCategorie({
        periodes,
        categories,
        ...chargesPerso,
        depensesQuotidiennes: depensesQuotidiennesPerso,
        historiqueParCharge,
        replier: false,
      });
      return {
        id: `personne-${personne.id}`,
        label: personne.nom,
        content: (
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-3">
              <div>
                <h3 className={sectionHeadingClass}>Où va l&apos;argent</h3>
                <p className={`mt-1 text-sm ${mutedClass}`}>
                  {libelleMoisFlux
                    ? moisFlux.length > 1
                      ? `Moyenne par mois sur ${libelleMoisFlux}`
                      : `Montants de ${libelleMoisFlux}`
                    : "Aucun mois écoulé sur cette période"}{" "}
                  : salaire et autres revenus mensuels, virements vers le compte commun et l&apos;épargne (montant
                  saisi, sinon habituel), charges perso par catégorie (charges annuelles lissées sur 12 mois) et
                  dépenses du quotidien. Les primes et revenus exceptionnels sont cités à part.
                </p>
              </div>
              <FluxArgent flux={flux} />
            </section>
            <section className="flex flex-col gap-3">
              <div>
                <h3 className={sectionHeadingClass}>Dépenses par catégorie</h3>
                <p className={`mt-1 text-sm ${mutedClass}`}>
                  Totaux sur toute la période. Clique sur une catégorie pour voir le détail par sous-catégorie et par
                  libellé.
                </p>
              </div>
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
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Où va l&apos;argent de chaque personne et dépenses réparties par catégorie, sur la période choisie.
        </p>
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
        Charges mensuelles (comptées chaque mois actif), charges annuelles (sur leur mois d&apos;échéance), achats
        prévus (sur leur date visée, sans prorata) et dépenses du quotidien, par catégorie. Les catégories se gèrent
        dans{" "}
        <Link href="/categories" className={linkClass}>
          Catégories
        </Link>
        .
      </p>
      <Tabs tabs={tabs} defaultTabId={defaultTabId} />
    </div>
  );
}
