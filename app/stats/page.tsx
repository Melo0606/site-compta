import Link from "next/link";
import { getPersonnes } from "@/app/actions/personnes";
import { getChargesMensuelles, getHistoriqueMontantsParCharge } from "@/app/actions/charges-mensuelles";
import { getChargesAnnuelles } from "@/app/actions/charges-annuelles";
import { getAchatsPrevus } from "@/app/actions/achats-prevus";
import { getCategories } from "@/app/actions/categories";
import { getDepensesQuotidiennesPourPeriodes } from "@/app/actions/mois";
import { statsParCategorie, type StatsPeriode } from "@/lib/stats";
import { moisEnAbs, parseMoisAbs } from "@/lib/dates";
import { StatsView } from "@/components/StatsView";
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
  ] = await Promise.all([
    getPersonnes(),
    getChargesMensuelles(),
    getChargesAnnuelles(),
    getAchatsPrevus(),
    getCategories(),
    getDepensesQuotidiennesPourPeriodes(periodes),
    getHistoriqueMontantsParCharge(),
  ]);

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
        content: <StatsView lignes={statsPersonne} colonnes={colonnes} />,
      };
    }),
  ];
  const defaultTabId = tab && tabs.some((t) => t.id === tab) ? tab : "commun";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className={pageHeadingClass}>Statistiques</h1>
        <p className={`mt-1 text-sm ${mutedClass}`}>Dépenses réparties par catégorie sur la période choisie.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={sectionHeadingClass}>Statistiques par catégorie ({periodes.length} mois)</h2>
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
