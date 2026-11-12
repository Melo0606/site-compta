import { selectClass, labelClass, helpTextClass } from "@/lib/ui";
import { MOIS_OPTIONS } from "@/lib/mois";

/** Plage de mois de l'année où une charge mensuelle tombe (ex : taxe foncière mensualisée de janvier à octobre). */
export function MoisActifsFields({
  defaultDebut = null,
  defaultFin = null,
}: {
  defaultDebut?: number | null;
  defaultFin?: number | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className={labelClass}>Mois concernés chaque année (optionnel)</span>
      <div className="flex items-center gap-2">
        <select
          className={selectClass}
          name="moisDebutAnnee"
          defaultValue={defaultDebut ?? ""}
          aria-label="Premier mois concerné"
        >
          <option value="">Tous les mois</option>
          {MOIS_OPTIONS.map((mois) => (
            <option key={mois.value} value={mois.value}>
              {mois.label}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted">à</span>
        <select
          className={selectClass}
          name="moisFinAnnee"
          defaultValue={defaultFin ?? ""}
          aria-label="Dernier mois concerné"
        >
          <option value="">Tous les mois</option>
          {MOIS_OPTIONS.map((mois) => (
            <option key={mois.value} value={mois.value}>
              {mois.label}
            </option>
          ))}
        </select>
      </div>
      <p className={helpTextClass}>
        Laisser sur « Tous les mois » pour une charge qui tombe chaque mois. Sinon, elle ne compte
        que de ce mois à ce mois inclus, chaque année (ex : taxe foncière mensualisée de janvier à
        octobre).
      </p>
    </div>
  );
}

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Libellé court d'une plage de mois actifs (ex : « janv. → oct. »), ou `null` si la charge tombe tous les mois. */
export function libelleMoisActifs(debut: number | null, fin: number | null): string | null {
  if (debut === null || fin === null) return null;
  return `${MOIS_COURTS[debut - 1]} → ${MOIS_COURTS[fin - 1]}`;
}
