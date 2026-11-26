import Link from "next/link";
import type { ReactNode } from "react";
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
import {
  statsParCategorie,
  fluxMensuelMoyenPersonne,
  fluxMensuelMoyenCommun,
  type StatsPeriode,
  type DepenseQuotidiennePeriode,
} from "@/lib/stats";
import { moisEnAbs, parseMoisAbs } from "@/lib/dates";
import { FluxArgent } from "@/components/FluxArgent";
import { SelecteurMois } from "@/components/SelecteurMois";
import { Tabs } from "@/components/Tabs";
import { pageHeadingClass, sectionHeadingClass, mutedClass, buttonSecondarySmallClass, linkClass } from "@/lib/ui";
import type { ChargeMensuelle, ChargeAnnuelle, AchatPrevu } from "@/app/generated/prisma/client";

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

  // Mois analysés : les mois écoulés de la période (un mois futur n'a pas encore de dépenses réelles, le mois
  // en cours est incomplet) — à défaut, le mois en cours seul. Diagramme, catégories et tableau portent tous
  // sur ces mêmes mois.
  let moisAnalyses = periodes.filter((p) => moisEnAbs(p.annee, p.mois - 1) < todayAbs);
  if (moisAnalyses.length === 0) moisAnalyses = periodes.filter((p) => moisEnAbs(p.annee, p.mois - 1) === todayAbs);
  const nomMois = (p: StatsPeriode) => `${MOIS_LONGS[p.mois - 1]} ${p.annee}`;
  const libelleMois =
    moisAnalyses.length === 0
      ? null
      : moisAnalyses.length === 1
        ? nomMois(moisAnalyses[0])
        : `les ${moisAnalyses.length} mois écoulés de la période (${nomMois(moisAnalyses[0])} → ${nomMois(moisAnalyses[moisAnalyses.length - 1])})`;

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
    getDepensesQuotidiennesPourPeriodes(moisAnalyses),
    getHistoriqueMontantsParCharge(),
    getRevenus(),
    getSuiviBrutParMoisMap(),
    getRevenuAnnuelMontantsParAnnee(),
    getRevenuMensuelMontantsParMois(),
    getRevenusExceptionnelsPourPeriodes(moisAnalyses),
  ]);

  /** Dépenses d'un compte sur les mois analysés : charges seules, quotidien seul, et les deux réunis (vue Catégorie). */
  const statsCompte = (charges: {
    chargesMensuelles: ChargeMensuelle[];
    chargesAnnuelles: ChargeAnnuelle[];
    achatsPrevus: AchatPrevu[];
    depensesQuotidiennes: DepenseQuotidiennePeriode[];
  }) => {
    const base = { periodes: moisAnalyses, categories, historiqueParCharge, chargesAnnuellesLissees: true };
    return {
      statsCharges: statsParCategorie({ ...base, ...charges, depensesQuotidiennes: [] }),
      statsQuotidien: statsParCategorie({
        ...base,
        chargesMensuelles: [],
        chargesAnnuelles: [],
        achatsPrevus: [],
        depensesQuotidiennes: charges.depensesQuotidiennes,
      }),
      lignes: statsParCategorie({ ...base, ...charges, replier: false }),
    };
  };

  /** Virements saisis par mois ("YYYY-MM") pour une personne, vers le compte commun ou l'épargne. */
  const virementsSaisis = (personneId: number, champ: "virements" | "virementsEpargne") =>
    new Map(
      Array.from(suiviBrutParMois, ([cle, suivi]) => [cle, suivi[champ].get(personneId)] as const).filter(
        (e): e is readonly [string, number] => e[1] !== undefined,
      ),
    );

  const enTete = (explication: ReactNode) => (
    <div>
      <h3 className={sectionHeadingClass}>Où va l&apos;argent</h3>
      <p className={`mt-1 text-sm ${mutedClass}`}>
        {libelleMois ? `Sur ${libelleMois}` : "Aucun mois écoulé sur cette période"} : {explication} Charges annuelles
        lissées sur 12 mois ; primes et revenus exceptionnels cités à part.
      </p>
    </div>
  );

  const commun = statsCompte({
    chargesMensuelles: chargesMensuelles.filter((c) => c.compte === "COMMUN"),
    chargesAnnuelles: chargesAnnuelles.filter((c) => c.compte === "COMMUN"),
    achatsPrevus: achatsPrevus.filter((a) => a.compte === "COMMUN"),
    depensesQuotidiennes: depensesQuotidiennes.filter((d) => d.personneId === null),
  });
  const fluxCommun = fluxMensuelMoyenCommun({
    periodes: moisAnalyses,
    personnes,
    virementsParPersonne: new Map(personnes.map((p) => [p.id, virementsSaisis(p.id, "virements")])),
    statsCharges: commun.statsCharges,
    statsQuotidien: commun.statsQuotidien,
    revenusExceptionnelsSaisis: revenusExceptionnelsSaisis.filter((r) => r.personneId === null),
  });

  const tabs = [
    {
      id: "commun",
      label: "Compte commun",
      content: (
        <section className="flex flex-col gap-3">
          {enTete(
            "virements reçus de chacun (montant saisi, sinon habituel), charges communes et dépenses du quotidien du compte commun.",
          )}
          <FluxArgent flux={fluxCommun} lignes={commun.lignes} />
        </section>
      ),
    },
    ...personnes.map((personne) => {
      const perso = statsCompte({
        chargesMensuelles: chargesMensuelles.filter((c) => c.compte === "PERSO" && c.personneId === personne.id),
        chargesAnnuelles: chargesAnnuelles.filter((c) => c.compte === "PERSO" && c.personneId === personne.id),
        achatsPrevus: achatsPrevus.filter((a) => a.compte === "PERSO" && a.personneId === personne.id),
        depensesQuotidiennes: depensesQuotidiennes.filter((d) => d.personneId === personne.id),
      });
      const flux = fluxMensuelMoyenPersonne({
        periodes: moisAnalyses,
        personne,
        revenus,
        revenuAnnuelOverrides,
        revenuMensuelOverrides,
        virementsCommun: virementsSaisis(personne.id, "virements"),
        virementsEpargne: virementsSaisis(personne.id, "virementsEpargne"),
        revenusExceptionnelsSaisis: revenusExceptionnelsSaisis.filter((r) => r.personneId === personne.id),
        statsCharges: perso.statsCharges,
        statsQuotidien: perso.statsQuotidien,
      });
      return {
        id: `personne-${personne.id}`,
        label: personne.nom,
        content: (
          <section className="flex flex-col gap-3">
            {enTete(
              "salaire et autres revenus mensuels, virements vers le compte commun et l'épargne (montant saisi, sinon habituel), charges perso et dépenses du quotidien.",
            )}
            <FluxArgent flux={flux} lignes={perso.lignes} />
          </section>
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
          Où va l&apos;argent du compte commun et de chaque personne, sur la période choisie. Les catégories se gèrent
          dans{" "}
          <Link href="/categories" className={linkClass}>
            Catégories
          </Link>
          .
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
      <Tabs tabs={tabs} defaultTabId={defaultTabId} />
    </div>
  );
}
