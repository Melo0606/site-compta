"use client";

import { useState } from "react";
import { formatEuros } from "@/lib/format";
import type { StatsCategoriePeriode } from "@/lib/stats";
import {
  segmentedWrapClass,
  segmentedItemClass,
  tableWrapClass,
  theadRowClass,
  thClass,
  tdClass,
  tdMutedClass,
  footRowClass,
  emptyRowClass,
} from "@/lib/ui";

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

/** Répartition par catégorie sous forme de barres + pourcentage, triée par montant décroissant (même style que « Où va le besoin mensuel » sur le tableau de bord). */
function Barres({ lignes }: { lignes: StatsCategoriePeriode[] }) {
  const total = lignes.reduce((sum, l) => sum + l.total, 0);
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-muted-2">Aucune dépense catégorisée sur cette période.</p>;
  }
  const triees = [...lignes].sort((a, b) => b.total - a.total);

  return (
    <div className="flex flex-col gap-4 py-4">
      {triees.map((ligne, i) => {
        const pct = Math.round((ligne.total / total) * 100);
        const couleur = COULEURS[i % COULEURS.length];
        return (
          <div key={ligne.categorieId ?? "sans-categorie"}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-text">{ligne.categorieNom}</span>
              <span className="text-muted">
                {formatEuros(ligne.total)} <span className="text-muted-2">· {pct}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <span
                className="block h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: couleur }}
              />
            </div>
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
            <path key={s.ligne.categorieId ?? "sans-categorie"} d={arcPath(cx, cy, r, s.departDeg, s.finDeg)} fill={s.couleur}>
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

function Tableau({ lignes, colonnes }: { lignes: StatsCategoriePeriode[]; colonnes: string[] }) {
  const totauxParPeriode = new Array(colonnes.length).fill(0);
  for (const ligne of lignes) {
    ligne.parPeriode.forEach((montant, i) => (totauxParPeriode[i] += montant));
  }
  const totalGeneral = totauxParPeriode.reduce((a, b) => a + b, 0);

  const sticky1 = "sticky left-0 z-10 border-r border-border";
  const stickyN = "sticky right-0 z-10 border-l border-border";

  return (
    <div className={`mt-1 ${tableWrapClass}`}>
      <table className="w-full min-w-[980px] text-sm">
        <thead className={theadRowClass}>
          <tr>
            <th className={`${sticky1} ${thClass} bg-surface-muted`}>Catégorie</th>
            {colonnes.map((c) => (
              <th key={c} className={`${thClass} text-right`}>
                {c}
              </th>
            ))}
            <th className={`${stickyN} ${thClass} bg-surface-muted text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => (
            <tr key={ligne.categorieId ?? "sans-categorie"} className="border-t border-border">
              <td className={`${sticky1} bg-surface ${tdClass}`}>{ligne.categorieNom}</td>
              {ligne.parPeriode.map((montant, i) => (
                <td key={i} className={`${tdMutedClass} text-right`}>
                  {montant > 0 ? formatEuros(montant) : "—"}
                </td>
              ))}
              <td className={`${stickyN} bg-surface ${tdClass} text-right font-medium`}>
                {formatEuros(ligne.total)}
              </td>
            </tr>
          ))}
          {lignes.length === 0 && (
            <tr>
              <td colSpan={colonnes.length + 2} className={emptyRowClass}>
                Aucune dépense catégorisée sur cette période.
              </td>
            </tr>
          )}
        </tbody>
        {lignes.length > 0 && (
          <tfoot>
            <tr className={footRowClass}>
              <td className={`${sticky1} bg-surface-muted px-4 py-2.5`}>Total</td>
              {totauxParPeriode.map((montant, i) => (
                <td key={i} className="px-4 py-2.5 text-right">
                  {montant > 0 ? formatEuros(montant) : "—"}
                </td>
              ))}
              <td className={`${stickyN} bg-surface-muted px-4 py-2.5 text-right`}>{formatEuros(totalGeneral)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function StatsView({ lignes, colonnes }: { lignes: StatsCategoriePeriode[]; colonnes: string[] }) {
  const [affichage, setAffichage] = useState<"barres" | "tableau" | "camembert">("barres");

  return (
    <div>
      <div className={segmentedWrapClass}>
        <button type="button" onClick={() => setAffichage("barres")} className={segmentedItemClass(affichage === "barres")}>
          Par catégorie
        </button>
        <button type="button" onClick={() => setAffichage("tableau")} className={segmentedItemClass(affichage === "tableau")}>
          Tableau
        </button>
        <button
          type="button"
          onClick={() => setAffichage("camembert")}
          className={segmentedItemClass(affichage === "camembert")}
        >
          Camembert
        </button>
      </div>
      {affichage === "barres" && <Barres lignes={lignes} />}
      {affichage === "tableau" && <Tableau lignes={lignes} colonnes={colonnes} />}
      {affichage === "camembert" && <Camembert lignes={lignes} />}
    </div>
  );
}
