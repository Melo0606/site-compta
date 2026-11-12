"use client";

import { useState } from "react";
import { updateCategorie, deleteCategorie } from "@/app/actions/categories";
import {
  inputClass,
  buttonSecondarySmallClass,
  buttonDangerSmallClass,
  tdClass,
  rowClass,
  pillClass,
} from "@/lib/ui";

/** Ligne « Catégorie » : nom figé par défaut, éditable via le bouton « Modifier ». */
export function CategorieRow({ categorie }: { categorie: { id: number; nom: string } }) {
  const [enEdition, setEnEdition] = useState(false);
  const protegee = categorie.nom === "Quotidien";

  if (!enEdition) {
    return (
      <tr className={rowClass}>
        <td className={tdClass}>
          {categorie.nom}
          {protegee && (
            <span
              className={`ml-2 ${pillClass("neutral")}`}
              title="Utilisée par le budget des dépenses du quotidien — ne peut pas être supprimée."
            >
              protégée
            </span>
          )}
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
              <form action={deleteCategorie}>
                <input type="hidden" name="id" value={categorie.id} />
                <button type="submit" className={buttonDangerSmallClass}>
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
        <form
          id={`modifier-categorie-${categorie.id}`}
          action={async (formData) => {
            await updateCategorie(formData);
            setEnEdition(false);
          }}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="id" value={categorie.id} />
          <input
            className={`${inputClass} w-48`}
            type="text"
            name="nom"
            defaultValue={categorie.nom}
            autoFocus
            required
          />
        </form>
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex justify-end gap-2">
          <button
            key="enregistrer"
            type="submit"
            form={`modifier-categorie-${categorie.id}`}
            className={buttonSecondarySmallClass}
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
