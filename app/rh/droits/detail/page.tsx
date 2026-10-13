'use client';
/** Gestion des droits d'un collaborateur : modification de dotation et ajustements motivés. */
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import { useAction } from '../../../../lib/hooks';
import { aujourdhui } from '../../../../lib/format';
import { CarteSolde } from '../../../../components/CarteSolde';
import { Alerte, Bouton, Champ, classeSaisie, Chargement, Dialogue, EnTetePage } from '../../../../components/ui';

function Contenu() {
  const params = useSearchParams();
  const uid = params.get('uid');
  const annee = Number(params.get('annee') ?? aujourdhui().slice(0, 4));
  const action = useAction();
  const [mode, setMode] = useState<null | 'dotation' | 'ajustement'>(null);
  const [valeur, setValeur] = useState('');
  const [motif, setMotif] = useState('');
  const [succes, setSucces] = useState<string | null>(null);
  const [cle, setCle] = useState(0);

  if (!uid) return <Alerte>Collaborateur non précisé.</Alerte>;

  return (
    <>
      <EnTetePage titre="Droits du collaborateur" actions={<button onClick={() => history.back()} className="text-sm font-semibold text-ynov-turquoise-fonce hover:underline">← Retour</button>} />
      {succes && <div className="mb-4"><Alerte ton="succes">{succes}</Alerte></div>}
      <CarteSolde
        key={cle}
        titre="Droits et solde"
        chemin={(a) => `/dotations/${uid}/${a}`}
        anneeInitiale={annee}
        actions={(d, a) => (
          <>
            <div className="flex flex-wrap gap-2">
              <Bouton variante="secondaire" onClick={() => { setMode('dotation'); setValeur(String(d.joursAttribues)); setMotif(''); }}>Modifier la dotation {a}</Bouton>
              <Bouton variante="secondaire" onClick={() => { setMode('ajustement'); setValeur(''); setMotif(''); }}>Ajuster le solde</Bouton>
            </div>
            <Dialogue ouvert={mode !== null} titre={mode === 'dotation' ? `Dotation ${a}` : `Ajustement ${a}`} onFermer={() => setMode(null)}>
              <div className="space-y-4">
                {action.erreur && <Alerte>{action.erreur}</Alerte>}
                <Champ label={mode === 'dotation' ? 'Jours attribués' : 'Ajustement (jours, négatif pour retirer)'} obligatoire aide="Par pas de 0,5 jour. Une réduction rendant le solde négatif est bloquée.">
                  {(id) => <input id={id} type="number" step="0.5" value={valeur} onChange={(e) => setValeur(e.target.value)} className={classeSaisie} />}
                </Champ>
                <Champ label="Motif" obligatoire>
                  {(id) => <textarea id={id} rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} className={classeSaisie} />}
                </Champ>
                <div className="flex justify-end gap-2">
                  <Bouton variante="secondaire" onClick={() => setMode(null)}>Annuler</Bouton>
                  <Bouton
                    enCours={action.enCours}
                    disabled={valeur === '' || motif.trim().length < 3}
                    onClick={async () => {
                      const n = Number(valeur);
                      const ok = await action.executer(() =>
                        mode === 'dotation'
                          ? api.put(`/dotations/${uid}/${a}`, { joursAttribues: n, motif })
                          : api.post(`/dotations/${uid}/${a}/ajustements`, { jours: n, motif }),
                      );
                      if (ok) {
                        setMode(null);
                        setSucces('Modification enregistrée et historisée.');
                        setCle((c) => c + 1);
                      }
                    }}
                  >
                    Enregistrer
                  </Bouton>
                </div>
              </div>
            </Dialogue>
          </>
        )}
      />
    </>
  );
}

export default function PageDroitsDetail() {
  return <Suspense fallback={<Chargement />}><Contenu /></Suspense>;
}
