'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useListePaginee } from '../lib/hooks';
import { date } from '../lib/format';
import { QUALIFICATIONS, STATUTS_JUSTIFICATIF, STATUTS_TRAITEMENT } from '../lib/libelles';
import type { Signalement } from '../lib/types';
import { construireRequete } from './ListeDemandes';
import { Alerte, BoutonPlus, Chargement, classeSaisie, PastilleDe, Tableau, Vide } from './ui';

export function ListeSignalements({ vue, afficherCollaborateur = false }: { vue: 'moi' | 'equipe' | 'rh'; afficherCollaborateur?: boolean }) {
  const [type, setType] = useState('');
  const [statut, setStatut] = useState(vue === 'moi' ? '' : 'declare,en_cours');
  const [qualification, setQualification] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const liste = useListePaginee<Signalement>(
    construireRequete(`/signalements?vue=${vue}&limite=20`, { type, statutTraitement: statut, qualification, du, au }),
  );

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <label className="text-xs font-semibold text-gris-600">Type
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${classeSaisie} mt-1`}>
            <option value="">Tous</option><option value="absence">Absences</option><option value="retard">Retards</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-gris-600">Traitement
          <select value={statut} onChange={(e) => setStatut(e.target.value)} className={`${classeSaisie} mt-1`}>
            <option value="">Tous</option><option value="declare,en_cours">Ouverts</option>
            {Object.entries(STATUTS_TRAITEMENT).map(([v, s]) => <option key={v} value={v}>{s.libelle}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gris-600">Qualification
          <select value={qualification} onChange={(e) => setQualification(e.target.value)} className={`${classeSaisie} mt-1`}>
            <option value="">Toutes</option>
            {Object.entries(QUALIFICATIONS).map(([v, s]) => <option key={v} value={v}>{s.libelle}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gris-600">À partir du
          <input type="date" value={du} onChange={(e) => setDu(e.target.value)} className={`${classeSaisie} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-gris-600">Jusqu’au
          <input type="date" value={au} onChange={(e) => setAu(e.target.value)} className={`${classeSaisie} mt-1`} />
        </label>
      </div>
      {liste.erreur && <Alerte>{liste.erreur}</Alerte>}
      {liste.chargement && !liste.elements.length ? (
        <Chargement />
      ) : !liste.elements.length ? (
        <Vide titre="Aucun signalement">Aucun signalement ne correspond à ces critères.</Vide>
      ) : (
        <>
        <ul className="space-y-2 md:hidden">
          {liste.elements.map((s) => (
            <li key={s.id}>
              <Link href={`/signalements/detail?id=${s.id}`} className="block rounded-lg border border-gris-200 p-3 hover:border-ynov-turquoise">
                {afficherCollaborateur && <p className="font-semibold">{s.userNom}</p>}
                <p className="text-sm">{s.type === 'absence' ? 'Absence' : 'Retard'} · {date(s.dateDebut)} · {s.categorieLibelle}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <PastilleDe table={STATUTS_TRAITEMENT} valeur={s.statutTraitement} />
                  <PastilleDe table={QUALIFICATIONS} valeur={s.qualification} />
                  <PastilleDe table={STATUTS_JUSTIFICATIF} valeur={s.justificatifStatut} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
        <Tableau entetes={[...(afficherCollaborateur ? ['Collaborateur'] : []), 'Type', 'Date', 'Motif', 'Traitement', 'Qualification', 'Justificatif', '']}>
          {liste.elements.map((s) => (
            <tr key={s.id} className="hover:bg-gris-50">
              {afficherCollaborateur && <td className="px-3 py-3 font-semibold">{s.userNom}</td>}
              <td className="px-3 py-3">{s.type === 'absence' ? 'Absence' : 'Retard'}</td>
              <td className="px-3 py-3 whitespace-nowrap">
                {date(s.dateDebut)}
                {s.type === 'absence' && s.dateFin && s.dateFin !== s.dateDebut && ` → ${date(s.dateFin)}`}
                {s.type === 'retard' && s.retard?.minutes != null && ` · ${s.retard.minutes} min`}
              </td>
              <td className="px-3 py-3">{s.categorieLibelle}</td>
              <td className="px-3 py-3"><PastilleDe table={STATUTS_TRAITEMENT} valeur={s.statutTraitement} /></td>
              <td className="px-3 py-3"><PastilleDe table={QUALIFICATIONS} valeur={s.qualification} /></td>
              <td className="px-3 py-3"><PastilleDe table={STATUTS_JUSTIFICATIF} valeur={s.justificatifStatut} /></td>
              <td className="px-3 py-3 text-right"><Link href={`/signalements/detail?id=${s.id}`} className="font-semibold text-ynov-turquoise-fonce hover:underline">Ouvrir →</Link></td>
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
