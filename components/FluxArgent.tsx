"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatEuros } from "@/lib/format";
import type { FluxPersonne, PosteFlux } from "@/lib/stats";
import { segmentedWrapClass, segmentedItemClass, tableWrapClass, theadRowClass, thClass, tdClass, tdMutedClass } from "@/lib/ui";

// La couleur suit le poste, jamais son rang (palette dataviz, ordre fixe). Revenus, budget et reste en gris neutre.
const COULEUR = {
  neutre: "var(--muted-2)",
  epargne: "var(--viz-1)",
  commun: "var(--viz-2)",
  charges: "var(--viz-3)",
  quotidien: "var(--viz-4)",
};

const LARGEUR_NOEUD = 10;
const ECART = 14;
const HAUTEUR_BASE = 360;
const HAUTEUR_ETIQUETTE = 24;

const eurosRonds = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

type Noeud = {
  id: string;
  nom: string;
  montant: number;
  couleur: string;
  colonne: number;
  y: number;
  h: number;
  /** Étiquette à droite du nœud (première colonne) ou à gauche (les autres). */
  etiquetteADroite: boolean;
};
type Lien = { id: string; source: Noeud; cible: Noeud; montant: number; couleur: string; y0: number; y1: number; epaisseur: number };

/** Mise en page du diagramme : 3 ou 4 colonnes (revenus → budget → grands postes → détail par catégorie). */
function miseEnPage(flux: FluxPersonne, largeur: number) {
  const totalRevenus = flux.revenus.reduce((s, r) => s + r.montant, 0);
  const totalCharges = flux.charges.reduce((s, c) => s + c.montant, 0);
  const totalQuotidien = flux.quotidien.reduce((s, c) => s + c.montant, 0);
  const sorties = flux.epargne + flux.commun + totalCharges + totalQuotidien;
  const reste = totalRevenus - sorties;
  const total = Math.max(totalRevenus, sorties);

  const entrees: PosteFlux[] = [...flux.revenus];
  if (reste < -0.005) entrees.push({ nom: "Pris sur le solde", montant: -reste });

  const postes: { id: string; nom: string; montant: number; couleur: string; enfants: PosteFlux[] }[] = [
    { id: "epargne", nom: "Épargne", montant: flux.epargne, couleur: COULEUR.epargne, enfants: [] },
    { id: "commun", nom: "Compte commun", montant: flux.commun, couleur: COULEUR.commun, enfants: [] },
    { id: "charges", nom: "Charges perso", montant: totalCharges, couleur: COULEUR.charges, enfants: flux.charges },
    { id: "quotidien", nom: "Dépenses du quotidien", montant: totalQuotidien, couleur: COULEUR.quotidien, enfants: flux.quotidien },
    { id: "reste", nom: "Reste disponible", montant: Math.max(0, reste), couleur: COULEUR.neutre, enfants: [] },
  ].filter((p) => p.montant > 0.005);

  const aDetail = postes.some((p) => p.enfants.length > 0);
  const xs = aDetail
    ? [0, largeur * 0.3, largeur * 0.6, largeur - LARGEUR_NOEUD]
    : [0, largeur * 0.4, largeur - LARGEUR_NOEUD];

  const nbMax = Math.max(entrees.length, postes.length);
  const k = (HAUTEUR_BASE - ECART * (nbMax - 1)) / total;
  const hauteur = (v: number) => Math.max(2, v * k);

  // Empile des nœuds verticalement, avec une hauteur de case minimale pour que les étiquettes ne se chevauchent pas.
  const empiler = (
    liste: { id: string; nom: string; montant: number; couleur: string }[],
    colonne: number,
    ecart: number,
    caseMin: number,
    debut: number | null
  ): Noeud[] => {
    const cases = liste.map((p) => Math.max(hauteur(p.montant), caseMin));
    const bloc = cases.reduce((s, c) => s + c, 0) + ecart * (liste.length - 1);
    let y = debut ?? (HAUTEUR_BASE - bloc) / 2;
    return liste.map((p, i) => {
      const h = hauteur(p.montant);
      const noeud = { ...p, colonne, y: y + (cases[i] - h) / 2, h, etiquetteADroite: colonne === 0 };
      y += cases[i] + ecart;
      return noeud;
    });
  };

  const noeudsEntrees = empiler(
    entrees.map((e, i) => ({ id: `revenu-${i}`, nom: e.nom, montant: e.montant, couleur: COULEUR.neutre })),
    0,
    ECART,
    HAUTEUR_ETIQUETTE,
    null
  );
  const budget = empiler([{ id: "budget", nom: "Budget", montant: total, couleur: COULEUR.neutre }], 1, 0, 0, null)[0];
  const noeudsPostes = empiler(postes, 2, ECART, HAUTEUR_ETIQUETTE, null);

  // Détail par catégorie, centré sur les postes parents.
  const enfants = postes.flatMap((p) =>
    p.enfants.map((e, i) => ({ id: `${p.id}-${i}`, nom: e.nom, montant: e.montant, couleur: p.couleur, parent: p.id }))
  );
  let noeudsDetail: Noeud[] = [];
  if (aDetail) {
    const parents = noeudsPostes.filter((n) => enfants.some((e) => e.parent === n.id));
    const centre = (parents[0].y + parents[parents.length - 1].y + parents[parents.length - 1].h) / 2;
    const cases = enfants.map((e) => Math.max(hauteur(e.montant), HAUTEUR_ETIQUETTE));
    const bloc = cases.reduce((s, c) => s + c, 0) + 6 * (enfants.length - 1);
    noeudsDetail = empiler(enfants, 3, 6, HAUTEUR_ETIQUETTE, Math.max(0, centre - bloc / 2));
  }

  for (const n of [budget, ...noeudsPostes, ...noeudsDetail]) n.etiquetteADroite = false;

  // Liens : chaque bande part du bord droit de sa source et arrive au bord gauche de sa cible, empilées dans l'ordre.
  const sortie = new Map<string, number>();
  const arrivee = new Map<string, number>();
  const liens: Lien[] = [];
  const relier = (source: Noeud, cible: Noeud, montant: number, couleur: string) => {
    const epaisseur = Math.max(1, montant * k);
    const y0 = source.y + (sortie.get(source.id) ?? 0);
    const y1 = cible.y + (arrivee.get(cible.id) ?? 0);
    sortie.set(source.id, (sortie.get(source.id) ?? 0) + epaisseur);
    arrivee.set(cible.id, (arrivee.get(cible.id) ?? 0) + epaisseur);
    liens.push({ id: `${source.id}>${cible.id}`, source, cible, montant, couleur, y0, y1, epaisseur });
  };
  for (const n of noeudsEntrees) relier(n, budget, n.montant, COULEUR.neutre);
  for (const n of noeudsPostes) relier(budget, n, n.montant, n.couleur);
  for (const e of enfants) {
    const parent = noeudsPostes.find((n) => n.id === e.parent)!;
    const cible = noeudsDetail.find((n) => n.id === e.id)!;
    relier(parent, cible, e.montant, e.couleur);
  }

  const noeuds = [...noeudsEntrees, budget, ...noeudsPostes, ...noeudsDetail];
  const hauteurTotale = Math.max(HAUTEUR_BASE, ...noeuds.map((n) => n.y + Math.max(n.h, HAUTEUR_ETIQUETTE)));
  return { noeuds, liens, xs, hauteurTotale, totalRevenus };
}

function cheminLien(l: Lien, xs: number[]) {
  const x0 = xs[l.source.colonne] + LARGEUR_NOEUD;
  const x1 = xs[l.cible.colonne];
  const xm = (x0 + x1) / 2;
  const { y0, y1, epaisseur: e } = l;
  return `M ${x0},${y0} C ${xm},${y0} ${xm},${y1} ${x1},${y1} L ${x1},${y1 + e} C ${xm},${y1 + e} ${xm},${y0 + e} ${x0},${y0 + e} Z`;
}

function pourcentage(montant: number, totalRevenus: number) {
  return totalRevenus > 0 ? `${Math.round((montant / totalRevenus) * 100)} % des revenus` : "";
}

function Diagramme({ flux }: { flux: FluxPersonne }) {
  const conteneurRef = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(900);
  const [survol, setSurvol] = useState<{ titre: string; montant: number; x: number; y: number; id: string } | null>(null);

  useEffect(() => {
    const el = conteneurRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entree]) => setLargeur(Math.max(640, entree.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { noeuds, liens, xs, hauteurTotale, totalRevenus } = miseEnPage(flux, largeur);

  const survoler = (e: ReactPointerEvent, id: string, titre: string, montant: number) => {
    const rect = conteneurRef.current!.getBoundingClientRect();
    setSurvol({ id, titre, montant, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const actif = (id: string) => survol === null || survol.id === id || survol.id.split(">").includes(id) || id.split(">").includes(survol.id);

  return (
    <div ref={conteneurRef} className="relative py-4" onPointerLeave={() => setSurvol(null)}>
      <svg width={largeur} height={hauteurTotale} className="block max-w-full overflow-visible" role="img" aria-label="Diagramme des flux d'argent : revenus, budget, puis répartition par poste et par catégorie">
        {liens.map((l) => (
          <path
            key={l.id}
            d={cheminLien(l, xs)}
            fill={l.couleur}
            fillOpacity={survol?.id === l.id ? 0.6 : actif(l.id) ? 0.32 : 0.12}
            onPointerMove={(e) => survoler(e, l.id, `${l.source.nom} → ${l.cible.nom}`, l.montant)}
          />
        ))}
        {noeuds.map((n) => (
          <rect
            key={n.id}
            x={xs[n.colonne]}
            y={n.y}
            width={LARGEUR_NOEUD}
            height={n.h}
            rx={3}
            fill={n.couleur}
            onPointerMove={(e) => survoler(e, n.id, n.nom, n.montant)}
          />
        ))}
      </svg>

      {/* Étiquettes en HTML (largeur automatique), posées sur le diagramme */}
      {noeuds.map((n) => (
        <div
          key={n.id}
          className="pointer-events-none absolute whitespace-nowrap rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-text shadow-[var(--shadow-card)]"
          style={{
            top: 16 + n.y + n.h / 2,
            left: n.etiquetteADroite ? xs[n.colonne] + LARGEUR_NOEUD + 8 : xs[n.colonne] - 8,
            transform: n.etiquetteADroite ? "translateY(-50%)" : "translate(-100%, -50%)",
          }}
        >
          {n.nom} : <span className="font-semibold">{eurosRonds.format(n.montant)}</span>
        </div>
      ))}

      {survol && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-[var(--shadow-pop)]"
          style={{
            top: survol.y + 14,
            left: survol.x > largeur - 240 ? survol.x - 14 : survol.x + 14,
            transform: survol.x > largeur - 240 ? "translateX(-100%)" : undefined,
          }}
        >
          <div className="font-medium text-text">{survol.titre}</div>
          <div className="mt-0.5 text-text">
            {formatEuros(survol.montant)} <span className="text-muted">/ mois</span>
          </div>
          {totalRevenus > 0 && <div className="text-xs text-muted">{pourcentage(survol.montant, totalRevenus)}</div>}
        </div>
      )}
    </div>
  );
}

function Tableau({ flux }: { flux: FluxPersonne }) {
  const totalRevenus = flux.revenus.reduce((s, r) => s + r.montant, 0);
  const totalCharges = flux.charges.reduce((s, c) => s + c.montant, 0);
  const totalQuotidien = flux.quotidien.reduce((s, c) => s + c.montant, 0);
  const reste = totalRevenus - flux.epargne - flux.commun - totalCharges - totalQuotidien;
  const lignes: { nom: string; montant: number; niveau: 0 | 1; couleur?: string }[] = [
    ...flux.revenus.map((r) => ({ nom: r.nom, montant: r.montant, niveau: 0 as const, couleur: COULEUR.neutre })),
    { nom: "Épargne", montant: flux.epargne, niveau: 0, couleur: COULEUR.epargne },
    { nom: "Compte commun", montant: flux.commun, niveau: 0, couleur: COULEUR.commun },
    { nom: "Charges perso", montant: totalCharges, niveau: 0, couleur: COULEUR.charges },
    ...flux.charges.map((c) => ({ nom: c.nom, montant: c.montant, niveau: 1 as const })),
    { nom: "Dépenses du quotidien", montant: totalQuotidien, niveau: 0, couleur: COULEUR.quotidien },
    ...flux.quotidien.map((c) => ({ nom: c.nom, montant: c.montant, niveau: 1 as const })),
    { nom: reste >= 0 ? "Reste disponible" : "Pris sur le solde", montant: Math.abs(reste), niveau: 0, couleur: COULEUR.neutre },
  ];
  return (
    <div className={`${tableWrapClass} my-4`}>
      <table className="w-full text-sm">
        <thead>
          <tr className={theadRowClass}>
            <th className={thClass}>Poste</th>
            <th className={`${thClass} text-right`}>Par mois</th>
            <th className={`${thClass} text-right`}>Part des revenus</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i}>
              <td className={l.niveau === 1 ? `${tdMutedClass} pl-8` : tdClass}>
                <span className="flex items-center gap-2">
                  {l.couleur && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: l.couleur }} />}
                  {l.nom}
                </span>
              </td>
              <td className={`${l.niveau === 1 ? tdMutedClass : tdClass} text-right`}>{formatEuros(l.montant)}</td>
              <td className={`${tdMutedClass} text-right`}>
                {totalRevenus > 0 ? `${Math.round((l.montant / totalRevenus) * 100)} %` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Resume({ flux }: { flux: FluxPersonne }) {
  const revenus = flux.revenus.reduce((s, r) => s + r.montant, 0);
  const depenses =
    flux.commun + flux.charges.reduce((s, c) => s + c.montant, 0) + flux.quotidien.reduce((s, c) => s + c.montant, 0);
  const reste = revenus - depenses - flux.epargne;
  const taux = revenus > 0 ? Math.round((flux.epargne / revenus) * 100) : 0;
  const tauxPossible = revenus > 0 ? Math.round(((flux.epargne + Math.max(0, reste)) / revenus) * 100) : 0;
  const fort = (texte: string) => <span className="font-semibold text-text">{texte}</span>;

  return (
    <p className="text-sm leading-relaxed text-muted">
      Taux d&apos;épargne : {fort(`${taux} %`)} (possible : {fort(`${tauxPossible} %`)}). En moyenne par mois :{" "}
      {fort(eurosRonds.format(revenus))} de revenus, {fort(eurosRonds.format(depenses))} de dépenses (compte commun
      compris) et {fort(eurosRonds.format(flux.epargne))} mis de côté —{" "}
      {reste >= 0 ? (
        <>il reste {fort(eurosRonds.format(reste))} disponible.</>
      ) : (
        <>il manque {fort(eurosRonds.format(-reste))}, pris sur le solde.</>
      )}
    </p>
  );
}

/** Diagramme « Où va l'argent » d'une personne (revenus → budget → postes → catégories), en moyenne mensuelle. */
export function FluxArgent({ flux }: { flux: FluxPersonne }) {
  const [affichage, setAffichage] = useState<"diagramme" | "tableau">("diagramme");
  const vide =
    flux.revenus.length === 0 && flux.epargne === 0 && flux.commun === 0 && flux.charges.length === 0 && flux.quotidien.length === 0;
  if (vide) return <p className="py-6 text-center text-sm text-muted-2">Aucun revenu ni dépense sur cette période.</p>;

  return (
    <div className="flex flex-col gap-3">
      <Resume flux={flux} />
      <div className={segmentedWrapClass + " self-start"}>
        <button type="button" onClick={() => setAffichage("diagramme")} className={segmentedItemClass(affichage === "diagramme")}>
          Diagramme
        </button>
        <button type="button" onClick={() => setAffichage("tableau")} className={segmentedItemClass(affichage === "tableau")}>
          Tableau
        </button>
      </div>
      {affichage === "diagramme" ? <Diagramme flux={flux} /> : <Tableau flux={flux} />}
    </div>
  );
}
