import { notFound } from "next/navigation";
import { getCategories } from "@/app/actions/categories";
import { nomCompletCategorie, categorieRacineParId, nomCompletParId } from "@/lib/categories";
import Link from "next/link";
import { getPersonnes } from "@/app/actions/personnes";
import {
  getRevenus,
  getRevenuAnnuelMontantsParAnnee,
  setRevenuAnnuelMontant,
  getRevenuMensuelMontantsParMois,
  setRevenuMensuelMontant,
} from "@/app/actions/revenus";
import { getChargesMensuelles, getHistoriqueMontantsParCharge } from "@/app/actions/charges-mensuelles";
import {
  getChargesAnnuelles,
  marquerChargeAnnuellePayee,
  demarquerChargeAnnuellePayee,
} from "@/app/actions/charges-annuelles";
import { getAchatsPrevus, marquerAchatAchete, demarquerAchatAchete } from "@/app/actions/achats-prevus";
import { getParametres } from "@/app/actions/parametres";
import {
  getMoisDetail,
  getSuiviParMoisMap,
  getSuiviBrutParMoisMap,
  setVirementMois,
  setVirementEpargneMois,
} from "@/app/actions/mois";
import {
  besoinMensuelPourMois,
  virementsParPersonne,
  projectionCompteCommun,
  projectionPersonnes,
  detailChargesAnnuellesPersonneMois,
  detailAchatsPrevusPersonneMois,
  dejaPayeeCeCycle,
  provisionReserveeCommunMois,
  provisionReserveePersonneMois,
  calculerRepartitionCategories,
  revenuActifPourMois,
  revenusDuMoisTotal,
  montantEffectifRevenuAnnuel,
  montantEffectifRevenuMensuel,
  moisLabel,
  moisCle,
  clePaiement,
  estChargeMensuelleActive,
  montantEffectifPaye,
  chargeDejaDebiteeParDefaut,
  withMontantResolu,
} from "@/lib/calculs";
import { formatEuros, formatDate } from "@/lib/format";
import {
  inputClass,
  buttonSecondarySmallClass,
  buttonPositiveSmallClass,
  sectionHeadingClass,
  subHeadingClass,
  mutedClass,
  cardPadClass,
  tableWrapClass,
  theadRowClass,
  thClass,
  tdClass,
  tdMutedClass,
  rowClass,
  footRowClass,
  emptyRowClass,
  pillClass,
  linkClass,
  linkMutedClass,
} from "@/lib/ui";
import { PaiementCheckbox } from "@/components/PaiementCheckbox";
import { MontantPayeInput } from "@/components/MontantPayeInput";
import { DepensesQuotidiennesSection } from "@/components/DepensesQuotidiennesSection";
import { RevenusExceptionnelsSection } from "@/components/RevenusExceptionnelsSection";
import { Tabs } from "@/components/Tabs";
import type { Personne, Revenu, ChargeMensuelle } from "@/app/generated/prisma/client";

export default async function MoisDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ cle: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { cle } = await params;
  const { tab } = await searchParams;
  const match = /^(\d{4})-(\d{2})$/.exec(cle);
  if (!match) notFound();
  const annee = Number(match[1]);
  const moisStocke = Number(match[2]); // 1-12
  if (moisStocke < 1 || moisStocke > 12) notFound();
  const mois0 = moisStocke - 1; // 0-11 pour les calculs

  const [
    personnes,
    revenus,
    revenuAnnuelOverrides,
    revenuMensuelOverrides,
    chargesMensuelles,
    chargesAnnuelles,
    achatsPrevus,
    parametres,
    moisDetail,
    historiqueParCharge,
  ] = await Promise.all([
    getPersonnes(),
    getRevenus(),
    getRevenuAnnuelMontantsParAnnee(),
    getRevenuMensuelMontantsParMois(),
    getChargesMensuelles(),
    getChargesAnnuelles(),
    getAchatsPrevus(),
    getParametres(),
    getMoisDetail(annee, moisStocke),
    getHistoriqueMontantsParCharge(),
  ]);
  const chargesMensuellesResolues = withMontantResolu(chargesMensuelles, historiqueParCharge, annee, mois0);

  const from = new Date();
  const { chargesCommunesTotal, detail, besoinMensuel } = besoinMensuelPourMois({
    chargesMensuelles: chargesMensuellesResolues,
    chargesAnnuelles,
    achatsPrevus,
    annee,
    mois: mois0,
    from,
  });
  const virementsDus = virementsParPersonne(personnes, revenus, besoinMensuel, parametres.cleRepartition);

  // Répartition par catégorie (mois affiché), partagée entre le panneau
  // commun et chaque panneau personne — toutes charges/achats confondus,
  // peu importe leur compte (voir `calculerRepartitionCategories`).
  // Une sous-catégorie compte dans sa catégorie principale.
  const categoriesListe = await getCategories();
  const categorieNomParId = new Map(Array.from(categorieRacineParId(categoriesListe), ([id, racine]) => [id, racine.nom]));
  const categorieNomCompletParId = nomCompletParId(categoriesListe);

  const suiviParMois = await getSuiviParMoisMap({ chargesMensuelles, personnes, historiqueParCharge });
  const virementMensuelHabituelTotal = personnes.reduce(
    (sum, p) => sum + p.virementMensuelHabituel,
    0
  );
  const fromAbs = from.getFullYear() * 12 + from.getMonth();
  const targetAbs = annee * 12 + mois0;
  const index = targetAbs - fromAbs;
  const projection = projectionCompteCommun({
    chargesMensuelles,
    chargesAnnuelles,
    achatsPrevus,
    soldeInitial: parametres.soldeCommun,
    suiviParMois,
    virementMensuelHabituelTotal,
    historiqueParCharge,
    from,
    nbMois: Math.max(index + 1, 1),
  });
  // Le mois en cours (index 0) : `parametres.soldeCommun` est déjà le solde ACTUEL,
  // au jour où il a été relevé (donc après les virements/charges déjà pointés
  // ci-dessous) — il ne faut pas y rajouter le suivi une seconde fois. Pour les
  // mois futurs (index > 0), il n'existe pas encore de « solde réel » : on
  // n'affiche que la projection.
  const estMoisCourantOuPasse = index <= 0;
  // Pour un mois futur, `soldeDebutMois` inclut déjà les entrées de ce
  // mois-ci (voir `MoisProjection.soldeDebutMois`) — ne pas reprendre le
  // solde de fin du mois précédent seul, qui ne les compterait pas encore.
  const soldeDebutMois = estMoisCourantOuPasse
    ? parametres.soldeCommun
    : (projection[index]?.soldeDebutMois ?? parametres.soldeCommun);
  const soldeFinMoisProjete = index >= 0 ? (projection[index]?.solde ?? soldeDebutMois) : soldeDebutMois;
  // Plafonnée au solde lui-même : la réserve théorique (lissage idéal depuis
  // la dernière échéance) peut dépasser ce qui est réellement disponible si
  // le compte a pris du retard sur ce lissage — dans ce cas, la totalité du
  // solde restant est à considérer comme "provision", pas plus.
  const provisionReserveeCommun = Math.min(
    provisionReserveeCommunMois(chargesAnnuelles, achatsPrevus, annee, mois0, from),
    Math.max(soldeFinMoisProjete, 0)
  );

  // Projection chaînée des soldes perso (comme `projection` ci-dessus pour le
  // commun) : indispensable pour un mois autre que le mois en cours — le
  // solde perso projeté d'un mois futur doit passer par tous les mois
  // intermédiaires (revenus, charges, virements de chacun), pas juste
  // soustraire les charges de ce seul mois du solde ACTUEL.
  const suiviBrutParMois = await getSuiviBrutParMoisMap();
  const projectionsPersonnes = projectionPersonnes({
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
    nbMois: Math.max(index + 1, 1),
  });

  // Entrées/sorties/résultat du mois affiché : disponibles uniquement pour
  // aujourd'hui et les mois futurs (la projection ne remonte jamais avant
  // aujourd'hui, voir `projectionCompteCommun`) — `undefined` pour un mois
  // déjà passé, non affiché dans ce cas.
  const projectionMoisAffiche = index >= 0 ? projection[index] : undefined;

  const chargesCommunesListe = chargesMensuellesResolues.filter(
    (c) => c.compte === "COMMUN" && estChargeMensuelleActive(c, annee, mois0)
  );
  const montantPayeCharge = (charge: ChargeMensuelle, reference: number): number => {
    if (charge.budgetDepensesQuotidiennes) {
      return moisDetail.depensesQuotidiennes
        .filter((d) => d.personneId === charge.personneId)
        .reduce((sum, d) => sum + d.montant, 0);
    }
    return montantEffectifPaye(
      moisDetail.paiements,
      moisDetail.montants,
      clePaiement("CHARGE_MENSUELLE", charge.id),
      reference,
      chargeDejaDebiteeParDefaut(charge, annee, mois0, from)
    );
  };
  const chargesMensuellesPayeesReelles = chargesCommunesListe.reduce(
    (sum, c) => sum + montantPayeCharge(c, c.montant),
    0
  );
  const virementsRecusReels = personnes.reduce(
    (sum, p) => sum + (moisDetail.virements.get(p.id) ?? 0),
    0
  );

  // Pour une charge annuelle/un achat à échéance ce mois-ci, une partie du
  // montant dû a déjà été mise de côté via le prorata des mois précédents
  // (montant dû moins la provision de ce mois-ci seul) — pas de l'argent neuf
  // à trouver ce mois-ci.
  const totalDuChargesAnnuelles = detail.chargesAnnuelles.reduce((sum, d) => sum + d.montantDu, 0);
  const dejaCumuleChargesAnnuelles = detail.chargesAnnuelles
    .filter((d) => d.estEcheance)
    .reduce((sum, d) => sum + (d.montantDu - d.provision), 0);

  const totalDuAchats = detail.achats.reduce((sum, d) => sum + d.montantDu, 0);
  const dejaCumuleAchats = detail.achats
    .filter((d) => d.estEcheance && !d.achat.sansProvisionnement && !d.achat.achete)
    .reduce((sum, d) => sum + (d.montantDu - d.provision), 0);

  // Pour le panneau "Où va le besoin mensuel" (mêmes montants que le
  // tableau de bord, mais pour le mois affiché plutôt que le mois en cours).
  const chargesMensuellesRestantesCeMois =
    chargesCommunesListe.reduce((sum, c) => sum + c.montant, 0) - chargesMensuellesPayeesReelles;
  const besoinCommunMoisAffiche =
    chargesCommunesTotal + detail.provisionAnnuellesCommunesTotal + detail.provisionsAchatsCeMoisTotal;
  const categoriesTrieesCommun = calculerRepartitionCategories(
    [
      ...chargesCommunesListe.map((c) => ({ categorieId: c.categorieId, montant: c.montant })),
      ...detail.chargesAnnuelles.map((d) => ({ categorieId: d.charge.categorieId, montant: d.provision })),
      ...detail.achats.map((d) => ({ categorieId: d.achat.categorieId, montant: d.provision })),
    ],
    categorieNomParId
  );
  const chargesAnnuellesDuesCeMois = detail.chargesAnnuelles.filter((d) => d.estEcheance);
  const achatsDusCeMois = detail.achats.filter((d) => d.estEcheance && !d.achat.achete);
  const rienASignalerCeMois =
    chargesMensuellesRestantesCeMois <= 0 &&
    achatsDusCeMois.length === 0 &&
    chargesAnnuellesDuesCeMois.length === 0;

  const moisPrecedent = mois0 === 0 ? { annee: annee - 1, mois0: 11 } : { annee, mois0: mois0 - 1 };
  const moisSuivant = mois0 === 11 ? { annee: annee + 1, mois0: 0 } : { annee, mois0: mois0 + 1 };

  const communPanel = (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <section className={cardPadClass}>
            <h3 className={subHeadingClass}>Solde du compte commun</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className={`text-xs ${mutedClass}`}>
                  {estMoisCourantOuPasse ? "Solde actuel (aujourd'hui)" : "Solde projeté en début de mois"}
                </p>
                <p
                  className="cursor-help text-lg font-semibold text-text"
                  title={
                    estMoisCourantOuPasse
                      ? "= solde renseigné dans Paramètres, déjà net des virements reçus et charges payées pointés ci-dessous."
                      : undefined
                  }
                >
                  {formatEuros(soldeDebutMois)}
                </p>
              </div>
              <div>
                <p className={`text-xs ${mutedClass}`}>Solde projeté en fin de mois</p>
                <p
                  className={`cursor-help text-lg font-semibold ${soldeFinMoisProjete < 0 ? "text-neg" : "text-pos"}`}
                  title={
                    estMoisCourantOuPasse
                      ? "= solde actuel (déjà net de tout ce qui s'est réellement passé jusqu'ici, virements compris) − charges mensuelles non décochées (payées par défaut) − charges annuelles et achats prévus à échéance ce mois-ci (montant plein, pas la provision). Les cases « Provisionné » restent indicatives et n'affectent pas ce solde. « Marquer comme payé »/« Marquer comme acheté », en revanche, débitent immédiatement leur montant du solde actuel, sans le déduire une seconde fois ici."
                      : "= solde de début de mois (entrées de ce mois déjà comptées) − charges mensuelles − charges annuelles et achats prévus à échéance ce mois-ci (montant plein, pas la provision)."
                  }
                >
                  {formatEuros(soldeFinMoisProjete)}
                </p>
                {provisionReserveeCommun > 0 && (
                  <p
                    className={`cursor-help text-xs ${mutedClass}`}
                    title="Part du solde déjà mise de côté par le lissage mensuel pour les prochaines charges annuelles et achats prévus (compte commun) — à ne pas compter comme librement disponible."
                  >
                    dont {formatEuros(provisionReserveeCommun)} de provision
                  </p>
                )}
              </div>
            </div>

            {projectionMoisAffiche && (
              <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-3">
                <div>
                  <p className={`text-xs ${mutedClass}`}>Entrées</p>
                  <p
                    className="cursor-help text-lg font-semibold text-text"
                    title="Virements reçus ce mois-ci (réel si déjà transféré, sinon virement mensuel habituel/besoin théorique pour un mois futur)."
                  >
                    {formatEuros(projectionMoisAffiche.entrees)}
                  </p>
                </div>
                <div>
                  <p className={`text-xs ${mutedClass}`}>Sorties</p>
                  <p
                    className="cursor-help text-lg font-semibold text-text"
                    title="Vue budget lissée : charges mensuelles restantes + provisions charges annuelles et achats prévus, toujours au montant de référence (indépendant de ce qui est coché comme payé)."
                  >
                    {formatEuros(projectionMoisAffiche.sorties)}
                  </p>
                </div>
                <div>
                  <p className={`text-xs ${mutedClass}`}>Résultat du mois</p>
                  <p
                    className={`cursor-help text-lg font-semibold ${projectionMoisAffiche.resultatMois < 0 ? "text-neg" : "text-pos"}`}
                    title="= Entrées − Sorties (vue budget lissée). Différent du solde projeté ci-contre, qui suit la vraie trésorerie : une charge annuelle ou un achat prévu n'y sort qu'à son mois d'échéance, pas lissé sur l'année."
                  >
                    {formatEuros(projectionMoisAffiche.resultatMois)}
                  </p>
                </div>
              </div>
            )}
          </section>

          <section>
            <h3 className={sectionHeadingClass}>Virements vers le compte commun</h3>
            <p className={`mt-1 text-sm ${mutedClass}`}>
              « Reste à transférer » est indicatif (ce que le budget théorique demanderait) — le solde
              projeté ci-dessus ne suppose pas qu&apos;il sera envoyé.
            </p>
            <div className={`mt-3 ${tableWrapClass}`}>
              <table className="w-full min-w-[560px] text-sm">
                <thead className={theadRowClass}>
                  <tr>
                    <th className={thClass}>Personne</th>
                    <th className={thClass}>Virement dû</th>
                    <th className={thClass}>Déjà transféré</th>
                    <th className={thClass}>Reste à transférer</th>
                  </tr>
                </thead>
                <tbody>
                  {personnes.map((personne) => {
                    const du = virementsDus.get(personne.id) ?? 0;
                    const recu = moisDetail.virements.get(personne.id) ?? personne.virementMensuelHabituel;
                    const reste = du - recu;
                    const setVirementWithId = setVirementMois.bind(null, annee, moisStocke, personne.id);
                    return (
                      <tr key={personne.id} className={rowClass}>
                        <td className={`${tdClass} font-medium`}>{personne.nom}</td>
                        <td className={tdClass}>{formatEuros(du)}</td>
                        <td className="px-4 py-2.5">
                          <form action={setVirementWithId} className="flex items-center gap-1">
                            <input
                              key={recu}
                              className={`${inputClass} w-24`}
                              type="number"
                              step="0.01"
                              min="0"
                              name="montant"
                              defaultValue={recu}
                            />
                            <button type="submit" className={buttonSecondarySmallClass}>
                              OK
                            </button>
                          </form>
                        </td>
                        <td className={`px-4 py-2.5 font-medium ${reste > 0 ? "text-warn" : "text-pos"}`}>
                          {formatEuros(reste)}
                        </td>
                      </tr>
                    );
                  })}
                  {personnes.length === 0 && (
                    <tr>
                      <td colSpan={4} className={emptyRowClass}>
                        Aucune personne pour le moment.
                      </td>
                    </tr>
                  )}
                </tbody>
                {personnes.length > 0 && (
                  <tfoot>
                    <tr className={footRowClass}>
                      <td className="px-4 py-2.5">Total</td>
                      <td className="px-4 py-2.5">{formatEuros(besoinMensuel)}</td>
                      <td className="px-4 py-2.5">{formatEuros(virementsRecusReels)}</td>
                      <td className="px-4 py-2.5">{formatEuros(besoinMensuel - virementsRecusReels)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </div>

        <section className={cardPadClass}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
            Où va le besoin mensuel — {moisLabel(annee, mois0)}
          </p>
          <p className="mt-1 text-lg font-semibold text-text">{formatEuros(besoinCommunMoisAffiche)}</p>
          <div className="mt-3 flex flex-col gap-3">
            {(
              [
                { label: "Charges mensuelles", value: chargesCommunesTotal, bar: "bg-accent" },
                {
                  label: "Charges annuelles (provision)",
                  value: detail.provisionAnnuellesCommunesTotal,
                  bar: "bg-warn",
                },
                {
                  label: "Achats prévus (provision)",
                  value: detail.provisionsAchatsCeMoisTotal,
                  bar: "bg-flag",
                },
              ] as const
            ).map((ligne) => {
              const pct =
                besoinCommunMoisAffiche > 0
                  ? Math.min(100, Math.round((ligne.value / besoinCommunMoisAffiche) * 100))
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

          {categoriesTrieesCommun.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <p className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>Par catégorie</p>
              <div className="mt-3 flex flex-col gap-3">
                {categoriesTrieesCommun.map((cat) => {
                  const pct =
                    besoinCommunMoisAffiche > 0
                      ? Math.min(100, Math.round((cat.montant / besoinCommunMoisAffiche) * 100))
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

          <div className="mt-5 border-t border-border pt-4">
            <p className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>Ce mois-ci</p>
            {rienASignalerCeMois ? (
              <p className={`mt-2 text-sm ${mutedClass}`}>Pas d&apos;échéance ni de charge restante à signaler.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {chargesMensuellesRestantesCeMois > 0 && (
                  <span className={pillClass("accent")}>
                    Dépenses quotidiennes dispo · {formatEuros(chargesMensuellesRestantesCeMois)}
                  </span>
                )}
                {chargesAnnuellesDuesCeMois.map((d) => (
                  <span key={`charge-annuelle-${d.charge.id}`} className={pillClass("warn")}>
                    {d.charge.libelle} · {formatEuros(d.montantDu)}
                  </span>
                ))}
                {achatsDusCeMois.map((d) => (
                  <span key={`achat-${d.achat.id}`} className={pillClass("flag")}>
                    {d.achat.libelle} · {formatEuros(d.montantDu)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section>
        <h3 className={sectionHeadingClass}>Charges mensuelles communes</h3>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Considérées payées par défaut au montant de référence dès le 1er du mois (ou dès le jour de
          prélèvement configuré, coché automatiquement une fois ce jour atteint) — décoche si ce
          n&apos;est pas le cas. Les charges à montant variable affichent un champ à ajuster, jour de
          prélèvement configurable dans{" "}
          <Link href="/charges-mensuelles" className={linkClass}>
            Charges mensuelles
          </Link>
          .
        </p>
        <div className={`mt-3 ${tableWrapClass}`}>
          <table className="w-full min-w-[720px] table-fixed text-sm">
            <thead className={theadRowClass}>
              <tr>
                <th className={`${thClass} w-[14%]`}>Payé / montant</th>
                <th className={`${thClass} w-[26%]`}>Libellé</th>
                <th className={`${thClass} w-[18%]`}>Catégorie</th>
                <th className={`${thClass} w-[42%]`}>Montant dû ce mois-ci</th>
              </tr>
            </thead>
            <tbody>
              {chargesCommunesListe.map((charge) => (
                <tr key={charge.id} className={rowClass}>
                  <td className="px-4 py-2.5">
                    {charge.budgetDepensesQuotidiennes ? (
                      <span className="text-text">
                        {formatEuros(montantPayeCharge(charge, charge.montant))} / {formatEuros(charge.montant)}
                      </span>
                    ) : charge.montantVariable ? (
                      <MontantPayeInput
                        annee={annee}
                        mois={moisStocke}
                        chargeId={charge.id}
                        montantActuel={montantPayeCharge(charge, charge.montant)}
                      />
                    ) : (
                      <PaiementCheckbox
                        key={chargeDejaDebiteeParDefaut(charge, annee, mois0, from) ? "d" : "p"}
                        annee={annee}
                        mois={moisStocke}
                        type="CHARGE_MENSUELLE"
                        refId={charge.id}
                        defaultChecked={
                          moisDetail.paiements.get(clePaiement("CHARGE_MENSUELLE", charge.id)) ??
                          chargeDejaDebiteeParDefaut(charge, annee, mois0, from)
                        }
                      />
                    )}
                  </td>
                  <td className={tdClass}>{charge.libelle}</td>
                  <td className={tdMutedClass}>{nomCompletCategorie(charge.categorie) ?? "—"}</td>
                  <td className={tdClass}>{formatEuros(charge.montant)}</td>
                </tr>
              ))}
              {chargesCommunesListe.length === 0 && (
                <tr>
                  <td colSpan={4} className={emptyRowClass}>
                    Aucune charge mensuelle commune.
                  </td>
                </tr>
              )}
            </tbody>
            {chargesCommunesListe.length > 0 && (
              <tfoot>
                <tr className={footRowClass}>
                  <td className="px-4 py-2.5" colSpan={3}>
                    Total dû ce mois-ci
                  </td>
                  <td className="px-4 py-2.5">
                    {formatEuros(chargesCommunesListe.reduce((s, c) => s + c.montant, 0))}
                    {chargesMensuellesRestantesCeMois > 0 && (
                      <span className={`ml-1 font-normal ${mutedClass}`}>
                        (dont {formatEuros(chargesMensuellesRestantesCeMois)} de dépenses du quotidien
                        disponible)
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {detail.chargesAnnuelles.length > 0 && (
        <section>
          <h3 className={sectionHeadingClass}>Charges annuelles (prorata)</h3>
          <p className={`mt-1 text-sm ${mutedClass}`}>
            La case « Provisionnée » est indicative (comme pour les achats prévus) et n&apos;affecte pas
            le solde. « Marquer comme payé », en revanche, débite immédiatement le montant du solde
            actuel du compte commun ci-dessus — à utiliser une fois la charge réellement réglée
            (réversible via « Repasser en attente »). Ne concerne que l&apos;échéance de cette
            année-ci ; redevient à régler automatiquement l&apos;année suivante.
          </p>
          <div className={`mt-3 ${tableWrapClass}`}>
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <thead className={theadRowClass}>
                <tr>
                  <th className={`${thClass} w-[14%]`}>Provisionnée</th>
                  <th className={`${thClass} w-[26%]`}>Libellé</th>
                  <th className={`${thClass} w-[18%]`}>Catégorie</th>
                  <th className={`${thClass} w-[42%]`}>Montant dû ce mois-ci</th>
                </tr>
              </thead>
              <tbody>
                {detail.chargesAnnuelles.map((d) => {
                  const dejaPayee = dejaPayeeCeCycle(d.charge, annee, mois0);
                  return (
                    <tr key={d.charge.id} className={rowClass}>
                      <td className="px-4 py-2.5">
                        <PaiementCheckbox
                          annee={annee}
                          mois={moisStocke}
                          type="CHARGE_ANNUELLE"
                          refId={d.charge.id}
                          defaultChecked={
                            moisDetail.paiements.get(clePaiement("CHARGE_ANNUELLE", d.charge.id)) ?? true
                          }
                        />
                      </td>
                      <td className={tdClass}>
                        {d.charge.libelle}
                        {dejaPayee && <span className={`ml-2 ${pillClass("pos")}`}>Payée</span>}
                      </td>
                      <td className={tdMutedClass}>
                        {(d.charge.categorieId && categorieNomCompletParId.get(d.charge.categorieId)) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className={`text-xs ${mutedClass}`}>
                              {d.estEcheance ? "Échéance (montant plein)" : "Provision"}
                            </p>
                            <p className="text-text">{formatEuros(d.montantDu)}</p>
                          </div>
                          {dejaPayee ? (
                            <form action={demarquerChargeAnnuellePayee}>
                              <input type="hidden" name="id" value={d.charge.id} />
                              <button type="submit" className={`${buttonSecondarySmallClass} whitespace-nowrap`}>
                                Repasser en attente
                              </button>
                            </form>
                          ) : (
                            <form action={marquerChargeAnnuellePayee.bind(null, annee, moisStocke)}>
                              <input type="hidden" name="id" value={d.charge.id} />
                              <button type="submit" className={`${buttonPositiveSmallClass} whitespace-nowrap`}>
                                Marquer comme payé
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={footRowClass}>
                  <td className="px-4 py-2.5" colSpan={3}>
                    Total dû ce mois-ci
                  </td>
                  <td className="px-4 py-2.5">
                    {formatEuros(totalDuChargesAnnuelles)}
                    {chargesAnnuellesDuesCeMois.length > 0 && (
                      <span className={`ml-1 font-normal ${mutedClass}`}>
                        (dont {formatEuros(dejaCumuleChargesAnnuelles)} déjà cumulé via le prorata des
                        mois précédents)
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {detail.achats.length > 0 && (
        <section>
          <h3 className={sectionHeadingClass}>Achats prévus</h3>
          <p className={`mt-1 text-sm ${mutedClass}`}>
            La case « Provisionné » est indicative (comme pour les autres charges) et n&apos;affecte pas
            le solde. « Marquer comme acheté », en revanche, débite immédiatement le montant restant du
            solde actuel du compte commun ci-dessus — à utiliser une fois l&apos;achat réellement
            effectué (réversible via « Repasser en cours »).
          </p>
          <div className={`mt-3 ${tableWrapClass}`}>
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <thead className={theadRowClass}>
                <tr>
                  <th className={`${thClass} w-[14%]`}>Provisionné</th>
                  <th className={`${thClass} w-[26%]`}>Libellé</th>
                  <th className={`${thClass} w-[18%]`}>Catégorie</th>
                  <th className={`${thClass} w-[42%]`}>Montant dû ce mois-ci</th>
                </tr>
              </thead>
              <tbody>
                {detail.achats.map((d) => (
                  <tr key={d.achat.id} className={rowClass}>
                    <td className="px-4 py-2.5">
                      <PaiementCheckbox
                        annee={annee}
                        mois={moisStocke}
                        type="ACHAT_PREVU"
                        refId={d.achat.id}
                        defaultChecked={
                          d.estEcheance
                            ? Boolean(moisDetail.paiements.get(clePaiement("ACHAT_PREVU", d.achat.id)))
                            : (moisDetail.paiements.get(clePaiement("ACHAT_PREVU", d.achat.id)) ?? true)
                        }
                      />
                    </td>
                    <td className={tdClass}>
                      {d.achat.libelle}
                      {d.achat.achete && <span className={`ml-2 ${pillClass("pos")}`}>Acheté</span>}
                    </td>
                    <td className={tdMutedClass}>
                      {(d.achat.categorieId && categorieNomCompletParId.get(d.achat.categorieId)) ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={`text-xs ${mutedClass}`}>
                            {d.estEcheance ? "Échéance (montant restant)" : "Provision"}
                          </p>
                          <p className="text-text">{formatEuros(d.montantDu)}</p>
                        </div>
                        {d.achat.achete ? (
                          <form action={demarquerAchatAchete}>
                            <input type="hidden" name="id" value={d.achat.id} />
                            <button type="submit" className={`${buttonSecondarySmallClass} whitespace-nowrap`}>
                              Repasser en cours
                            </button>
                          </form>
                        ) : (
                          <form action={marquerAchatAchete.bind(null, annee, moisStocke)}>
                            <input type="hidden" name="id" value={d.achat.id} />
                            <button type="submit" className={`${buttonPositiveSmallClass} whitespace-nowrap`}>
                              Marquer comme acheté
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={footRowClass}>
                  <td className="px-4 py-2.5" colSpan={3}>
                    Total dû ce mois-ci
                  </td>
                  <td className="px-4 py-2.5">
                    {formatEuros(totalDuAchats)}
                    {dejaCumuleAchats > 0 && (
                      <span className={`ml-1 font-normal ${mutedClass}`}>
                        (dont {formatEuros(dejaCumuleAchats)} déjà cumulé via le prorata des mois
                        précédents)
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      <RevenusExceptionnelsSection
        titre="Revenus exceptionnels"
        annee={annee}
        moisStocke={moisStocke}
        personneId={null}
        revenus={moisDetail.revenusExceptionnels.filter((r) => r.personneId === null)}
      />

      <DepensesQuotidiennesSection
        titre="Dépenses du quotidien"
        annee={annee}
        moisStocke={moisStocke}
        personneId={null}
        depenses={moisDetail.depensesQuotidiennes.filter((d) => d.personneId === null)}
      />
    </div>
  );

  const personnePanel = (personne: Personne) => {
    const chargesPersoListe = chargesMensuellesResolues.filter(
      (c: ChargeMensuelle) =>
        c.compte === "PERSO" && c.personneId === personne.id && estChargeMensuelleActive(c, annee, mois0)
    );
    const totalCharges = chargesPersoListe.reduce((sum, c) => sum + c.montant, 0);
    const chargesPayeesReelles = chargesPersoListe.reduce(
      (sum, c) => sum + montantPayeCharge(c, c.montant),
      0
    );
    const chargesRestantes = totalCharges - chargesPayeesReelles;
    // Isolée du reste : la charge budget "Dépenses du quotidien" (s'il y en a
    // une pour cette personne) représente un disponible à dépenser, pas une
    // charge à régler comme les autres — libellé différent dans "Ce mois-ci".
    const chargeBudgetQuotidien = chargesPersoListe.find((c) => c.budgetDepensesQuotidiennes);
    const chargesRestantesQuotidien = chargeBudgetQuotidien
      ? Math.max(chargeBudgetQuotidien.montant - montantPayeCharge(chargeBudgetQuotidien, chargeBudgetQuotidien.montant), 0)
      : 0;
    const chargesRestantesHorsQuotidien = chargesRestantes - chargesRestantesQuotidien;

    const detailAnnuellesPerso = detailChargesAnnuellesPersonneMois({
      chargesAnnuelles,
      personneId: personne.id,
      annee,
      mois: mois0,
      from,
    });
    const totalDuAnnuellesPerso = detailAnnuellesPerso.items.reduce((sum, d) => sum + d.montantDu, 0);
    const dejaCumuleAnnuellesPerso = detailAnnuellesPerso.items
      .filter((d) => d.estEcheance)
      .reduce((sum, d) => sum + (d.montantDu - d.provision), 0);
    const chargesAnnuellesPersoRestantes = detailAnnuellesPerso.items.reduce((sum, d) => {
      // Déjà débitée en direct ce mois-ci via « Marquer comme payé » : ne
      // pas la déduire une seconde fois du solde perso projeté.
      if (dejaPayeeCeCycle(d.charge, annee, mois0)) return sum;
      const paye = montantEffectifPaye(
        moisDetail.paiements,
        moisDetail.montants,
        clePaiement("CHARGE_ANNUELLE", d.charge.id),
        d.montantDu
      );
      return sum + Math.max(d.montantDu - paye, 0);
    }, 0);

    const detailAchatsPerso = detailAchatsPrevusPersonneMois({
      achatsPrevus,
      personneId: personne.id,
      annee,
      mois: mois0,
      from,
    });
    const totalDuAchatsPerso = detailAchatsPerso.items.reduce((sum, d) => sum + d.montantDu, 0);
    const dejaCumuleAchatsPerso = detailAchatsPerso.items
      .filter((d) => d.estEcheance && !d.achat.sansProvisionnement && !d.achat.achete)
      .reduce((sum, d) => sum + (d.montantDu - d.provision), 0);
    // Chaîné via `projectionsPersonnes` (comme le solde commun) : un mois
    // futur doit passer par tous les mois intermédiaires, pas seulement
    // soustraire les charges de ce mois du solde ACTUEL (qui donnerait un
    // solde bien trop bas, en ignorant les revenus/virements à venir d'ici
    // là).
    const lignesProjectionPersonne = projectionsPersonnes.get(personne.id) ?? [];
    const soldePersoDebutMois = estMoisCourantOuPasse
      ? personne.soldePerso
      : (lignesProjectionPersonne[index - 1]?.soldePerso ?? personne.soldePerso);
    const soldeProjeteFinMois =
      index >= 0 ? (lignesProjectionPersonne[index]?.soldePerso ?? soldePersoDebutMois) : soldePersoDebutMois;
    // Plafonnée au solde lui-même (voir le commentaire équivalent côté commun).
    const provisionReserveePerso = Math.min(
      provisionReserveePersonneMois(chargesAnnuelles, achatsPrevus, personne.id, annee, mois0, from),
      Math.max(soldeProjeteFinMois, 0)
    );

    const revenusDuMois = revenus.filter(
      (r: Revenu) => r.personneId === personne.id && revenuActifPourMois(r, annee, mois0)
    );
    const totalRevenusDuMois = revenusDuMoisTotal(
      revenus,
      personne.id,
      annee,
      mois0,
      revenuAnnuelOverrides,
      revenuMensuelOverrides
    );

    const virementCommunRecu =
      moisDetail.virements.get(personne.id) ?? personne.virementMensuelHabituel;
    const virementEpargneRecu =
      moisDetail.virementsEpargne.get(personne.id) ?? personne.virementEpargneMensuelHabituel;

    const setVirementCommunWithId = setVirementMois.bind(null, annee, moisStocke, personne.id);
    const setVirementEpargneWithId = setVirementEpargneMois.bind(null, annee, moisStocke, personne.id);

    // Pour le panneau "Où va le budget mensuel" (mêmes montants que le
    // tableau de bord, mais pour le mois affiché plutôt que le mois en cours).
    const besoinPersoMoisAffiche =
      totalCharges + detailAnnuellesPerso.provisionTotal + detailAchatsPerso.provisionTotal + virementCommunRecu + virementEpargneRecu;
    const chargesAnnuellesDuesPersoCeMois = detailAnnuellesPerso.items.filter((d) => d.estEcheance);
    const achatsDusPersoCeMois = detailAchatsPerso.items.filter((d) => d.estEcheance && !d.achat.achete);
    const rienASignalerPersoCeMois =
      chargesRestantes <= 0 && achatsDusPersoCeMois.length === 0 && chargesAnnuellesDuesPersoCeMois.length === 0;

    return (
      <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        <div className="flex flex-col gap-8 lg:col-span-2">
        <section className={cardPadClass}>
          <h3 className={subHeadingClass}>Comptes de {personne.nom}</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className={`text-xs ${mutedClass}`}>Solde perso actuel</p>
              <p
                className="cursor-help text-lg font-semibold text-text"
                title="= solde renseigné dans Personnes, déjà net des montants payés ci-dessous."
              >
                {formatEuros(personne.soldePerso)}
              </p>
            </div>
            <div>
              <p className={`text-xs ${mutedClass}`}>Solde perso projeté fin de mois</p>
              <p
                className={`cursor-help text-lg font-semibold ${soldeProjeteFinMois < 0 ? "text-neg" : "text-pos"}`}
                title={
                  estMoisCourantOuPasse
                    ? "= solde actuel − charges perso non décochées (payées par défaut) − charges annuelles et achats prévus perso à échéance ce mois-ci. Les cases « Provisionné » restent indicatives ; seuls « Marquer comme payé »/« Marquer comme acheté » débitent réellement ce solde."
                    : "= solde perso projeté en chaînant tous les mois entre aujourd'hui et ce mois (revenus, charges perso et annuelles, virements vers le commun et l'épargne, au montant de référence pour chaque mois intermédiaire)."
                }
              >
                {formatEuros(soldeProjeteFinMois)}
              </p>
              {provisionReserveePerso > 0 && (
                <p
                  className={`cursor-help text-xs ${mutedClass}`}
                  title="Part du solde déjà mise de côté par le lissage mensuel pour les prochaines charges annuelles et achats prévus perso — à ne pas compter comme librement disponible."
                >
                  dont {formatEuros(provisionReserveePerso)} de provision
                </p>
              )}
            </div>
            <div>
              <p className={`text-xs ${mutedClass}`}>Solde compte épargne actuel</p>
              <p
                className="cursor-help text-lg font-semibold text-text"
                title="= solde renseigné dans Personnes, déjà net du virement épargne saisi ci-dessous."
              >
                {formatEuros(personne.soldeEpargne)}
              </p>
            </div>
            <div>
              <p className={`text-xs ${mutedClass}`}>Viré vers le compte commun ce mois-ci</p>
              <p
                className="mt-1 cursor-help text-lg font-semibold text-text"
                title={`= montant réellement saisi dans « Virements internes » ci-dessous (référence : ${formatEuros(personne.virementMensuelHabituel)}).`}
              >
                {formatEuros(virementCommunRecu)}
              </p>
            </div>
            <div>
              <p className={`text-xs ${mutedClass}`}>Viré vers l&apos;épargne ce mois-ci</p>
              <p
                className="mt-1 cursor-help text-lg font-semibold text-text"
                title={`= montant réellement saisi dans « Virements internes » ci-dessous (référence : ${formatEuros(personne.virementEpargneMensuelHabituel)}). Négatif = retrait de l'épargne.`}
              >
                {formatEuros(virementEpargneRecu)}
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className={sectionHeadingClass}>Revenus du mois</h3>
          <div className={`mt-3 ${tableWrapClass}`}>
            <table className="w-full min-w-[480px] text-sm">
              <thead className={theadRowClass}>
                <tr>
                  <th className={thClass}>Libellé</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {revenusDuMois.map((revenu) => {
                  const setMontantAnnuelWithId = setRevenuAnnuelMontant.bind(null, revenu.id, annee);
                  const montantAnnuelActuel = montantEffectifRevenuAnnuel(
                    revenuAnnuelOverrides,
                    revenu.id,
                    annee,
                    revenu.montant
                  );
                  const setMontantMensuelWithId = setRevenuMensuelMontant.bind(null, revenu.id, annee, moisStocke);
                  const montantMensuelActuel = montantEffectifRevenuMensuel(
                    revenuMensuelOverrides,
                    revenu.id,
                    annee,
                    moisStocke,
                    revenu.montant
                  );
                  return (
                    <tr key={revenu.id} className={rowClass}>
                      <td className={tdClass}>{revenu.libelle}</td>
                      <td className={tdMutedClass}>
                        {revenu.type === "MENSUEL"
                          ? `Mensuel (réf. ${formatEuros(revenu.montant)})`
                          : revenu.type === "ANNUEL"
                            ? `Annuel (réf. ${formatEuros(revenu.montant)})`
                            : `Ponctuel${revenu.date ? ` — ${formatDate(revenu.date)}` : ""}`}
                      </td>
                      <td className={tdClass}>
                        {revenu.type === "ANNUEL" ? (
                          <form action={setMontantAnnuelWithId} className="flex items-center gap-1">
                            <input
                              className={`${inputClass} w-24`}
                              type="number"
                              step="0.01"
                              min="0"
                              name="montant"
                              defaultValue={montantAnnuelActuel}
                            />
                            <button type="submit" className={buttonSecondarySmallClass}>
                              OK
                            </button>
                          </form>
                        ) : revenu.type === "MENSUEL" ? (
                          <form action={setMontantMensuelWithId} className="flex items-center gap-1">
                            <input
                              className={`${inputClass} w-24`}
                              type="number"
                              step="0.01"
                              min="0"
                              name="montant"
                              defaultValue={montantMensuelActuel}
                            />
                            <button type="submit" className={buttonSecondarySmallClass}>
                              OK
                            </button>
                          </form>
                        ) : (
                          formatEuros(revenu.montant)
                        )}
                      </td>
                    </tr>
                  );
                })}
                {revenusDuMois.length === 0 && (
                  <tr>
                    <td colSpan={3} className={emptyRowClass}>
                      Aucun revenu pour {personne.nom} ce mois-ci.
                    </td>
                  </tr>
                )}
              </tbody>
              {revenusDuMois.length > 0 && (
                <tfoot>
                  <tr className={footRowClass}>
                    <td className="px-4 py-2.5" colSpan={2}>
                      Total
                    </td>
                    <td className="px-4 py-2.5">{formatEuros(totalRevenusDuMois)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
        </div>

        <section className={cardPadClass}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
            Où va le budget mensuel — {moisLabel(annee, mois0)}
          </p>
          <p className="mt-1 text-lg font-semibold text-text">{formatEuros(besoinPersoMoisAffiche)}</p>
          <div className="mt-3 flex flex-col gap-3">
            {(
              [
                { label: "Charges perso", value: totalCharges, bar: "bg-accent" },
                {
                  label: "Charges annuelles perso (provision)",
                  value: detailAnnuellesPerso.provisionTotal,
                  bar: "bg-warn",
                },
                {
                  label: "Achats prévus perso (provision)",
                  value: detailAchatsPerso.provisionTotal,
                  bar: "bg-flag",
                },
                { label: "Virement vers commun", value: virementCommunRecu, bar: "bg-pos" },
                { label: "Virement vers l'épargne", value: virementEpargneRecu, bar: "bg-muted-2" },
              ] as const
            ).map((ligne) => {
              const pct =
                besoinPersoMoisAffiche > 0
                  ? Math.min(100, Math.round((ligne.value / besoinPersoMoisAffiche) * 100))
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

          <div className="mt-5 border-t border-border pt-4">
            <p className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>Ce mois-ci</p>
            {rienASignalerPersoCeMois ? (
              <p className={`mt-2 text-sm ${mutedClass}`}>
                Pas d&apos;échéance ni de charge restante à signaler.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {chargesRestantesQuotidien > 0 && (
                  <span className={pillClass("accent")}>
                    Dépenses du quotidien disponible · {formatEuros(chargesRestantesQuotidien)}
                  </span>
                )}
                {chargesRestantesHorsQuotidien > 0 && (
                  <span className={pillClass("accent")}>
                    Charges perso restantes · {formatEuros(chargesRestantesHorsQuotidien)}
                  </span>
                )}
                {chargesAnnuellesDuesPersoCeMois.map((d) => (
                  <span key={`charge-annuelle-${d.charge.id}`} className={pillClass("warn")}>
                    {d.charge.libelle} · {formatEuros(d.montantDu)}
                  </span>
                ))}
                {achatsDusPersoCeMois.map((d) => (
                  <span key={`achat-${d.achat.id}`} className={pillClass("flag")}>
                    {d.achat.libelle} · {formatEuros(d.montantDu)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

        <section>
          <RevenusExceptionnelsSection
            titre="Revenus exceptionnels"
            annee={annee}
            moisStocke={moisStocke}
            personneId={personne.id}
            revenus={moisDetail.revenusExceptionnels.filter((r) => r.personneId === personne.id)}
          />
        </section>

        <section>
          <h3 className={sectionHeadingClass}>Virements internes</h3>
          <p className={`mt-1 text-sm ${mutedClass}`}>
            Ce que {personne.nom} vire vers le compte commun et vers son épargne ce mois-ci. Même
            valeur que «&nbsp;Déjà transféré&nbsp;» dans l&apos;onglet Compte commun pour la première
            ligne — modifiable ici ou là-bas, les deux se mettent à jour ensemble. Contrairement aux
            autres lignes, le virement épargne ponctuel débite/crédite immédiatement les soldes perso
            et épargne actuels ci-dessus dès la saisie (comme une dépense du quotidien) : positif pour
            mettre de côté, négatif pour puiser dans les économies.
          </p>
          <div className={`mt-3 ${tableWrapClass}`}>
            <table className="w-full min-w-[560px] text-sm">
              <thead className={theadRowClass}>
                <tr>
                  <th className={thClass}>Viré / montant</th>
                  <th className={thClass}>Libellé</th>
                  <th className={thClass}>Montant dû ce mois-ci</th>
                </tr>
              </thead>
              <tbody>
                <tr className={rowClass}>
                  <td className="px-4 py-2.5">
                    <form action={setVirementCommunWithId} className="flex items-center gap-1">
                      <input
                        key={virementCommunRecu}
                        className={`${inputClass} w-24`}
                        type="number"
                        step="0.01"
                        min="0"
                        name="montant"
                        defaultValue={virementCommunRecu}
                      />
                      <button type="submit" className={buttonSecondarySmallClass}>
                        OK
                      </button>
                    </form>
                  </td>
                  <td className={tdClass}>Virement — Compte commun</td>
                  <td className={tdClass}>{formatEuros(personne.virementMensuelHabituel)}</td>
                </tr>
                <tr className={rowClass}>
                  <td className="px-4 py-2.5">
                    <form action={setVirementEpargneWithId} className="flex items-center gap-1">
                      <input
                        key={virementEpargneRecu}
                        className={`${inputClass} w-24`}
                        type="number"
                        step="0.01"
                        name="montant"
                        defaultValue={virementEpargneRecu}
                      />
                      <button type="submit" className={buttonSecondarySmallClass}>
                        OK
                      </button>
                    </form>
                  </td>
                  <td className={tdClass}>
                    <span
                      className="cursor-help border-b border-dotted border-muted-2"
                      title="Ce que cette personne vire réellement ce mois-ci entre son compte perso et son compte épargne. Positif = dépôt, négatif = retrait de l'épargne."
                    >
                      Virement — Compte épargne
                    </span>
                  </td>
                  <td className={tdClass}>{formatEuros(personne.virementEpargneMensuelHabituel)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className={sectionHeadingClass}>Charges perso</h3>
          <div className={`mt-3 ${tableWrapClass}`}>
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <thead className={theadRowClass}>
                <tr>
                  <th className={`${thClass} w-[14%]`}>Payé / montant</th>
                  <th className={`${thClass} w-[26%]`}>Libellé</th>
                  <th className={`${thClass} w-[18%]`}>Catégorie</th>
                  <th className={`${thClass} w-[42%]`}>Montant dû ce mois-ci</th>
                </tr>
              </thead>
              <tbody>
                {chargesPersoListe.map((charge) => (
                  <tr key={charge.id} className={rowClass}>
                    <td className="px-4 py-2.5">
                      {charge.budgetDepensesQuotidiennes ? (
                        <span className="text-text">
                          {formatEuros(montantPayeCharge(charge, charge.montant))} / {formatEuros(charge.montant)}
                        </span>
                      ) : charge.montantVariable ? (
                        <MontantPayeInput
                          annee={annee}
                          mois={moisStocke}
                          chargeId={charge.id}
                          montantActuel={montantPayeCharge(charge, charge.montant)}
                        />
                      ) : (
                        <PaiementCheckbox
                          key={chargeDejaDebiteeParDefaut(charge, annee, mois0, from) ? "d" : "p"}
                          annee={annee}
                          mois={moisStocke}
                          type="CHARGE_MENSUELLE"
                          refId={charge.id}
                          defaultChecked={
                            moisDetail.paiements.get(clePaiement("CHARGE_MENSUELLE", charge.id)) ??
                            chargeDejaDebiteeParDefaut(charge, annee, mois0, from)
                          }
                        />
                      )}
                    </td>
                    <td className={tdClass}>{charge.libelle}</td>
                    <td className={tdMutedClass}>{nomCompletCategorie(charge.categorie) ?? "—"}</td>
                    <td className={tdClass}>{formatEuros(charge.montant)}</td>
                  </tr>
                ))}
                {chargesPersoListe.length === 0 && (
                  <tr>
                    <td colSpan={4} className={emptyRowClass}>
                      Aucune charge perso pour {personne.nom}.
                    </td>
                  </tr>
                )}
              </tbody>
              {chargesPersoListe.length > 0 && (
                <tfoot>
                  <tr className={footRowClass}>
                    <td className="px-4 py-2.5" colSpan={3}>
                      Total dû ce mois-ci
                    </td>
                    <td className="px-4 py-2.5">
                      {formatEuros(totalCharges)}
                      {chargesRestantesQuotidien > 0 && (
                        <span className={`ml-1 font-normal ${mutedClass}`}>
                          (dont {formatEuros(chargesRestantesQuotidien)} de dépenses du quotidien
                          disponible)
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className={`mt-2 text-sm ${mutedClass}`}>
            Les charges à montant fixe sont considérées payées par défaut (décoche si ce n&apos;est
            pas le cas ce mois-ci). Pour une charge à montant variable (ex : carburant), indique le
            montant réellement payé — il peut différer du montant de référence. Le caractère
            fixe/variable se configure dans{" "}
            <Link href="/charges-mensuelles" className={linkClass}>
              Charges mensuelles
            </Link>
            .
          </p>
        </section>

        {detailAnnuellesPerso.items.length > 0 && (
          <section>
            <h3 className={sectionHeadingClass}>Charges annuelles perso (prorata)</h3>
            <p className={`mt-1 text-sm ${mutedClass}`}>
              La case « Provisionnée » est indicative (comme pour les achats prévus) et n&apos;affecte
              pas le solde. « Marquer comme payé », en revanche, débite immédiatement le montant du
              solde perso actuel de {personne.nom} ci-dessus — à utiliser une fois la charge réellement
              réglée (réversible via « Repasser en attente »). Ne concerne que l&apos;échéance de cette
              année-ci ; redevient à régler automatiquement l&apos;année suivante.
            </p>
            <div className={`mt-3 ${tableWrapClass}`}>
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <thead className={theadRowClass}>
                  <tr>
                    <th className={`${thClass} w-[14%]`}>Provisionnée</th>
                    <th className={`${thClass} w-[26%]`}>Libellé</th>
                    <th className={`${thClass} w-[18%]`}>Catégorie</th>
                    <th className={`${thClass} w-[42%]`}>Montant dû ce mois-ci</th>
                  </tr>
                </thead>
                <tbody>
                  {detailAnnuellesPerso.items.map((d) => {
                    const dejaPayee = dejaPayeeCeCycle(d.charge, annee, mois0);
                    return (
                      <tr key={d.charge.id} className={rowClass}>
                        <td className="px-4 py-2.5">
                          <PaiementCheckbox
                            annee={annee}
                            mois={moisStocke}
                            type="CHARGE_ANNUELLE"
                            refId={d.charge.id}
                            defaultChecked={
                              moisDetail.paiements.get(clePaiement("CHARGE_ANNUELLE", d.charge.id)) ?? true
                            }
                          />
                        </td>
                        <td className={tdClass}>
                          {d.charge.libelle}
                          {dejaPayee && <span className={`ml-2 ${pillClass("pos")}`}>Payée</span>}
                        </td>
                        <td className={tdMutedClass}>
                          {(d.charge.categorieId && categorieNomCompletParId.get(d.charge.categorieId)) ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className={`text-xs ${mutedClass}`}>
                                {d.estEcheance ? "Échéance (montant plein)" : "Provision"}
                              </p>
                              <p className="text-text">{formatEuros(d.montantDu)}</p>
                            </div>
                            {dejaPayee ? (
                              <form action={demarquerChargeAnnuellePayee}>
                                <input type="hidden" name="id" value={d.charge.id} />
                                <button type="submit" className={`${buttonSecondarySmallClass} whitespace-nowrap`}>
                                  Repasser en attente
                                </button>
                              </form>
                            ) : (
                              <form action={marquerChargeAnnuellePayee.bind(null, annee, moisStocke)}>
                                <input type="hidden" name="id" value={d.charge.id} />
                                <button type="submit" className={`${buttonPositiveSmallClass} whitespace-nowrap`}>
                                  Marquer comme payé
                                </button>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className={footRowClass}>
                    <td className="px-4 py-2.5" colSpan={3}>
                      Total dû ce mois-ci
                    </td>
                    <td className="px-4 py-2.5">
                      {formatEuros(totalDuAnnuellesPerso)}
                      {chargesAnnuellesDuesPersoCeMois.length > 0 && (
                        <span className={`ml-1 font-normal ${mutedClass}`}>
                          (dont {formatEuros(dejaCumuleAnnuellesPerso)} déjà cumulé via le prorata des
                          mois précédents)
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {detailAchatsPerso.items.length > 0 && (
          <section>
            <h3 className={sectionHeadingClass}>Achats prévus perso</h3>
            <p className={`mt-1 text-sm ${mutedClass}`}>
              La case « Provisionné » est indicative (comme pour les autres charges) et n&apos;affecte
              pas le solde. « Marquer comme acheté », en revanche, débite immédiatement le montant
              restant du solde perso actuel de {personne.nom} ci-dessus — à utiliser une fois
              l&apos;achat réellement effectué (réversible via « Repasser en cours »).
            </p>
            <div className={`mt-3 ${tableWrapClass}`}>
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <thead className={theadRowClass}>
                  <tr>
                    <th className={`${thClass} w-[14%]`}>Provisionné</th>
                    <th className={`${thClass} w-[26%]`}>Libellé</th>
                    <th className={`${thClass} w-[18%]`}>Catégorie</th>
                    <th className={`${thClass} w-[42%]`}>Montant dû ce mois-ci</th>
                  </tr>
                </thead>
                <tbody>
                  {detailAchatsPerso.items.map((d) => (
                    <tr key={d.achat.id} className={rowClass}>
                      <td className="px-4 py-2.5">
                        <PaiementCheckbox
                          annee={annee}
                          mois={moisStocke}
                          type="ACHAT_PREVU"
                          refId={d.achat.id}
                          defaultChecked={
                            d.estEcheance
                              ? Boolean(moisDetail.paiements.get(clePaiement("ACHAT_PREVU", d.achat.id)))
                              : (moisDetail.paiements.get(clePaiement("ACHAT_PREVU", d.achat.id)) ?? true)
                          }
                        />
                      </td>
                      <td className={tdClass}>
                        {d.achat.libelle}
                        {d.achat.achete && <span className={`ml-2 ${pillClass("pos")}`}>Acheté</span>}
                      </td>
                      <td className={tdMutedClass}>
                        {(d.achat.categorieId && categorieNomCompletParId.get(d.achat.categorieId)) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className={`text-xs ${mutedClass}`}>
                              {d.estEcheance ? "Échéance (montant restant)" : "Provision"}
                            </p>
                            <p className="text-text">{formatEuros(d.montantDu)}</p>
                          </div>
                          {d.achat.achete ? (
                            <form action={demarquerAchatAchete}>
                              <input type="hidden" name="id" value={d.achat.id} />
                              <button type="submit" className={`${buttonSecondarySmallClass} whitespace-nowrap`}>
                                Repasser en cours
                              </button>
                            </form>
                          ) : (
                            <form action={marquerAchatAchete.bind(null, annee, moisStocke)}>
                              <input type="hidden" name="id" value={d.achat.id} />
                              <button type="submit" className={`${buttonPositiveSmallClass} whitespace-nowrap`}>
                                Marquer comme acheté
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={footRowClass}>
                    <td className="px-4 py-2.5" colSpan={3}>
                      Total dû ce mois-ci
                    </td>
                    <td className="px-4 py-2.5">
                      {formatEuros(totalDuAchatsPerso)}
                      {dejaCumuleAchatsPerso > 0 && (
                        <span className={`ml-1 font-normal ${mutedClass}`}>
                          (dont {formatEuros(dejaCumuleAchatsPerso)} déjà cumulé via le prorata des mois
                          précédents)
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        <DepensesQuotidiennesSection
          titre="Dépenses du quotidien"
          annee={annee}
          moisStocke={moisStocke}
          personneId={personne.id}
          depenses={moisDetail.depensesQuotidiennes.filter((d) => d.personneId === personne.id)}
        />
      </div>
    );
  };

  const tabs = [
    { id: "commun", label: "Compte commun", content: communPanel },
    ...personnes.map((personne) => ({
      id: `personne-${personne.id}`,
      label: personne.nom,
      content: personnePanel(personne),
    })),
  ];
  const defaultTabId = tab && tabs.some((t) => t.id === tab) ? tab : "commun";
  // Conserve l'onglet actuellement sélectionné (compte commun ou une
  // personne) en passant d'un mois à l'autre, plutôt que de retomber sur
  // « Compte commun » par défaut.
  const suffixeTab = defaultTabId !== "commun" ? `?tab=${defaultTabId}` : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link
            href={`${moisCle(moisPrecedent.annee, moisPrecedent.mois0)}${suffixeTab}`}
            className={`text-sm ${linkMutedClass}`}
          >
            ← {moisLabel(moisPrecedent.annee, moisPrecedent.mois0)}
          </Link>
          <h2 className="text-lg font-semibold capitalize text-text">{moisLabel(annee, mois0)}</h2>
          <Link
            href={`${moisCle(moisSuivant.annee, moisSuivant.mois0)}${suffixeTab}`}
            className={`text-sm ${linkMutedClass}`}
          >
            {moisLabel(moisSuivant.annee, moisSuivant.mois0)} →
          </Link>
        </div>
        <Link href="/" className={`text-sm ${linkMutedClass}`}>
          ← Tableau de bord
        </Link>
      </div>

      <Tabs tabs={tabs} defaultTabId={defaultTabId} />
    </div>
  );
}
