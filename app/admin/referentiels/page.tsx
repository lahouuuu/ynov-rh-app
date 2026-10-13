'use client';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useAction, useApi } from '../../../lib/hooks';
import type { Referentiels } from '../../../lib/types';
import { Alerte, Bouton, Carte, Champ, Chargement, classeSaisie, EnTetePage } from '../../../components/ui';

function Bloc({ titre, chemin, elements, onAjout }: { titre: string; chemin: string; elements: Array<{ id: string; nom: string }>; onAjout: () => void }) {
  const [id, setId] = useState('');
  const [nom, setNom] = useState('');
  const action = useAction();
  return (
    <Carte titre={titre}>
      <ul className="mb-4 divide-y divide-gris-100 text-sm">
        {elements.map((e) => <li key={e.id} className="flex justify-between py-2"><span className="font-semibold">{e.nom}</span><span className="font-mono text-xs text-gris-500">{e.id}</span></li>)}
        {!elements.length && <li className="py-2 text-gris-500">Aucun élément.</li>}
      </ul>
      <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={async (e) => {
        e.preventDefault();
        if (await action.executer(() => api.post(`/admin/${chemin}`, { id, nom }))) { setId(''); setNom(''); onAjout(); }
      }}>
        <Champ label="Identifiant" aide="minuscules, chiffres, tirets">{(cid) => <input id={cid} value={id} onChange={(e) => setId(e.target.value.toLowerCase())} className={classeSaisie} />}</Champ>
        <Champ label="Nom">{(cid) => <input id={cid} value={nom} onChange={(e) => setNom(e.target.value)} className={classeSaisie} />}</Champ>
        <Bouton type="submit" enCours={action.enCours} disabled={!id || !nom}>Ajouter</Bouton>
      </form>
      {action.erreur && <div className="mt-3"><Alerte>{action.erreur}</Alerte></div>}
    </Carte>
  );
}

export default function PageReferentiels() {
  const { donnees, erreur, recharger } = useApi<Referentiels>('/referentiels');
  if (erreur) return <Alerte>{erreur}</Alerte>;
  if (!donnees) return <Chargement />;
  return (
    <>
      <EnTetePage titre="Campus et services" sousTitre="Référentiels utilisés pour les rattachements et les périmètres RH." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Bloc titre="Campus" chemin="campus" elements={donnees.campus} onAjout={recharger} />
        <Bloc titre="Services" chemin="services" elements={donnees.services} onAjout={recharger} />
      </div>
    </>
  );
}
