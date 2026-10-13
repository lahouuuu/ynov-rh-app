'use client';
import { useState } from 'react';
import { Alerte, Bouton, Champ, classeSaisie, Dialogue } from './ui';

/** Boîte de dialogue de confirmation avec motif (obligatoire ou facultatif). */
export function DialogueMotif({
  ouvert,
  titre,
  description,
  libelleMotif = 'Motif',
  obligatoire = true,
  libelleConfirmer,
  variante = 'principal',
  enCours,
  erreur,
  onConfirmer,
  onFermer,
}: {
  ouvert: boolean;
  titre: string;
  description?: React.ReactNode;
  libelleMotif?: string;
  obligatoire?: boolean;
  libelleConfirmer: string;
  variante?: 'principal' | 'danger' | 'accent';
  enCours?: boolean;
  erreur?: string | null;
  onConfirmer: (motif: string) => void;
  onFermer: () => void;
}) {
  const [motif, setMotif] = useState('');
  return (
    <Dialogue ouvert={ouvert} titre={titre} onFermer={() => { setMotif(''); onFermer(); }}>
      <div className="space-y-4">
        {description && <div className="text-sm text-gris-700">{description}</div>}
        {erreur && <Alerte>{erreur}</Alerte>}
        <Champ label={libelleMotif} obligatoire={obligatoire}>
          {(id) => <textarea id={id} rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} className={classeSaisie} />}
        </Champ>
        <div className="flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={() => { setMotif(''); onFermer(); }}>Annuler</Bouton>
          <Bouton variante={variante} enCours={enCours} disabled={obligatoire && !motif.trim()} onClick={() => onConfirmer(motif)}>
            {libelleConfirmer}
          </Bouton>
        </div>
      </div>
    </Dialogue>
  );
}
