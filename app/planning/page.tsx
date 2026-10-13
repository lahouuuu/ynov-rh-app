'use client';
/**
 * Planning mensuel des congés approuvés. N'affiche que les informations utiles
 * à l'organisation (qui est absent et quand), sans type ni motif.
 */
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { aLeRole } from '../../lib/roles';
import { aujourdhui } from '../../lib/format';
import { Alerte, Bouton, Carte, Chargement, cx, EnTetePage, Onglets, Vide } from '../../components/ui';

interface Entree { id: string; userId: string; userNom: string; dateDebut: string; dateFin: string; demiJourneeDebut: boolean; demiJourneeFin: boolean }

const pad = (n: number) => String(n).padStart(2, '0');

function Contenu() {
  const { profil } = useSession();
  const vueParam = useSearchParams().get('vue');
  const vues = [
    { valeur: 'moi' as const, libelle: 'Moi' },
    ...(aLeRole(profil, 'responsable') ? [{ valeur: 'equipe' as const, libelle: 'Mon équipe' }] : []),
    ...(aLeRole(profil, 'rh') ? [{ valeur: 'rh' as const, libelle: 'Périmètre RH' }] : []),
    ...(aLeRole(profil, 'direction') ? [{ valeur: 'direction' as const, libelle: 'Direction régionale' }] : []),
  ];
  const [vue, setVue] = useState<'moi' | 'equipe' | 'rh' | 'direction'>(vues.some((v) => v.valeur === vueParam) ? (vueParam as 'rh') : vues[vues.length - 1].valeur);
  const [mois, setMois] = useState(aujourdhui().slice(0, 7));
  const [a, m] = mois.split('-').map(Number);
  const nbJours = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const du = `${mois}-01`;
  const au = `${mois}-${pad(nbJours)}`;
  const { donnees, erreur, chargement } = useApi<{ elements: Entree[] }>(`/planning?vue=${vue}&du=${du}&au=${au}`);

  const lignes = (() => {
    const parPersonne = new Map<string, { nom: string; jours: Map<number, 'plein' | 'demi'> }>();
    for (const e of donnees?.elements ?? []) {
      const p = parPersonne.get(e.userId) ?? { nom: e.userNom, jours: new Map() };
      for (let j = 1; j <= nbJours; j++) {
        const d = `${mois}-${pad(j)}`;
        if (d < e.dateDebut || d > e.dateFin) continue;
        const demi = (d === e.dateDebut && e.demiJourneeDebut) || (d === e.dateFin && e.demiJourneeFin);
        p.jours.set(j, demi ? 'demi' : 'plein');
      }
      parPersonne.set(e.userId, p);
    }
    return [...parPersonne.entries()].sort((x, y) => x[1].nom.localeCompare(y[1].nom));
  })();

  const changerMois = (delta: number) => {
    const d = new Date(Date.UTC(a, m - 1 + delta, 1));
    setMois(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };
  const titreMois = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, 1)));
  const jourSemaine = (j: number) => new Date(Date.UTC(a, m - 1, j)).getUTCDay();
  const today = aujourdhui();

  return (
    <>
      <EnTetePage titre="Planning des congés" sousTitre="Congés approuvés uniquement. Aucun motif ni information médicale n’est affiché." />
      {vues.length > 1 && <Onglets valeur={vue} onChange={setVue} options={vues} />}
      <Carte
        titre={<span className="capitalize">{titreMois}</span>}
        action={
          <div className="flex gap-2">
            <Bouton variante="secondaire" className="px-3" onClick={() => changerMois(-1)} aria-label="Mois précédent">←</Bouton>
            <Bouton variante="secondaire" className="px-3" onClick={() => setMois(aujourdhui().slice(0, 7))}>Aujourd’hui</Bouton>
            <Bouton variante="secondaire" className="px-3" onClick={() => changerMois(1)} aria-label="Mois suivant">→</Bouton>
          </div>
        }
      >
        {erreur && <Alerte>{erreur}</Alerte>}
        {chargement && !donnees ? <Chargement /> : !lignes.length ? <Vide titre="Aucun congé approuvé ce mois-ci" /> : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-36 bg-white px-2 py-2 text-left font-semibold text-gris-500">Collaborateur</th>
                  {Array.from({ length: nbJours }, (_, i) => i + 1).map((j) => (
                    <th key={j} className={cx('min-w-7 px-0.5 py-2 text-center font-semibold', [0, 6].includes(jourSemaine(j)) ? 'text-gris-300' : 'text-gris-500', `${mois}-${pad(j)}` === today && 'text-ynov-turquoise')}>
                      {j}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map(([uid, p]) => (
                  <tr key={uid} className="border-t border-gris-100">
                    <td className="sticky left-0 z-10 bg-white px-2 py-2 font-semibold whitespace-nowrap">{p.nom}</td>
                    {Array.from({ length: nbJours }, (_, i) => i + 1).map((j) => {
                      const etat = p.jours.get(j);
                      return (
                        <td key={j} className={cx('h-8 border-l border-gris-100 p-0.5', [0, 6].includes(jourSemaine(j)) && 'bg-gris-50')}>
                          {etat && <div title={etat === 'demi' ? 'Demi-journée' : 'Absent'} className={cx('h-full rounded', etat === 'demi' ? 'bg-ynov-turquoise/40' : 'bg-ynov-turquoise')} />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex gap-4 text-xs text-gris-600">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-ynov-turquoise" /> Journée</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-ynov-turquoise/40" /> Demi-journée</span>
        </div>
      </Carte>
    </>
  );
}

export default function PagePlanning() {
  return <Suspense fallback={<Chargement />}><Contenu /></Suspense>;
}
