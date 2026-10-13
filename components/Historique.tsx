'use client';
import { instant } from '../lib/format';
import type { EntreeHistorique } from '../lib/types';
import { Carte } from './ui';

/** Historique horodaté et non modifiable d'un dossier. */
export function Historique({ entrees }: { entrees: EntreeHistorique[] }) {
  return (
    <Carte titre="Historique">
      {entrees.length === 0 ? (
        <p className="text-sm text-gris-600">Aucune action enregistrée.</p>
      ) : (
        <ol className="relative space-y-5 border-l-2 border-gris-200 pl-5">
          {entrees.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-ynov-turquoise ring-2 ring-gris-200" aria-hidden />
              <p className="text-sm font-semibold text-ynov-noir">{h.resume}</p>
              {h.motif && <p className="mt-0.5 text-sm text-gris-700">Motif : {h.motif}</p>}
              <p className="mt-0.5 text-xs text-gris-500">
                {h.auteurNom} · {instant(h.date)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Carte>
  );
}
