"use client";

import { useState } from "react";
import { formatEuros } from "@/lib/format";
import { replierAutres, type StatsCategoriePeriode, type DetailLibelle } from "@/lib/stats";
import { segmentedWrapClass, segmentedItemClass } from "@/lib/ui";

// Palette catégorielle validée (skill dataviz, ordre fixe — voir references/palette.md).
const COULEURS = [
  "#2a78d6", // bleu
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // jaune
  "#e87ba4", // magenta
  "#008300", // vert
  "#4a3aa7", // violet
  "#e34948", // rouge
];

function polaireVersCartesien(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, departDeg: number, finDeg: number) {
  const depart = polaireVersCartesien(cx, cy, r, finDeg);
  const fin = polaireVersCartesien(cx, cy, r, departDeg);
  const grandArc = finDeg - departDeg > 180 ? 1 : 0;
  return `M ${cx},${cy} L ${depart.x},${depart.y} A ${r},${r} 0 ${grandArc} 0 ${fin.x},${fin.y} Z`;
}

const NB_LIBELLES_VISIBLES = 8;

/** Détail d'une catégorie : par sous-catégorie (sous-total), puis par libellé (total et nombre de dépenses). */
function DetailCategorie({ detail, categorieNom }: { detail: DetailLibelle[]; categorieNom: string }) {
  const [toutVoir, setToutVoir] = useState(false);
  const groupes = new Map<string | null, DetailLibelle[]>();
  for (const d of detail) {
    if (!groupes.has(d.sousCategorie)) groupes.set(d.sousCategorie, []);
    groupes.get(d.sousCategorie)!.push(d);
  }
  const avecSousCategories = groupes.size > 1 || !groupes.has(null);
  const ordonnes = Array.from(groupes, ([nom, lignes]) => ({
    nom,
    lignes,
    total: lignes.reduce((s, l) => s + l.total, 0),
  })).sort((a, b) => b.total - a.total);
  const tropLong = ordonnes.some((g) => g.lignes.length > NB_LIBELLES_VISIBLES);

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm">
      {ordonnes.map((g) => (
        <div key={g.nom ?? "__direct"}>
          {avecSousCategories && (
            <div className="flex justify-between gap-2 font-medium text-text">
              <span>{g.nom ?? `${categorieNom} (sans sous-catégorie)`}</span>
              <span>{formatEuros(g.total)}</span>
            </div>
          )}
          <ul className={avecSousCategories ? "mt-1 flex flex-col gap-0.5 pl-4" : "flex flex-col gap-0.5"}>
            {(toutVoir ? g.lignes : g.lignes.slice(0, NB_LIBELLES_VISIBLES)).map((l) => (
              <li key={l.libelle} className="flex justify-between gap-2">
                <span className="text-muted">
                  {l.libelle}
                  {l.nb > 1 && <span className="ml-1.5 text-muted-2">×{l.nb}</span>}
                </span>
                <span className="text-text">{formatEuros(l.total)}</span>
              </li>
            ))}
            {!toutVoir && g.lignes.length > NB_LIBELLES_VISIBLES && (
              <li className="text-muted-2">… et {g.lignes.length - NB_LIBELLES_VISIBLES} autre(s)</li>
            )}
          </ul>
        </div>
      ))}
      {tropLong && (
        <button
          type="button"
          onClick={() => setToutVoir((v) => !v)}
          className="self-start text-xs font-medium text-accent hover:underline"
        >
          {toutVoir ? "Réduire" : "Tout voir"}
        </button>
      )}
    </div>
  );
}

/** Répartition par catégorie sous forme de barres + pourcentage, triée par montant décroissant (même style que « Où va le besoin mensuel » sur le tableau de bord). Un clic sur une catégorie déplie son détail. */
function Barres({ lignes }: { lignes: StatsCategoriePeriode[] }) {
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const total = lignes.reduce((sum, l) => sum + l.total, 0);
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-muted-2">Aucune dépense catégorisée sur cette période.</p>;
  }
  const triees = [...lignes].sort((a, b) => b.total - a.total);
  const basculer = (cle: string) =>
    setOuvertes((avant) => {
      const apres = new Set(avant);
      if (apres.has(cle)) apres.delete(cle);
      else apres.add(cle);
      return apres;
    });

  return (
    <div className="flex flex-col gap-2 py-4">
      {triees.map((ligne, i) => {
        const pct = Math.round((ligne.total / total) * 100);
        const couleur = COULEURS[i % COULEURS.length];
        const cle = String(ligne.categorieId ?? `sans-${ligne.categorieNom}`);
        const ouverte = ouvertes.has(cle);
        return (
          <div key={cle} className="rounded-lg">
            <button
              type="button"
              onClick={() => basculer(cle)}
              aria-expanded={ouverte}
              className="block w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted"
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-text">
                  <span
                    className="inline-block text-xs text-muted-2"
                    style={{ transform: ouverte ? "rotate(90deg)" : undefined }}
                  >
                    ▶
                  </span>
                  {ligne.categorieNom}
                </span>
                <span className="text-muted">
                  {formatEuros(ligne.total)} <span className="text-muted-2">· {pct}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max(0, pct)}%`, backgroundColor: couleur }}
                />
              </div>
            </button>
            {ouverte && (
              <div className="px-2 pb-2">
                <DetailCategorie detail={ligne.detail} categorieNom={ligne.categorieNom} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Camembert({ lignes }: { lignes: StatsCategoriePeriode[] }) {
  const total = lignes.reduce((sum, l) => sum + l.total, 0);
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-muted-2">Aucune dépense catégorisée sur cette période.</p>;
  }

  const cx = 100;
  const cy = 100;
  const r = 90;
  const segments = lignes.reduce<
    { ligne: StatsCategoriePeriode; couleur: string; departDeg: number; finDeg: number; part: number }[]
  >((acc, ligne, i) => {
    const departDeg = acc[i - 1]?.finDeg ?? 0;
    const part = ligne.total / total;
    acc.push({ ligne, couleur: COULEURS[i % COULEURS.length], departDeg, finDeg: departDeg + part * 360, part });
    return acc;
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 py-4 sm:flex-row sm:items-start sm:justify-center">
      <svg viewBox="0 0 200 200" className="h-64 w-64 shrink-0">
        {segments.length === 1 ? (
          <circle cx={cx} cy={cy} r={r} fill={segments[0].couleur}>
            <title>
              {segments[0].ligne.categorieNom} : {formatEuros(segments[0].ligne.total)} (100 %)
            </title>
          </circle>
        ) : (
          segments.map((s) => (
            <path
              key={s.ligne.categorieId ?? "sans-categorie"}
              d={arcPath(cx, cy, r, s.departDeg, s.finDeg)}
              fill={s.couleur}
            >
              <title>
                {s.ligne.categorieNom} : {formatEuros(s.ligne.total)} ({(s.part * 100).toFixed(0)} %)
              </title>
            </path>
          ))
        )}
      </svg>
      <ul className="flex flex-col gap-2 text-sm">
        {segments.map((s) => (
          <li key={s.ligne.categorieId ?? "sans-categorie"} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: s.couleur }} />
            <span className="text-text">{s.ligne.categorieNom}</span>
            <span className="text-muted">{formatEuros(s.ligne.total)}</span>
            <span className="text-muted-2">({(s.part * 100).toFixed(0)} %)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Dépenses par catégorie : barres cliquables (détail par sous-catégorie et libellé) ou camembert. */
export function VueCategories({ lignes }: { lignes: StatsCategoriePeriode[] }) {
  const [affichage, setAffichage] = useState<"barres" | "camembert">("barres");

  return (
    <div className="pt-1">
      <div className={segmentedWrapClass}>
        <button
          type="button"
          onClick={() => setAffichage("barres")}
          className={segmentedItemClass(affichage === "barres")}
        >
          Barres
        </button>
        <button
          type="button"
          onClick={() => setAffichage("camembert")}
          className={segmentedItemClass(affichage === "camembert")}
        >
          Camembert
        </button>
      </div>
      {affichage === "barres" ? <Barres lignes={lignes} /> : <Camembert lignes={replierAutres(lignes)} />}
    </div>
  );
}
