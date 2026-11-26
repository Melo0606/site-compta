"use client";

import { useActionState, useState } from "react";
import { updateCategorie, deleteCategorie, type EtatCategorie } from "@/app/actions/categories";
import {
  inputClass,
  selectClass,
  buttonSecondarySmallClass,
  buttonDangerSmallClass,
  tdClass,
  rowClass,
  pillClass,
} from "@/lib/ui";

type Option = { id: number; nom: string };

const etatInitial: EtatCategorie = { erreur: null };

/** Ligne « Catégorie » (ou sous-catégorie, en retrait) : nom figé par défaut, éditable via « Modifier ». */
export function CategorieRow({
  categorie,
  parentsPossibles,
  nbSousCategories,
}: {
  categorie: { id: number; nom: string; parentId: number | null; type: "DEPENSE" | "REVENU" };
  /** Catégories de premier niveau pouvant accueillir celle-ci comme sous-catégorie (elle-même exclue). */
  parentsPossibles: Option[];
  nbSousCategories: number;
}) {
  const [enEdition, setEnEdition] = useState(false);
  // Sortie du mode édition dès que l'enregistrement a réussi.
  const [etatModif, modifier, modifEnCours] = useActionState(async (avant: EtatCategorie, formData: FormData) => {
    const etat = await updateCategorie(avant, formData);
    if (etat.ok) setEnEdition(false);
    return etat;
  }, etatInitial);
  const [etatSuppr, supprimer, supprEnCours] = useActionState(deleteCategorie, etatInitial);
  const protegee = categorie.nom === "Quotidien" && categorie.parentId === null;
  const sousCategorie = categorie.parentId !== null;

  const erreur = etatModif.erreur ?? etatSuppr.erreur;

  if (!enEdition) {
    return (
      <tr className={rowClass}>
        <td className={tdClass}>
          <span className={sousCategorie ? "pl-6 text-muted" : "font-medium"}>
            {sousCategorie && <span className="mr-1.5 text-muted-2">↳</span>}
            <span className="text-text">{categorie.nom}</span>
          </span>
          {protegee && (
            <span
              className={`ml-2 ${pillClass("neutral")}`}
              title="Utilisée par le budget des dépenses du quotidien — ne peut pas être supprimée."
            >
              protégée
            </span>
          )}
          {erreur && <p className="mt-1 text-xs text-neg">{erreur}</p>}
        </td>
        <td className="px-4 py-2.5 text-right">
          <div className="flex justify-end gap-2">
            <button
              key="modifier"
              type="button"
              onClick={() => setEnEdition(true)}
              className={buttonSecondarySmallClass}
            >
              Modifier
            </button>
            {!protegee && (
              <form action={supprimer}>
                <input type="hidden" name="id" value={categorie.id} />
                <button
                  type="submit"
                  className={buttonDangerSmallClass}
                  disabled={supprEnCours}
                  title={
                    nbSousCategories > 0
                      ? `Supprime aussi ses ${nbSousCategories} sous-catégorie(s) ; les éléments classés dedans passent « Sans catégorie ».`
                      : "Les éléments classés dans cette catégorie passent « Sans catégorie »."
                  }
                >
                  Supprimer
                </button>
              </form>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={rowClass}>
      <td className={tdClass}>
        <form id={`modifier-categorie-${categorie.id}`} action={modifier} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={categorie.id} />
          <input
            className={`${inputClass} w-48`}
            type="text"
            name="nom"
            defaultValue={categorie.nom}
            autoFocus
            required
            readOnly={protegee}
          />
          {!protegee && categorie.parentId === null && (
            <select
              className={`${selectClass} w-auto`}
              name="type"
              defaultValue={categorie.type}
              aria-label="Type de catégorie"
            >
              <option value="DEPENSE">Dépenses</option>
              <option value="REVENU">Revenus</option>
            </select>
          )}
          {categorie.parentId !== null && <input type="hidden" name="type" value={categorie.type} />}
          {protegee && <input type="hidden" name="type" value="DEPENSE" />}
          {!protegee && nbSousCategories === 0 && (
            <select
              className={`${selectClass} w-auto`}
              name="parentId"
              defaultValue={categorie.parentId ?? ""}
              aria-label="Catégorie parente"
            >
              <option value="">Catégorie principale</option>
              {parentsPossibles.map((p) => (
                <option key={p.id} value={p.id}>
                  Sous-catégorie de {p.nom}
                </option>
              ))}
            </select>
          )}
        </form>
        {etatModif.erreur && <p className="mt-1 text-xs text-neg">{etatModif.erreur}</p>}
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex justify-end gap-2">
          <button
            key="enregistrer"
            type="submit"
            form={`modifier-categorie-${categorie.id}`}
            className={buttonSecondarySmallClass}
            disabled={modifEnCours}
          >
            Enregistrer
          </button>
          <button key="annuler" type="button" onClick={() => setEnEdition(false)} className={buttonSecondarySmallClass}>
            Annuler
          </button>
        </div>
      </td>
    </tr>
  );
}
