'use client';
/** États de suivi et export CSV (réservé aux RH, limité à leur périmètre). */
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useAction } from '../../../lib/hooks';
import { aujourdhui } from '../../../lib/format';
import { Alerte, Bouton, Carte, Champ, classeSaisie, EnTetePage } from '../../../components/ui';

export default function PageExport() {
  const annee = aujourdhui().slice(0, 4);
  const [du, setDu] = useState(`${annee}-01-01`);
  const [au, setAu] = useState(`${annee}-12-31`);
  const action = useAction();
  const telecharger = (quoi: 'demandes' | 'signalements') =>
    action.executer(() => api.telecharger(`/export/${quoi}.csv?du=${du}&au=${au}`, `${quoi}.csv`));

  return (
    <>
      <EnTetePage titre="États et export" sousTitre="Fichiers CSV (séparateur ;) compatibles Excel. Chaque export est tracé." />
      <Carte className="max-w-2xl">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Du">{(id) => <input id={id} type="date" value={du} onChange={(e) => setDu(e.target.value)} className={classeSaisie} />}</Champ>
            <Champ label="Au">{(id) => <input id={id} type="date" value={au} min={du} onChange={(e) => setAu(e.target.value)} className={classeSaisie} />}</Champ>
          </div>
          {action.erreur && <Alerte>{action.erreur}</Alerte>}
          <div className="flex flex-wrap gap-2">
            <Bouton enCours={action.enCours} onClick={() => telecharger('demandes')}>Exporter les congés</Bouton>
            <Bouton variante="secondaire" enCours={action.enCours} onClick={() => telecharger('signalements')}>Exporter les absences et retards</Bouton>
          </div>
          <p className="text-xs text-gris-500">Les dossiers sont filtrés sur leur date de début. Les justificatifs ne sont jamais inclus dans les exports.</p>
        </div>
      </Carte>
    </>
  );
}
