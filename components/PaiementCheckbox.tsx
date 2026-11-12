"use client";

import { useTransition } from "react";
import { togglePaiement } from "@/app/actions/mois";
import type { TypeElementPaiement } from "@/app/generated/prisma/client";
import { checkboxClass } from "@/lib/ui";

export function PaiementCheckbox({
  annee,
  mois,
  type,
  refId,
  defaultChecked,
}: {
  annee: number;
  /** Format stocké en base : 1-12 (janvier = 1). */
  mois: number;
  type: TypeElementPaiement;
  refId: number;
  defaultChecked: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  // Indicative uniquement pour les charges annuelles et achats prévus (ne
  // touche jamais le solde, contrairement à la charge mensuelle) — d'où un
  // libellé différent pour éviter de laisser croire qu'elle règle quoi que
  // ce soit.
  const label = type === "CHARGE_MENSUELLE" ? "Payé" : "Provisionné";

  return (
    <input
      type="checkbox"
      className={checkboxClass}
      defaultChecked={defaultChecked}
      disabled={isPending}
      onChange={(e) => {
        const checked = e.target.checked;
        startTransition(() => {
          togglePaiement(annee, mois, type, refId, checked);
        });
      }}
      aria-label={label}
    />
  );
}
