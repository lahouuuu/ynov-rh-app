'use client';
/** Liste paginée et filtrable (statut, période) des demandes de congé. */
import Link from 'next/link';
import { useState } from 'react';
import { useListePaginee } from '../lib/hooks';
import { date, jours } from '../lib/format';
import { STATUTS_DEMANDE, STATUTS_FICHE, TYPES_CONGE } from '../lib/libelles';
import type { Demande } from '../lib/types';
import { Alerte, BoutonPlus, Chargement, classeSaisie, PastilleDe, Tableau, Vide } from './ui';

export function FiltresPeriode({
  statut, setStatut, du, setDu, au, setAu, statuts,
}: {
  statut: string; setStatut: (s: string) => void; du: string; setDu: (s: string) => void; au: string; setAu: (s: string) => void;
  statuts: Array<{ valeur: string; libelle: string }>;
}) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="text-xs font-semibold text-gris-600">
        Statut
        <select value={statut} onChange={(e) => setStatut(e.target.value)} className={`${classeSaisie} mt-1`}>
          <option value="">Tous</option>
          {statuts.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-gris-600">
        Début à partir du
        <input type="date" value={du} onChange={(e) => setDu(e.target.value)} className={`${classeSaisie} mt-1`} />
      </label>
      <label className="text-xs font-semibold text-gris-600">
        Jusqu’au
        <input type="date" value={au} onChange={(e) => setAu(e.target.value)} className={`${classeSaisie} mt-1`} />
      </label>
    </div>
  );
}

export function construireRequete(base: string, params: Record<string, string>) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  const s = q.toString();
  return s ? `${base}${base.includes('?') ? '&' : '?'}${s}` : base;
}

export function ListeDemandes({
  vue,
  statutInitial = '',
  afficherCollaborateur = false,
  filtreFiche = '',
  lienFiche = false,
}: {
  vue: 'moi' | 'equipe' | 'rh' | 'direction';
  statutInitial?: string;
  afficherCollaborateur?: boolean;
  filtreFiche?: string;
  lienFiche?: boolean;
}) {
  const [statut, setStatut] = useState(statutInitial);
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const liste = useListePaginee<Demande>(construireRequete(`/demandes?vue=${vue}&limite=20`, { statut, du, au, ficheStatut: filtreFiche }));
  const lien = (d: Demande) => (lienFiche ? `/conges/fiche?id=${d.id}` : `/conges/detail?id=${d.id}`);

  return (
    <>
      <FiltresPeriode
        statut={statut} setStatut={setStatut} du={du} setDu={setDu} au={au} setAu={setAu}
        statuts={Object.entries(STATUTS_DEMANDE).map(([valeur, s]) => ({ valeur, libelle: s.libelle }))}
      />
      {liste.erreur && <Alerte>{liste.erreur}</Alerte>}
      {liste.chargement && !liste.elements.length ? (
        <Chargement />
      ) : !liste.elements.length ? (
        <Vide titre="Aucune demande">Modifiez les filtres ou créez une nouvelle demande.</Vide>
      ) : (
        <>
        {/* Mobile : cartes */}
        <ul className="space-y-2 md:hidden">
          {liste.elements.map((d) => (
            <li key={d.id}>
              <Link href={lien(d)} className="block rounded-lg border border-gris-200 p-3 hover:border-ynov-turquoise">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {afficherCollaborateur && <p className="font-semibold">{d.userNom}</p>}
                    <p className="text-sm">{date(d.dateDebut)} → {date(d.dateFin)}</p>
                    <p className="text-xs text-gris-500">{TYPES_CONGE[d.type]} · {jours(d.dureeTotale)} ({jours(d.joursPayes)} payés / {jours(d.joursNonPayes)} non payés)</p>
                  </div>
                  <PastilleDe table={STATUTS_DEMANDE} valeur={d.statut} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
        <Tableau entetes={[...(afficherCollaborateur ? ['Collaborateur'] : []), 'Période', 'Type', 'Durée', 'Payés / non payés', 'Statut', '']}>
          {liste.elements.map((d) => (
            <tr key={d.id} className="hover:bg-gris-50">
              {afficherCollaborateur && <td className="px-3 py-3 font-semibold">{d.userNom}</td>}
              <td className="px-3 py-3">{date(d.dateDebut)} → {date(d.dateFin)}</td>
              <td className="px-3 py-3">{TYPES_CONGE[d.type]}</td>
              <td className="px-3 py-3">{jours(d.dureeTotale)}</td>
              <td className="px-3 py-3">
                {jours(d.joursPayes)} / {jours(d.joursNonPayes)}
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1">
                  <PastilleDe table={STATUTS_DEMANDE} valeur={d.statut} />
                  {d.annulation && <PastilleDe table={{ x: { libelle: 'Annulation demandée', ton: 'attente' } }} valeur="x" />}
                  {d.reconfirmationRequise && <PastilleDe table={{ x: { libelle: 'Confirmation requise', ton: 'danger' } }} valeur="x" />}
                  {d.statut === 'approuvee' && d.ficheStatut && <PastilleDe table={STATUTS_FICHE} valeur={d.ficheStatut} />}
                </div>
              </td>
              <td className="px-3 py-3 text-right">
                <Link href={lien(d)} className="font-semibold text-ynov-turquoise-fonce hover:underline">Ouvrir →</Link>
              </td>
            </tr>
          ))}
        </Tableau>
        </div>
        </>
      )}
      <BoutonPlus visible={liste.aSuivant} chargement={liste.chargement} onClick={liste.plus} />
    </>
  );
}
