'use client';
import { useState } from 'react';
import { useApi } from '../lib/hooks';
import { instant, jours } from '../lib/format';
import { MOUVEMENTS } from '../lib/libelles';
import type { Dotation } from '../lib/types';
import { Alerte, Carte, Chargement, classeSaisie, Tableau } from './ui';

/** Droits, jours décomptés, ajustements, solde, demandes en attente et mouvements. */
export function CarteSolde({ chemin, anneeInitiale, avecMouvements = true, titre = 'Mes droits à congé', actions }: {
  chemin: (annee: number) => string; anneeInitiale: number; avecMouvements?: boolean; titre?: string;
  actions?: (d: Dotation, annee: number, recharger: () => void) => React.ReactNode;
}) {
  const [annee, setAnnee] = useState(anneeInitiale);
  const { donnees: d, erreur, chargement, recharger } = useApi<Dotation>(chemin(annee));
  const annees = [anneeInitiale - 1, anneeInitiale, anneeInitiale + 1];

  return (
    <Carte
      titre={titre}
      action={
        <select aria-label="Année" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className={`${classeSaisie} w-auto`}>
          {annees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      }
    >
      {erreur && <Alerte>{erreur}</Alerte>}
      {chargement && !d && <Chargement />}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['Droits attribués', jours(d.joursAttribues)],
              ['Ajustements', `${d.ajustements > 0 ? '+' : ''}${jours(d.ajustements)}`],
              ['Jours décomptés', jours(d.joursDebites)],
              ['En attente', jours(d.enAttente)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-gris-50 p-3">
                <p className="text-xs font-semibold text-gris-500">{l}</p>
                <p className="mt-1 text-xl font-bold">{v}</p>
              </div>
            ))}
            <div className="col-span-2 rounded-lg bg-ynov-noir p-3 text-white sm:col-span-1">
              <p className="text-xs font-semibold text-white/70">Solde disponible</p>
              <p className="mt-1 text-2xl font-bold text-ynov-turquoise">{jours(d.solde)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-gris-500">
            Solde = droits attribués ± ajustements − jours payés des congés approuvés. Les demandes en attente ne sont pas encore décomptées.
          </p>
          {actions && <div className="mt-4">{actions(d, annee, recharger)}</div>}
          {avecMouvements && d.mouvements.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-ynov-turquoise-fonce">Historique des mouvements ({d.mouvements.length})</summary>
              <div className="mt-3">
                <Tableau entetes={['Date', 'Mouvement', 'Jours', 'Motif', 'Auteur']}>
                  {d.mouvements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{instant(m.date)}</td>
                      <td className="px-3 py-2">{MOUVEMENTS[m.type] ?? m.type}</td>
                      <td className="px-3 py-2 font-semibold">{m.jours > 0 && m.type !== 'DOTATION_INITIALE' ? '+' : ''}{jours(m.jours)}</td>
                      <td className="px-3 py-2">{m.motif}</td>
                      <td className="px-3 py-2">{m.auteurNom}</td>
                    </tr>
                  ))}
                </Tableau>
              </div>
            </details>
          )}
        </>
      )}
    </Carte>
  );
}
