'use client';
/** Droits annuels des collaborateurs du périmètre RH. */
import Link from 'next/link';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useAction, useListePaginee } from '../../../lib/hooks';
import { aujourdhui, jours } from '../../../lib/format';
import { Alerte, Bouton, BoutonPlus, Carte, Chargement, classeSaisie, EnTetePage, Pastille, Tableau, Vide } from '../../../components/ui';

interface Ligne {
  uid: string; nomComplet: string; email: string; campusId: string; actif: boolean; initialisee: boolean;
  joursAttribues: number; ajustements: number; joursDebites: number; solde: number;
}

export default function PageDroits() {
  const anneeCourante = Number(aujourdhui().slice(0, 4));
  const [annee, setAnnee] = useState(anneeCourante);
  const liste = useListePaginee<Ligne>(`/dotations?annee=${annee}&limite=25`);
  const attribution = useAction();
  const [message, setMessage] = useState<string | null>(null);

  async function attribuer() {
    const r = await attribution.executer(() => api.post<{ creees: number; total: number }>('/dotations/attribution', { annee }));
    if (r) {
      setMessage(`${r.creees} dotation(s) créée(s) sur ${r.total} collaborateur(s) actif(s).`);
      liste.recharger();
    }
  }

  return (
    <>
      <EnTetePage
        titre="Droits annuels"
        sousTitre="Dotation par collaborateur et par année. Toute modification exige un motif et reste historisée."
        actions={
          <>
            <select aria-label="Année" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className={`${classeSaisie} w-auto`}>
              {[anneeCourante - 1, anneeCourante, anneeCourante + 1].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <Bouton variante="secondaire" enCours={attribution.enCours} onClick={attribuer}>Attribuer les droits {annee}</Bouton>
          </>
        }
      />
      {message && <div className="mb-4"><Alerte ton="succes">{message}</Alerte></div>}
      {attribution.erreur && <div className="mb-4"><Alerte>{attribution.erreur}</Alerte></div>}
      <Carte>
        {liste.erreur && <Alerte>{liste.erreur}</Alerte>}
        {liste.chargement && !liste.elements.length ? <Chargement /> : !liste.elements.length ? <Vide titre="Aucun collaborateur dans votre périmètre" /> : (
          <Tableau entetes={['Collaborateur', 'Campus', 'Attribués', 'Ajustements', 'Décomptés', 'Solde', '']}>
            {liste.elements.map((l) => (
              <tr key={l.uid} className="hover:bg-gris-50">
                <td className="px-3 py-3">
                  <p className="font-semibold">{l.nomComplet}</p>
                  <p className="text-xs text-gris-500">{l.email}</p>
                </td>
                <td className="px-3 py-3">{l.campusId}</td>
                <td className="px-3 py-3">{jours(l.joursAttribues)} {!l.initialisee && <Pastille>par défaut</Pastille>}</td>
                <td className="px-3 py-3">{l.ajustements > 0 ? '+' : ''}{jours(l.ajustements)}</td>
                <td className="px-3 py-3">{jours(l.joursDebites)}</td>
                <td className="px-3 py-3 font-bold">{jours(l.solde)}</td>
                <td className="px-3 py-3 text-right">
                  <Link href={`/rh/droits/detail?uid=${l.uid}&annee=${annee}`} className="font-semibold text-ynov-turquoise-fonce hover:underline">Gérer →</Link>
                </td>
              </tr>
            ))}
          </Tableau>
        )}
        <BoutonPlus visible={liste.aSuivant} chargement={liste.chargement} onClick={liste.plus} />
      </Carte>
    </>
  );
}
