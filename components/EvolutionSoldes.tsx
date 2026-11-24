"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatEuros } from "@/lib/format";
import type { PointSoldes } from "@/lib/stats";
import {
  segmentedWrapClass,
  segmentedItemClass,
  tableWrapClass,
  theadRowClass,
  thClass,
  tdClass,
  tdMutedClass,
} from "@/lib/ui";

type CleSerie = "soldePerso" | "soldeEpargne";

// Ordre fixe de la palette : la couleur suit le compte, jamais son rang.
const SERIES: { cle: CleSerie; nom: string; couleur: string }[] = [
  { cle: "soldePerso", nom: "Compte perso", couleur: "var(--viz-1)" },
  { cle: "soldeEpargne", nom: "Épargne", couleur: "var(--viz-2)" },
];

const HAUTEUR = 280;
const MARGE = { haut: 16, droite: 128, bas: 32, gauche: 72 };

/** Graduations « rondes » couvrant [min, max]. */
function graduations(min: number, max: number, cible = 5): number[] {
  if (min === max) {
    const ecart = Math.abs(min) || 100;
    min -= ecart / 2;
    max += ecart / 2;
  }
  const brut = (max - min) / cible;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * puissance).find((p) => p >= brut) ?? 10 * puissance;
  const debut = Math.floor(min / pas) * pas;
  const fin = Math.ceil(max / pas) * pas;
  const ticks: number[] = [];
  for (let v = debut; v <= fin + pas / 2; v += pas) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const eurosAxe = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const eurosAxeCompact = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** Libellés d'axe : en entier sous 10 000, en k€ au-delà (un seul style par axe). */
function formatAxe(v: number, compact: boolean): string {
  return compact ? `${eurosAxeCompact.format(v / 1000)} k€` : `${eurosAxe.format(v)} €`;
}

function Courbes({ points }: { points: PointSoldes[] }) {
  const conteneurRef = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(720);
  const [survol, setSurvol] = useState<number | null>(null);

  useEffect(() => {
    const el = conteneurRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entree]) => setLargeur(Math.max(320, entree.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const valeurs = points.flatMap((p) => SERIES.map((s) => p[s.cle])).filter((v): v is number => v !== null);
  const ticks = graduations(Math.min(0, ...valeurs), Math.max(0, ...valeurs));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const compact = Math.max(Math.abs(yMin), Math.abs(yMax)) >= 10000;

  const largeurTrace = largeur - MARGE.gauche - MARGE.droite;
  const hauteurTrace = HAUTEUR - MARGE.haut - MARGE.bas;
  const n = points.length;
  const x = (i: number) => MARGE.gauche + (n === 1 ? largeurTrace / 2 : (i / (n - 1)) * largeurTrace);
  const y = (v: number) => MARGE.haut + ((yMax - v) / (yMax - yMin)) * hauteurTrace;

  // Un libellé de mois sur `pasLabels`, pour qu'ils ne se chevauchent pas.
  const pasLabels = Math.max(1, Math.ceil((n * 52) / largeurTrace));

  const indexDepuisPointeur = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n === 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    return Math.min(n - 1, Math.max(0, i));
  };

  const auClavier = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowRight") setSurvol((i) => Math.min(n - 1, (i ?? -1) + 1));
    else if (e.key === "ArrowLeft") setSurvol((i) => Math.max(0, (i ?? n) - 1));
    else if (e.key === "Escape") setSurvol(null);
    else return;
    e.preventDefault();
  };

  // Dernier point connu de chaque série, pour l'étiquette directe en bout de courbe.
  const derniers = SERIES.map((s) => {
    for (let i = n - 1; i >= 0; i--) {
      const v = points[i][s.cle];
      if (v !== null) return { serie: s, i, v };
    }
    return null;
  }).filter((d) => d !== null);
  // Écarte les deux étiquettes si elles se chevauchent (le trait de rappel garde le lien avec la courbe).
  const yEtiquettes = derniers.map((d) => y(d.v));
  if (yEtiquettes.length === 2 && Math.abs(yEtiquettes[0] - yEtiquettes[1]) < 30) {
    const milieu = (yEtiquettes[0] + yEtiquettes[1]) / 2;
    const haut = yEtiquettes[0] <= yEtiquettes[1] ? 0 : 1;
    yEtiquettes[haut] = milieu - 15;
    yEtiquettes[1 - haut] = milieu + 15;
  }

  const pointSurvole = survol !== null ? points[survol] : null;
  const tooltipAGauche = survol !== null && x(survol) > largeur - 220;

  return (
    <div ref={conteneurRef} className="relative py-4">
      <svg
        width={largeur}
        height={HAUTEUR}
        className="block max-w-full outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
        tabIndex={0}
        role="img"
        aria-label="Évolution des soldes perso et épargne en fin de mois (flèches gauche/droite pour parcourir les mois)"
        onKeyDown={auClavier}
        onBlur={() => setSurvol(null)}
      >
        {/* Grille horizontale + axe Y */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={MARGE.gauche}
              x2={MARGE.gauche + largeurTrace}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 && yMin < 0 ? "var(--muted-2)" : "var(--border)"}
              strokeWidth={1}
            />
            <text x={MARGE.gauche - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)">
              {formatAxe(t, compact)}
            </text>
          </g>
        ))}

        {/* Mois (axe X) */}
        {points.map((p, i) =>
          i % pasLabels === 0 || i === n - 1 ? (
            <text
              key={i}
              x={x(i)}
              y={HAUTEUR - MARGE.bas + 18}
              textAnchor="middle"
              fontSize={11}
              fill={survol === i ? "var(--text)" : "var(--muted)"}
            >
              {p.label}
            </text>
          ) : null
        )}

        {/* Repère vertical du mois survolé */}
        {survol !== null && (
          <line
            x1={x(survol)}
            x2={x(survol)}
            y1={MARGE.haut}
            y2={MARGE.haut + hauteurTrace}
            stroke="var(--muted-2)"
            strokeWidth={1}
          />
        )}

        {/* Courbes : un segment par paire de mois connus, en pointillés vers un mois projeté */}
        {SERIES.map((s) => (
          <g key={s.cle}>
            {points.slice(1).map((p, k) => {
              const precedent = points[k][s.cle];
              const courant = p[s.cle];
              if (precedent === null || courant === null) return null;
              return (
                <line
                  key={k}
                  x1={x(k)}
                  y1={y(precedent)}
                  x2={x(k + 1)}
                  y2={y(courant)}
                  stroke={s.couleur}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray={p.projete ? "5 5" : undefined}
                />
              );
            })}
            {/* Point isolé (voisins inconnus) : sans pastille, il serait invisible */}
            {points.map((p, i) => {
              const v = p[s.cle];
              const isole = v !== null && (points[i - 1]?.[s.cle] ?? null) === null && (points[i + 1]?.[s.cle] ?? null) === null;
              return isole ? (
                <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={s.couleur} stroke="var(--surface)" strokeWidth={2} />
              ) : null;
            })}
          </g>
        ))}

        {/* Pastilles du mois survolé */}
        {pointSurvole &&
          SERIES.map((s) => {
            const v = pointSurvole[s.cle];
            return v === null ? null : (
              <circle key={s.cle} cx={x(survol!)} cy={y(v)} r={5} fill={s.couleur} stroke="var(--surface)" strokeWidth={2} />
            );
          })}

        {/* Étiquettes directes en bout de courbe : nom + dernier solde connu */}
        {derniers.map((d, k) => {
          const xFin = x(d.i);
          const yLigne = y(d.v);
          const yTexte = yEtiquettes[k];
          return (
            <g key={d.serie.cle}>
              {Math.abs(yTexte - yLigne) > 1 && (
                <line x1={xFin + 4} y1={yLigne} x2={xFin + 10} y2={yTexte} stroke="var(--muted-2)" strokeWidth={1} />
              )}
              <text x={xFin + 12} y={yTexte} fontSize={11} fill="var(--muted)" dy="-0.25em">
                {d.serie.nom}
              </text>
              <text x={xFin + 12} y={yTexte} fontSize={12} fontWeight={600} fill="var(--text)" dy="1em">
                {formatEuros(d.v)}
              </text>
            </g>
          );
        })}

        {/* Zone de survol : toute la hauteur, le repère cherche le mois le plus proche */}
        <rect
          x={MARGE.gauche - (n === 1 ? largeurTrace / 2 : largeurTrace / (n - 1) / 2)}
          y={MARGE.haut}
          width={largeurTrace + (n === 1 ? largeurTrace : largeurTrace / (n - 1))}
          height={hauteurTrace}
          fill="transparent"
          onPointerMove={(e) => setSurvol(indexDepuisPointeur(e))}
          onPointerLeave={() => setSurvol(null)}
        />
      </svg>

      {pointSurvole && survol !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-44 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-[var(--shadow-pop)]"
          style={{
            top: 16 + MARGE.haut,
            left: tooltipAGauche ? x(survol) - 12 : x(survol) + 12,
            transform: tooltipAGauche ? "translateX(-100%)" : undefined,
          }}
        >
          <div className="font-medium text-text">
            {pointSurvole.label}
            {pointSurvole.projete && <span className="ml-1 font-normal text-muted">· projection</span>}
          </div>
          {SERIES.map((s) => {
            const v = pointSurvole[s.cle];
            return (
              <div key={s.cle} className="mt-1 flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-muted">
                  <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: s.couleur }} />
                  {s.nom}
                </span>
                <span className="font-medium text-text">{v === null ? "—" : formatEuros(v)}</span>
              </div>
            );
          })}
          {pointSurvole.soldePerso === null && pointSurvole.soldeEpargne === null && (
            <div className="mt-1 text-xs text-muted-2">Solde non archivé pour ce mois</div>
          )}
        </div>
      )}
    </div>
  );
}

function Legende() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
      {SERIES.map((s) => (
        <span key={s.cle} className="flex items-center gap-2">
          <svg width="18" height="4" aria-hidden>
            <line x1="1" y1="2" x2="17" y2="2" stroke={s.couleur} strokeWidth={2} strokeLinecap="round" />
          </svg>
          {s.nom}
        </span>
      ))}
      <span className="flex items-center gap-2">
        <svg width="18" height="4" aria-hidden>
          <line x1="1" y1="2" x2="17" y2="2" stroke="var(--muted)" strokeWidth={2} strokeDasharray="4 3" />
        </svg>
        Projection
      </span>
    </div>
  );
}

function Tableau({ points }: { points: PointSoldes[] }) {
  return (
    <div className={`${tableWrapClass} my-4`}>
      <table className="w-full text-sm">
        <thead>
          <tr className={theadRowClass}>
            <th className={thClass}>Mois</th>
            {SERIES.map((s) => (
              <th key={s.cle} className={`${thClass} text-right`}>
                {s.nom}
              </th>
            ))}
            <th className={thClass} />
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td className={tdClass}>{p.label}</td>
              {SERIES.map((s) => {
                const v = p[s.cle];
                return (
                  <td key={s.cle} className={`${v === null ? tdMutedClass : tdClass} text-right`}>
                    {v === null ? "—" : formatEuros(v)}
                  </td>
                );
              })}
              <td className={tdMutedClass}>{p.projete ? "projection" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Évolution des soldes perso et épargne d'une personne, en fin de mois (réel archivé, puis projection). */
export function EvolutionSoldes({ points }: { points: PointSoldes[] }) {
  const [affichage, setAffichage] = useState<"courbes" | "tableau">("courbes");
  const aucunSolde = points.every((p) => p.soldePerso === null && p.soldeEpargne === null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={segmentedWrapClass}>
          <button type="button" onClick={() => setAffichage("courbes")} className={segmentedItemClass(affichage === "courbes")}>
            Courbes
          </button>
          <button type="button" onClick={() => setAffichage("tableau")} className={segmentedItemClass(affichage === "tableau")}>
            Tableau
          </button>
        </div>
        {affichage === "courbes" && !aucunSolde && <Legende />}
      </div>
      {aucunSolde ? (
        <p className="py-6 text-center text-sm text-muted-2">Aucun solde connu sur cette période.</p>
      ) : affichage === "courbes" ? (
        <Courbes points={points} />
      ) : (
        <Tableau points={points} />
      )}
    </div>
  );
}
