import Link from "next/link";
import { getPersonnes } from "@/app/actions/personnes";
import { getRevenus, getRevenuAnnuelMontantsParAnnee, getRevenuMensuelMontantsParMois } from "@/app/actions/revenus";
import { getChargesMensuelles, getHistoriqueMontantsParCharge } from "@/app/actions/charges-mensuelles";
import { getChargesAnnuelles } from "@/app/actions/charges-annuelles";
import { getAchatsPrevus } from "@/app/actions/achats-prevus";
import { getParametres } from "@/app/actions/parametres";
import {
  getSuiviParMoisMap,
  getSuiviBrutParMoisMap,
  getMoisDetail,
  archiverMoisEcoule,
  rattraperVirementsMoisCourant,
  rattraperRevenusMoisCourant,
  rattraperChargesMoisCourant,
  getSoldesArchives,
} from "@/app/actions/mois";
import {
  besoinMensuelPourMois,
  virementsParPersonne,
  projectionCompteCommun,
  projectionPersonnes,
  detailChargesAnnuellesPersonneMois,
  detailAchatsPrevusPersonneMois,
  calculerRepartitionCategories,
  revenusDuMoisTotal,
  moisCle,
  moisLabel,
  clePaiement,
  estChargeMensuelleActive,
  montantEffectifPaye,
  montantPayeEffectifCharge,
  chargeDejaDebiteeParDefaut,
  withMontantResolu,
} from "@/lib/calculs";
import { formatEuros } from "@/lib/format";
import { moisEnAbs, parseMoisAbs } from "@/lib/dates";
import {
  pageHeadingClass,
  sectionHeadingClass,
  mutedClass,
  cardClass,
  cardPadClass,
  buttonSecondarySmallClass,
  linkClass,
} from "@/lib/ui";
import { Tabs } from "@/components/Tabs";
import { SelecteurMois } from "@/components/SelecteurMois";

/** Ligne de projection passée (avant aujourd'hui) : données réelles si le mois a du suivi, sinon indisponible. */
type LignePassee = {
  cle: string;
  label: string;
  disponible: boolean;
  sousTitre: string;
  colonnes: { value: number | null; classe: string }[];
};

/**
 * Rendu d'un mois PASSÉ dans une liste de projection : icône neutre (on ne
 * connaît pas de tendance fiable pour un mois déjà clos sans historique
 * complet), sous-titre informatif sur les données réellement enregistrées ce
 * mois-là, et les mêmes colonnes que les lignes futures — remplies avec les
 * valeurs archivées, ou « n/d » si ce mois n'a jamais été clôturé.
 */
function LignePasseeRow({ ligne, href, gridColsClass }: { ligne: LignePassee; href: string; gridColsClass: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted-2">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <Link href={href} className="block truncate text-sm font-medium capitalize text-text hover:text-accent">
          {ligne.label}
        </Link>
        <p className="mt-0.5 text-xs text-muted">{ligne.sousTitre}</p>
      </div>
      <div className={`grid flex-shrink-0 ${gridColsClass} gap-x-2 whitespace-nowrap text-right text-sm`}>
        {ligne.colonnes.map((c, i) => (
          <span key={i} className={c.value !== null ? c.classe : "text-muted-2"}>
            {c.value !== null ? formatEuros(c.value) : "n/d"}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Libellé de colonne avec infobulle (pur CSS, survol) expliquant le mode de
 * calcul. La popup s'ouvre vers le BAS (pas vers le haut) car ce libellé
 * siège en haut d'une carte à `overflow-hidden` : une popup vers le haut
 * serait rognée par cette même carte.
 */
function LabelAvecInfo({ label, info }: { label: string; info: string }) {
  return (
    <span className="group relative inline-flex cursor-help items-center justify-end border-b border-dotted border-muted-2">
      {label}
      <span className="pointer-events-none absolute top-full right-0 z-10 mt-1.5 hidden w-60 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-normal normal-case leading-snug text-text shadow-[var(--shadow-pop)] group-hover:block">
        {info}
      </span>
    </span>
  );
}

export default async function DashboardPage({
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
  await archiverMoisEcoule();
  await rattraperVirementsMoisCourant();
  await rattraperRevenusMoisCourant();
  await rattraperChargesMoisCourant();
  const [personnes, revenus, chargesMensuelles, chargesAnnuelles, achatsPrevus, parametres, historiqueParCharge] =
    await Promise.all([
      getPersonnes(),
      getRevenus(),
      getChargesMensuelles(),
      getChargesAnnuelles(),
      getAchatsPrevus(),
      getParametres(),
      getHistoriqueMontantsParCharge(),
    ]);

  const from = new Date();
  const todayAbs = moisEnAbs(from.getFullYear(), from.getMonth());
  // Depuis/Jusqu'à : fenêtre affichée (par défaut, aujourd'hui → +11 mois).
  // La projection future est toujours calculée depuis AUJOURD'HUI (from
  // reste inchangé, seule la fenêtre affichée peut démarrer avant) — un mois
  // avant aujourd'hui n'a pas de projection fiable (voir `archiverMoisEcoule`),
  // seulement les données réellement enregistrées ce mois-là, si disponibles.
  const depuisAbs = parseMoisAbs(depuisMois, depuisAnnee) ?? todayAbs;
  const jusquaAbs = Math.max(parseMoisAbs(jusquaMois, jusquaAnnee) ?? todayAbs + 11, depuisAbs);
  const nbMoisAvenir = jusquaAbs >= todayAbs ? jusquaAbs - todayAbs + 1 : 0;
  const decalageAffichageAvenir = Math.max(0, depuisAbs - todayAbs);
  const moisEnCoursStocke = from.getMonth() + 1;
  const chargesMensuellesResolues = withMontantResolu(
    chargesMensuelles,
    historiqueParCharge,
    from.getFullYear(),
    from.getMonth()
  );
  const {
    besoinMensuel: besoin,
    chargesCommunesTotal: chargesMensuellesMoisEnCours,
    detail: detailMoisEnCours,
  } = besoinMensuelPourMois({
    chargesMensuelles: chargesMensuellesResolues,
    chargesAnnuelles,
    achatsPrevus,
    annee: from.getFullYear(),
    mois: from.getMonth(),
    from,
  });
  const virements = virementsParPersonne(personnes, revenus, besoin, parametres.cleRepartition);

  const [suiviParMois, suiviBrutParMois, moisEnCoursDetail, revenuAnnuelOverrides, revenuMensuelOverrides, soldesArchives] =
    await Promise.all([
      getSuiviParMoisMap({ chargesMensuelles, personnes, historiqueParCharge }),
      getSuiviBrutParMoisMap(),
      getMoisDetail(from.getFullYear(), moisEnCoursStocke),
      getRevenuAnnuelMontantsParAnnee(),
      getRevenuMensuelMontantsParMois(),
      getSoldesArchives(),
    ]);

  // Répartition par catégorie (mois en cours), partagée entre le panneau
  // commun et chaque panneau personne — toutes charges/achats confondus,
  // peu importe leur compte (voir `calculerRepartitionCategories`).
  const categorieNomParId = new Map<number, string>();
  for (const c of [...chargesMensuelles, ...chargesAnnuelles, ...achatsPrevus]) {
    if (c.categorieId && c.categorie) categorieNomParId.set(c.categorieId, c.categorie.nom);
  }

  const lignesPersonnes = personnes.map((personne) => {
    const virement = virements.get(personne.id) ?? 0;
    const virementEffectue = moisEnCoursDetail.virements.get(personne.id) ?? 0;
    // Ce que la personne a réellement viré vers le commun ce mois-ci, sinon
    // son virement mensuel habituel par défaut (même repli que la page du
    // mois) — contrairement à `virement` ci-dessus, qui est la part
    // théorique calculée du besoin commun.
    const virementCommunEffectueOuDefaut =
      moisEnCoursDetail.virements.get(personne.id) ?? personne.virementMensuelHabituel;
    // Idem pour l'épargne : montant réellement viré ce mois-ci, sinon le
    // virement épargne mensuel habituel par défaut (même repli que la page
    // du mois).
    const virementEpargneEffectueOuDefaut =
      moisEnCoursDetail.virementsEpargne.get(personne.id) ?? personne.virementEpargneMensuelHabituel;

    // Reste disponible = solde perso actuel (déjà net de ce qui est payé) −
    // charges perso pas encore payées ce mois-ci. Un virement suffisant ayant
    // toujours lieu, une charge perso est considérée payée par défaut au
    // montant de référence, sauf décochage explicite ou montant variable saisi.
    const chargesPersoListe = chargesMensuellesResolues.filter(
      (c) =>
        c.compte === "PERSO" &&
        c.personneId === personne.id &&
        estChargeMensuelleActive(c, from.getFullYear(), from.getMonth())
    );
    const depensesQuotidiennesPersoTotal = moisEnCoursDetail.depensesQuotidiennes
      .filter((d) => d.personneId === personne.id)
      .reduce((sum, d) => sum + d.montant, 0);
    // depensesDejaDeduitesDuSolde = true : les dépenses du quotidien de cette
    // personne décrémentent déjà son soldePerso en direct à la saisie — ne
    // réserver que le reliquat du budget de référence (voir
    // `ajouterDepenseQuotidienne`).
    const chargesPersoRestantes = chargesPersoListe.reduce((sum, c) => {
      const cle = clePaiement("CHARGE_MENSUELLE", c.id);
      const defautPaye = chargeDejaDebiteeParDefaut(c, from.getFullYear(), from.getMonth(), from);
      const montantPaye = c.budgetDepensesQuotidiennes
        ? montantPayeEffectifCharge(c, moisEnCoursDetail.paiements, moisEnCoursDetail.montants, depensesQuotidiennesPersoTotal, true)
        : montantEffectifPaye(moisEnCoursDetail.paiements, moisEnCoursDetail.montants, cle, c.montant, defautPaye);
      return sum + Math.max(c.montant - montantPaye, 0);
    }, 0);
    const reste = personne.soldePerso - chargesPersoRestantes;

    // Pour le panneau "Où va le budget mensuel" (mêmes montants que le
    // panneau commun équivalent, voir `detailMoisEnCours` — mais limités aux
    // charges/achats de compte PERSO de cette personne).
    const chargesPersoMoisEnCoursTotal = chargesPersoListe.reduce((sum, c) => sum + c.montant, 0);
    const detailAnnuellesPerso = detailChargesAnnuellesPersonneMois({
      chargesAnnuelles,
      personneId: personne.id,
      annee: from.getFullYear(),
      mois: from.getMonth(),
      from,
    });
    const detailAchatsPerso = detailAchatsPrevusPersonneMois({
      achatsPrevus,
      personneId: personne.id,
      annee: from.getFullYear(),
      mois: from.getMonth(),
      from,
    });
    const besoinPersoMoisEnCours =
      chargesPersoMoisEnCoursTotal +
      detailAnnuellesPerso.provisionTotal +
      detailAchatsPerso.provisionTotal +
      virementCommunEffectueOuDefaut +
      virementEpargneEffectueOuDefaut;
    const categoriesTrieesPerso = calculerRepartitionCategories(
      [
        ...chargesPersoListe.map((c) => ({ categorieId: c.categorieId, montant: c.montant })),
        ...detailAnnuellesPerso.items.map((d) => ({ categorieId: d.charge.categorieId, montant: d.provision })),
        ...detailAchatsPerso.items.map((d) => ({ categorieId: d.achat.categorieId, montant: d.provision })),
      ],
      categorieNomParId
    );
    const chargesAnnuellesDuesPersoCeMois = detailAnnuellesPerso.items.filter((d) => d.estEcheance);
    const achatsDusPersoCeMois = detailAchatsPerso.items.filter((d) => d.estEcheance && !d.achat.achete);

    return {
      personne,
      virement,
      virementEffectue,
      reste,
      chargesPersoRestantes,
      chargesPersoMoisEnCoursTotal,
      virementCommunEffectueOuDefaut,
      virementEpargneEffectueOuDefaut,
      detailAnnuellesPersoMoisEnCoursTotal: detailAnnuellesPerso.provisionTotal,
      detailAchatsPersoMoisEnCoursTotal: detailAchatsPerso.provisionTotal,
      besoinPersoMoisEnCours,
      categoriesTrieesPerso,
      chargesAnnuellesDuesPersoCeMois,
      achatsDusPersoCeMois,
    };
  });
  const virementMensuelHabituelTotal = personnes.reduce(
    (sum, p) => sum + p.virementMensuelHabituel,
    0
  );

  const projectionComplete = projectionCompteCommun({
    chargesMensuelles,
    chargesAnnuelles,
    achatsPrevus,
    soldeInitial: parametres.soldeCommun,
    suiviParMois,
    virementMensuelHabituelTotal,
    historiqueParCharge,
    from,
    nbMois: Math.max(nbMoisAvenir, 1),
  });
  const projection = nbMoisAvenir > 0 ? projectionComplete.slice(decalageAffichageAvenir) : [];

  const projectionsPersonnesCompletes = projectionPersonnes({
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
    from,
    nbMois: Math.max(nbMoisAvenir, 1),
  });
  const projectionsPersonnes = new Map(
    Array.from(projectionsPersonnesCompletes, ([personneId, lignes]) => [
      personneId,
      nbMoisAvenir > 0 ? lignes.slice(decalageAffichageAvenir) : [],
    ])
  );

  // Mois PASSÉS (avant aujourd'hui) dans la fenêtre demandée : pas de
  // projection fiable possible (voir `archiverMoisEcoule`), seulement les
  // données réellement enregistrées ce mois-là (suivi) et le solde archivé
  // à sa clôture, quand ils existent.
  const moisPasses: { annee: number; mois0: number; cle: string; label: string }[] = [];
  for (let abs = depuisAbs; abs < todayAbs; abs++) {
    const annee = Math.floor(abs / 12);
    const mois0 = abs % 12;
    moisPasses.push({ annee, mois0, cle: moisCle(annee, mois0), label: moisLabel(annee, mois0) });
  }

  const lignesPasseesCommun: LignePassee[] = moisPasses.map(({ cle, label }) => {
    const suivi = suiviParMois.get(cle);
    const resultatMois = suivi ? suivi.virementsRecusTotal - suivi.chargesMensuellesPayeesTotal : null;
    const solde = soldesArchives.get(cle)?.soldeCommun ?? null;
    return {
      cle,
      label,
      disponible: suivi !== undefined,
      sousTitre: suivi
        ? `Entrées ${formatEuros(suivi.virementsRecusTotal)} · Charges payées ${formatEuros(suivi.chargesMensuellesPayeesTotal)} (réel)`
        : "Pas de suivi enregistré ce mois-là",
      colonnes: [
        { value: resultatMois, classe: resultatMois !== null && resultatMois < 0 ? "text-neg" : "text-pos" },
        { value: solde, classe: solde !== null && solde < 0 ? "text-neg" : "text-text" },
      ],
    };
  });

  const lignesPasseesParPersonne = new Map(
    personnes.map((personne) => {
      const lignes: LignePassee[] = moisPasses.map(({ annee, mois0, cle, label }) => {
        const suivi = suiviBrutParMois.get(cle);
        let sousTitre = "Pas de suivi enregistré ce mois-là";
        if (suivi) {
          const chargesMensuellesResoluesPasse = withMontantResolu(chargesMensuelles, historiqueParCharge, annee, mois0);
          const chargesPersoListePasse = chargesMensuellesResoluesPasse.filter(
            (c) => c.compte === "PERSO" && c.personneId === personne.id && estChargeMensuelleActive(c, annee, mois0)
          );
          const revenusReel = revenusDuMoisTotal(revenus, personne.id, annee, mois0, revenuAnnuelOverrides, revenuMensuelOverrides);
          const chargesReel = chargesPersoListePasse.reduce(
            (sum, c) =>
              sum + montantEffectifPaye(suivi.paiements, suivi.montants, clePaiement("CHARGE_MENSUELLE", c.id), c.montant),
            0
          );
          sousTitre = `Revenus ${formatEuros(revenusReel)} · Charges perso payées ${formatEuros(chargesReel)} (réel)`;
        }
        const archive = soldesArchives.get(cle)?.personnes.get(personne.id) ?? null;
        const soldePerso = archive?.soldePerso ?? null;
        const soldeEpargne = archive?.soldeEpargne ?? null;
        return {
          cle,
          label,
          disponible: suivi !== undefined,
          sousTitre,
          colonnes: [
            { value: soldePerso, classe: soldePerso !== null && soldePerso < 0 ? "text-neg" : "text-pos" },
            { value: soldeEpargne, classe: "text-text" },
            {
              value: soldePerso !== null && soldeEpargne !== null ? soldePerso + soldeEpargne : null,
              classe: "text-text",
            },
          ],
        };
      });
      return [personne.id, lignes];
    })
  );

  const cleMoisEnCours = moisCle(from.getFullYear(), from.getMonth());

  // Alertes « ce mois-ci » du panneau de droite : charges annuelles et achats
  // prévus arrivant à échéance ce mois-ci (montant plein), et total restant à
  // payer sur les charges mensuelles fixes (déjà calculé pour le mois en
  // cours dans `projectionComplete[0]`, qui commence toujours à aujourd'hui
  // — contrairement à `projection`, qui peut être décalée par Depuis/Jusqu'à).
  const achatsDusCeMois = detailMoisEnCours.achats.filter((d) => d.estEcheance && !d.achat.achete);
  const chargesAnnuellesDuesCeMois = detailMoisEnCours.chargesAnnuelles.filter((d) => d.estEcheance);
  const chargesMensuellesRestantesCeMois = projectionComplete[0]?.sortiesRecurrentes ?? 0;
  const rienASignalerCeMois =
    chargesMensuellesRestantesCeMois <= 0 &&
    achatsDusCeMois.length === 0 &&
    chargesAnnuellesDuesCeMois.length === 0;

  // Répartition du besoin mensuel par catégorie (mois en cours) : mêmes
  // montants que les 3 barres ci-dessus (charges mensuelles au montant de
  // référence, provisions charges annuelles/achats prévus), juste regroupés
  // par catégorie plutôt que par type. (`categorieNomParId` est déjà calculé
  // plus haut, partagé avec la répartition par catégorie de chaque personne.)
  const totauxParCategorie = new Map<string, number>();
  const ajouterAuTotalCategorie = (categorieId: number | null, montant: number) => {
    if (montant <= 0) return;
    const nom = (categorieId && categorieNomParId.get(categorieId)) || "Sans catégorie";
    totauxParCategorie.set(nom, (totauxParCategorie.get(nom) ?? 0) + montant);
  };
  for (const c of chargesMensuellesResolues) {
    if (c.compte === "COMMUN" && estChargeMensuelleActive(c, from.getFullYear(), from.getMonth())) {
      ajouterAuTotalCategorie(c.categorieId, c.montant);
    }
  }
  for (const d of detailMoisEnCours.chargesAnnuelles) ajouterAuTotalCategorie(d.charge.categorieId, d.provision);
  for (const d of detailMoisEnCours.achats) ajouterAuTotalCategorie(d.achat.categorieId, d.provision);
  const categoriesTriees = Array.from(totauxParCategorie, ([nom, montant]) => ({ nom, montant })).sort(
    (a, b) => b.montant - a.montant
  );

  const communFullContent = (
    <div>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={cardPadClass}>
          <p className={`text-xs font-medium uppercase tracking-wide ${mutedClass}`}>
            Besoin mensuel du compte commun
          </p>
          <p className="mt-2 text-2xl font-semibold text-text">{formatEuros(besoin)}</p>
          <p className={`mt-2 text-sm ${mutedClass}`}>
            Charges mensuelles + provisions charges annuelles + provisions achats prévus. Répartition
            actuelle :{" "}
            <span className="font-medium text-text">
              {parametres.cleRepartition === "EGALE" ? "50 / 50" : "prorata des revenus"}
            </span>
            .
          </p>
        </div>
        <div className={cardPadClass}>
          <p className={`text-xs font-medium uppercase tracking-wide ${mutedClass}`}>
            Solde du compte commun
          </p>
          <p className="mt-2 text-2xl font-semibold text-text">{formatEuros(parametres.soldeCommun)}</p>
          <p className={`mt-2 text-sm ${mutedClass}`}>
            <Link href="/parametres" className={linkClass}>
              Modifier le solde
            </Link>
            {" · "}
            <Link href={`/mois/${cleMoisEnCours}`} className={linkClass}>
              Voir le détail du mois en cours
            </Link>
          </p>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionHeadingClass}>
            Projection du compte commun ({jusquaAbs - depuisAbs + 1} mois)
          </h2>
          <form action="/" method="get" className="flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="tab" value="commun" />
            <label className="flex items-center gap-1.5">
              <span className={mutedClass}>Depuis</span>
              <SelecteurMois name="depuis" abs={depuisAbs} anneeCourante={from.getFullYear()} />
            </label>
            <label className="flex items-center gap-1.5">
              <span className={mutedClass}>Jusqu&apos;à</span>
              <SelecteurMois name="jusqua" abs={jusquaAbs} anneeCourante={from.getFullYear()} />
            </label>
            <button type="submit" className={buttonSecondarySmallClass}>
              OK
            </button>
          </form>
        </div>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Projection à partir du solde actuel du compte commun ({formatEuros(parametres.soldeCommun)}).
          Clique sur un mois pour voir le détail des virements, des charges cochées comme payées et
          ajuster le suivi.
          {virementMensuelHabituelTotal > 0 && (
            <>
              {" "}
              Les mois futurs supposent par défaut un virement de{" "}
              <span className="font-medium text-text">{formatEuros(virementMensuelHabituelTotal)}</span>{" "}
              (virement mensuel habituel renseigné dans{" "}
              <Link href="/personnes" className={linkClass}>
                Personnes
              </Link>
              ) — modifiable ci-dessous mois par mois.
            </>
          )}
          {lignesPasseesCommun.length > 0 && (
            <>
              {" "}
              Pour un mois déjà passé, seules les données réellement enregistrées ce mois-là
              s&apos;affichent (« n/d » si le mois n&apos;a jamais été clôturé par l&apos;app).
            </>
          )}
        </p>

        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className={`${cardClass} flex-1 divide-y divide-border overflow-hidden`}>
          <div className="grid grid-cols-[6rem_6rem] justify-end gap-x-2 border-b border-border px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted">
            <LabelAvecInfo
              label="Résultat"
              info="Résultat du mois : vue budget lissée — entrées − charges mensuelles − provisions charges annuelles et achats prévus, toujours au montant de référence (indépendant de ce qui est réellement coché comme payé)."
            />
            <LabelAvecInfo
              label="Solde"
              info="Solde prévisionnel : trésorerie réelle projetée — solde précédent + entrées − charges mensuelles restantes − montant plein d'une charge annuelle ou d'un achat prévu, uniquement à son mois d'échéance."
            />
          </div>
          {lignesPasseesCommun.map((ligne) => (
            <LignePasseeRow
              key={ligne.cle}
              ligne={ligne}
              href={`/mois/${ligne.cle}`}
              gridColsClass="grid-cols-[6rem_6rem]"
            />
          ))}
          {projection.map((mois) => {
            const entreesAffichees = mois.entrees > 0 ? mois.entrees : virementMensuelHabituelTotal;
            const positif = mois.resultatMois >= 0;
            return (
              <div key={mois.cle} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                    positif ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {positif ? (
                      <>
                        <path d="M3 17l6-6 4 4 8-8" />
                        <path d="M15 7h6v6" />
                      </>
                    ) : (
                      <>
                        <path d="M3 7l6 6 4-4 8 8" />
                        <path d="M15 17h6v-6" />
                      </>
                    )}
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/mois/${mois.cle}`}
                    className="block truncate text-sm font-medium capitalize text-text hover:text-accent"
                  >
                    {mois.label}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                    <span>Entrées {formatEuros(entreesAffichees)}</span>
                    <span>·</span>
                    <span>Sorties {formatEuros(mois.sorties)}</span>
                  </div>
                </div>
                <div className="grid flex-shrink-0 grid-cols-[6rem_6rem] gap-x-2 whitespace-nowrap text-right text-sm">
                  <span className={`font-semibold ${positif ? "text-pos" : "text-neg"}`}>
                    {formatEuros(mois.resultatMois)}
                  </span>
                  <span className={`font-medium ${mois.solde < 0 ? "text-neg" : "text-text"}`}>
                    {formatEuros(mois.solde)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="w-full flex-shrink-0 lg:w-72">
          <div className={`${cardPadClass} flex flex-col gap-5`}>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
                Où va le besoin mensuel
              </p>
              <p className="mt-1 text-lg font-semibold text-text">{formatEuros(besoin)}</p>
              <div className="mt-3 flex flex-col gap-3">
                {(
                  [
                    { label: "Charges mensuelles", value: chargesMensuellesMoisEnCours, bar: "bg-accent" },
                    {
                      label: "Charges annuelles (provision)",
                      value: detailMoisEnCours.provisionAnnuellesCommunesTotal,
                      bar: "bg-warn",
                    },
                    {
                      label: "Achats prévus (provision)",
                      value: detailMoisEnCours.provisionsAchatsCeMoisTotal,
                      bar: "bg-flag",
                    },
                  ] as const
                ).map((ligne) => {
                  const pct = besoin > 0 ? Math.min(100, Math.round((ligne.value / besoin) * 100)) : 0;
                  return (
                    <div key={ligne.label}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-text">{ligne.label}</span>
                        <span className={mutedClass}>{formatEuros(ligne.value)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        <span className={`block h-full rounded-full ${ligne.bar}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {categoriesTriees.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>Par catégorie</p>
                <div className="mt-3 flex flex-col gap-3">
                  {categoriesTriees.map((cat) => {
                    const pct = besoin > 0 ? Math.min(100, Math.round((cat.montant / besoin) * 100)) : 0;
                    return (
                      <div key={cat.nom}>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-text">{cat.nom}</span>
                          <span className={mutedClass}>
                            {formatEuros(cat.montant)} <span className="text-muted-2">· {pct}%</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-border pt-4">
              <p className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>Ce mois-ci</p>
              {rienASignalerCeMois ? (
                <p className={`mt-2 text-sm ${mutedClass}`}>
                  Pas d&apos;échéance ni de charge restante à signaler.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2 text-sm">
                  {chargesMensuellesRestantesCeMois > 0 && (
                    <li className="flex items-center justify-between gap-2">
                      <span className="text-text">Dépenses quotidiennes dispo</span>
                      <span className="font-medium text-accent">
                        {formatEuros(chargesMensuellesRestantesCeMois)}
                      </span>
                    </li>
                  )}
                  {chargesAnnuellesDuesCeMois.map((d) => (
                    <li key={`charge-annuelle-${d.charge.id}`} className="flex items-center justify-between gap-2">
                      <span className="truncate text-text">{d.charge.libelle}</span>
                      <span className="flex-shrink-0 font-medium text-warn">{formatEuros(d.montantDu)}</span>
                    </li>
                  ))}
                  {achatsDusCeMois.map((d) => (
                    <li key={`achat-${d.achat.id}`} className="flex items-center justify-between gap-2">
                      <span className="truncate text-text">{d.achat.libelle}</span>
                      <span className="flex-shrink-0 font-medium text-flag">{formatEuros(d.montantDu)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>
      </div>

        <p className={`mt-2 text-sm ${mutedClass}`}>
          Résultat du mois : vue budget lissée (entrées − charges − provisions constantes). Solde
          cumulé : trésorerie réelle projetée, qui n&apos;encaisse le montant plein d&apos;une charge
          annuelle ou d&apos;un achat prévu qu&apos;à son mois d&apos;échéance.
        </p>
      </section>
    </div>
  );

  const personneFullContent = (ligne: (typeof lignesPersonnes)[number]) => {
    const {
      personne,
      virement,
      virementEffectue,
      reste,
      chargesPersoRestantes,
      chargesPersoMoisEnCoursTotal,
      virementCommunEffectueOuDefaut,
      virementEpargneEffectueOuDefaut,
      detailAnnuellesPersoMoisEnCoursTotal,
      detailAchatsPersoMoisEnCoursTotal,
      besoinPersoMoisEnCours,
      categoriesTrieesPerso,
      chargesAnnuellesDuesPersoCeMois,
      achatsDusPersoCeMois,
    } = ligne;
    const lignesProjection = projectionsPersonnes.get(personne.id) ?? [];
    const lignesPassees = lignesPasseesParPersonne.get(personne.id) ?? [];
    const rienASignalerPersoCeMois =
      chargesPersoRestantes <= 0 &&
      achatsDusPersoCeMois.length === 0 &&
      chargesAnnuellesDuesPersoCeMois.length === 0;
    return (
      <div>
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className={cardPadClass}>
            <p className={`text-xs font-medium uppercase tracking-wide ${mutedClass}`}>
              Solde perso actuel
            </p>
            <p className="mt-2 text-2xl font-semibold text-text">{formatEuros(personne.soldePerso)}</p>
            <p className={`mt-2 text-sm ${mutedClass}`}>
              Reste disponible ce mois-ci :{" "}
              <span className={`font-medium ${reste < 0 ? "text-neg" : "text-pos"}`}>
                {formatEuros(reste)}
              </span>
            </p>
          </div>
          <div className={cardPadClass}>
            <p className={`text-xs font-medium uppercase tracking-wide ${mutedClass}`}>
              Virement vers le compte commun
            </p>
            <p className="mt-2 text-2xl font-semibold text-text">{formatEuros(virementEffectue)}</p>
            <p className={`mt-2 text-sm ${mutedClass}`}>
              effectué sur {formatEuros(virement)} dû ce mois-ci ·{" "}
              <Link href={`/mois/${cleMoisEnCours}?tab=personne-${personne.id}`} className={linkClass}>
                voir le détail
              </Link>
            </p>
          </div>
          <div className={cardPadClass}>
            <p className={`text-xs font-medium uppercase tracking-wide ${mutedClass}`}>
              Solde épargne actuel
            </p>
            <p className="mt-2 text-2xl font-semibold text-text">{formatEuros(personne.soldeEpargne)}</p>
            <p className={`mt-2 text-sm ${mutedClass}`}>
              Virement épargne ce mois-ci :{" "}
              <span className="font-medium text-text">{formatEuros(virementEpargneEffectueOuDefaut)}</span>
            </p>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={sectionHeadingClass}>
              Projection du solde de {personne.nom} ({jusquaAbs - depuisAbs + 1} mois)
            </h2>
            <form action="/" method="get" className="flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="tab" value={`personne-${personne.id}`} />
              <label className="flex items-center gap-1.5">
                <span className={mutedClass}>Depuis</span>
                <SelecteurMois name="depuis" abs={depuisAbs} anneeCourante={from.getFullYear()} />
              </label>
              <label className="flex items-center gap-1.5">
                <span className={mutedClass}>Jusqu&apos;à</span>
                <SelecteurMois name="jusqua" abs={jusquaAbs} anneeCourante={from.getFullYear()} />
              </label>
              <button type="submit" className={buttonSecondarySmallClass}>
                OK
              </button>
            </form>
          </div>
          <p className={`mt-1 text-sm ${mutedClass}`}>
          Revenus, charges perso, virement vers le compte commun et vers l&apos;épargne. Pour le mois
          en cours, les charges perso, charges annuelles perso et le virement fixe vers
          l&apos;épargne sont considérés payés par défaut (décoche dans le détail du mois si ce
          n&apos;est pas le cas). Les mois futurs supposent le virement mensuel habituel renseigné
          dans{" "}
          <Link href="/personnes" className={linkClass}>
            Personnes
          </Link>{" "}
          (sinon la part théorique du besoin commun), et aucun virement épargne ponctuel
          (imprévisible).
          {lignesPassees.length > 0 && (
            <>
              {" "}
              Pour un mois déjà passé, seules les données réellement enregistrées ce mois-là
              s&apos;affichent (« n/d » si le mois n&apos;a jamais été clôturé par l&apos;app).
            </>
          )}
        </p>

        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className={`${cardClass} flex-1 divide-y divide-border overflow-hidden`}>
          <div className="grid grid-cols-[6rem_6rem_6rem] justify-end gap-x-2 border-b border-border px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted">
            <LabelAvecInfo
              label="Perso"
              info="Solde prévisionnel compte perso : pour le mois en cours, solde perso actuel − ce qui reste à régler ; pour un mois futur, revenus − charges perso et annuelles − virements vers le commun et l'épargne, au montant de référence."
            />
            <LabelAvecInfo
              label="Épargne"
              info="Solde prévisionnel compte épargne : solde épargne + virement épargne fixe (et ponctuel le cas échéant) de chaque mois."
            />
            <LabelAvecInfo label="Total" info="Somme des deux soldes ci-contre : perso + épargne." />
          </div>
          {lignesPassees.map((ligne) => (
            <LignePasseeRow
              key={ligne.cle}
              ligne={ligne}
              href={`/mois/${ligne.cle}?tab=personne-${personne.id}`}
              gridColsClass="grid-cols-[6rem_6rem_6rem]"
            />
          ))}
          {lignesProjection.map((mois, index) => {
            const soldePersoPrecedent = lignesProjection[index - 1]?.soldePerso ?? personne.soldePerso;
            const positif = mois.soldePerso - soldePersoPrecedent >= 0;
            return (
              <div key={mois.cle} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                    positif ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {positif ? (
                      <>
                        <path d="M3 17l6-6 4 4 8-8" />
                        <path d="M15 7h6v6" />
                      </>
                    ) : (
                      <>
                        <path d="M3 7l6 6 4-4 8 8" />
                        <path d="M15 17h6v-6" />
                      </>
                    )}
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/mois/${mois.cle}?tab=personne-${personne.id}`}
                    className="block truncate text-sm font-medium capitalize text-text hover:text-accent"
                  >
                    {mois.label}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                    <span>Revenus {formatEuros(mois.revenus)}</span>
                    <span>·</span>
                    <span>
                      Charges {formatEuros(mois.chargesPerso + mois.chargesAnnuellesPerso + mois.achatsPrevusPerso)}
                    </span>
                    <span>·</span>
                    <span>
                      Virements {formatEuros(mois.virementCommun + mois.virementEpargne)}
                    </span>
                  </div>
                </div>
                <div className="grid flex-shrink-0 grid-cols-[6rem_6rem_6rem] gap-x-2 whitespace-nowrap text-right text-sm">
                  <span className={`font-semibold ${mois.soldePerso < 0 ? "text-neg" : "text-pos"}`}>
                    {formatEuros(mois.soldePerso)}
                  </span>
                  <span className="font-medium text-text">{formatEuros(mois.soldeEpargne)}</span>
                  <span className="font-medium text-text">
                    {formatEuros(mois.soldePerso + mois.soldeEpargne)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="w-full flex-shrink-0 lg:w-72">
          <div className={`${cardPadClass} flex flex-col gap-5`}>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
                Où va le budget mensuel
              </p>
              <p className="mt-1 text-lg font-semibold text-text">{formatEuros(besoinPersoMoisEnCours)}</p>
              <div className="mt-3 flex flex-col gap-3">
                {(
                  [
                    { label: "Charges perso", value: chargesPersoMoisEnCoursTotal, bar: "bg-accent" },
                    {
                      label: "Charges annuelles perso (provision)",
                      value: detailAnnuellesPersoMoisEnCoursTotal,
                      bar: "bg-warn",
                    },
                    {
                      label: "Achats prévus perso (provision)",
                      value: detailAchatsPersoMoisEnCoursTotal,
                      bar: "bg-flag",
                    },
                    {
                      label: "Virement vers commun",
                      value: virementCommunEffectueOuDefaut,
                      bar: "bg-pos",
                    },
                    {
                      label: "Virement vers l'épargne",
                      value: virementEpargneEffectueOuDefaut,
                      bar: "bg-muted-2",
                    },
                  ] as const
                ).map((ligne) => {
                  const pct =
                    besoinPersoMoisEnCours > 0
                      ? Math.min(100, Math.round((ligne.value / besoinPersoMoisEnCours) * 100))
                      : 0;
                  return (
                    <div key={ligne.label}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-text">{ligne.label}</span>
                        <span className={mutedClass}>{formatEuros(ligne.value)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        <span className={`block h-full rounded-full ${ligne.bar}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {categoriesTrieesPerso.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>Par catégorie</p>
                <div className="mt-3 flex flex-col gap-3">
                  {categoriesTrieesPerso.map((cat) => {
                    const pct =
                      besoinPersoMoisEnCours > 0
                        ? Math.min(100, Math.round((cat.montant / besoinPersoMoisEnCours) * 100))
                        : 0;
                    return (
                      <div key={cat.nom}>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-text">{cat.nom}</span>
                          <span className={mutedClass}>
                            {formatEuros(cat.montant)} <span className="text-muted-2">· {pct}%</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-border pt-4">
              <p className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>Ce mois-ci</p>
              {rienASignalerPersoCeMois ? (
                <p className={`mt-2 text-sm ${mutedClass}`}>
                  Pas d&apos;échéance ni de charge restante à signaler.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2 text-sm">
                  {chargesPersoRestantes > 0 && (
                    <li className="flex items-center justify-between gap-2">
                      <span className="text-text">Charges perso restantes</span>
                      <span className="font-medium text-accent">{formatEuros(chargesPersoRestantes)}</span>
                    </li>
                  )}
                  {chargesAnnuellesDuesPersoCeMois.map((d) => (
                    <li key={`charge-annuelle-${d.charge.id}`} className="flex items-center justify-between gap-2">
                      <span className="truncate text-text">{d.charge.libelle}</span>
                      <span className="flex-shrink-0 font-medium text-warn">{formatEuros(d.montantDu)}</span>
                    </li>
                  ))}
                  {achatsDusPersoCeMois.map((d) => (
                    <li key={`achat-${d.achat.id}`} className="flex items-center justify-between gap-2">
                      <span className="truncate text-text">{d.achat.libelle}</span>
                      <span className="flex-shrink-0 font-medium text-flag">{formatEuros(d.montantDu)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>
        </div>
      </section>
      </div>
    );
  };

  const projectionTabs = [
    { id: "commun", label: "Commun", content: communFullContent },
    ...lignesPersonnes.map((ligne) => ({
      id: `personne-${ligne.personne.id}`,
      label: ligne.personne.nom,
      content: personneFullContent(ligne),
    })),
  ];
  const defaultTabId = tab && projectionTabs.some((t) => t.id === tab) ? tab : "commun";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className={pageHeadingClass}>Tableau de bord</h1>
        <p className={`mt-1 text-sm ${mutedClass}`}>Vue d&apos;ensemble du budget du foyer.</p>
      </div>

      {personnes.length === 0 ? (
        <p className={`text-sm ${mutedClass}`}>
          Aucune personne enregistrée. Commencez par en ajouter dans l&apos;écran{" "}
          <Link href="/personnes" className={linkClass}>
            Personnes
          </Link>
          .
        </p>
      ) : (
        <Tabs tabs={projectionTabs} defaultTabId={defaultTabId} />
      )}
    </div>
  );
}
