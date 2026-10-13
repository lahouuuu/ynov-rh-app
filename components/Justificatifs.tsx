'use client';
/**
 * Justificatifs d'un dossier : dépôt (PDF, JPEG, PNG ≤ 10 Mo, 3 max),
 * téléchargement sécurisé via l'API et examen par les RH.
 */
import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAction } from '../lib/hooks';
import { instant } from '../lib/format';
import type { Justificatif } from '../lib/types';
import { Alerte, Bouton, Carte, Champ, classeSaisie, Dialogue, Pastille } from './ui';

const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const TAILLE_MAX = 10 * 1024 * 1024;
const MAX_PIECES = 3;

function lireBase64(f: File): Promise<string> {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => ko(new Error('Lecture du fichier impossible.'));
    r.readAsDataURL(f);
  });
}

const tailleLisible = (o: number) => (o > 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.ceil(o / 1024)} Ko`);

export function Justificatifs({
  dossierType,
  dossierId,
  pieces,
  peutDeposer,
  peutExaminer,
  nombreTotal,
  onChange,
  consigne,
}: {
  dossierType: 'demande' | 'signalement';
  dossierId: string;
  pieces: Justificatif[];
  peutDeposer: boolean;
  peutExaminer: boolean;
  nombreTotal?: number;
  onChange: () => void;
  consigne?: React.ReactNode;
}) {
  const entree = useRef<HTMLInputElement>(null);
  const depot = useAction();
  const examen = useAction();
  const [refus, setRefus] = useState<Justificatif | null>(null);
  const [motif, setMotif] = useState('');
  const total = Math.max(nombreTotal ?? 0, pieces.length);

  async function deposer(f: File) {
    if (!TYPES.includes(f.type)) return depot.setErreur('Format non autorisé : PDF, JPEG ou PNG uniquement.');
    if (f.size > TAILLE_MAX) return depot.setErreur('Le fichier dépasse 10 Mo.');
    await depot.executer(async () => {
      const contenuBase64 = await lireBase64(f);
      await api.post('/justificatifs', { dossierType, dossierId, nomFichier: f.name, contentType: f.type, contenuBase64 });
      onChange();
    });
    if (entree.current) entree.current.value = '';
  }

  async function decider(j: Justificatif, accepte: boolean, m = '') {
    const ok = await examen.executer(() => api.post(`/justificatifs/${j.id}/decision`, { accepte, motif: m }));
    if (ok) {
      setRefus(null);
      setMotif('');
      onChange();
    }
  }

  return (
    <Carte titre="Justificatifs">
      {consigne && <div className="mb-4">{consigne}</div>}
      {depot.erreur && <div className="mb-3"><Alerte>{depot.erreur}</Alerte></div>}
      {examen.erreur && <div className="mb-3"><Alerte>{examen.erreur}</Alerte></div>}

      {pieces.length === 0 ? (
        <p className="text-sm text-gris-600">
          {total > 0 ? 'Des pièces ont été déposées ; leur contenu est réservé au déposant et aux RH habilités.' : 'Aucune pièce déposée.'}
        </p>
      ) : (
        <ul className="divide-y divide-gris-100">
          {pieces.map((j) => (
            <li key={j.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{j.nomFichier}</p>
                <p className="text-xs text-gris-500">
                  {tailleLisible(j.taille)} · déposé le {instant(j.deposeLe)}
                  {j.motifDecision && ` · ${j.motifDecision}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Pastille ton={j.statut === 'accepte' ? 'succes' : j.statut === 'refuse' ? 'danger' : 'info'}>
                  {j.statut === 'accepte' ? 'Accepté' : j.statut === 'refuse' ? 'Refusé' : 'À examiner'}
                </Pastille>
                <Bouton variante="secondaire" className="px-3 py-1.5" onClick={() => api.telecharger(`/justificatifs/${j.id}/contenu`, j.nomFichier)}>
                  Télécharger
                </Bouton>
                {peutExaminer && j.statut === 'recu_a_examiner' && (
                  <>
                    <Bouton variante="accent" className="px-3 py-1.5" enCours={examen.enCours} onClick={() => decider(j, true)}>
                      Accepter
                    </Bouton>
                    <Bouton variante="danger" className="px-3 py-1.5" onClick={() => setRefus(j)}>
                      Refuser
                    </Bouton>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {peutDeposer && total < MAX_PIECES && (
        <div className="mt-4 border-t border-gris-100 pt-4">
          <input ref={entree} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => e.target.files?.[0] && deposer(e.target.files[0])} />
          <Bouton variante="secondaire" enCours={depot.enCours} onClick={() => entree.current?.click()}>
            + Joindre un justificatif
          </Bouton>
          <p className="mt-2 text-xs text-gris-500">PDF, JPEG ou PNG · 10 Mo maximum · {MAX_PIECES - total} pièce(s) restante(s). Les pièces restent privées.</p>
        </div>
      )}

      <Dialogue ouvert={!!refus} titre="Refuser le justificatif" onFermer={() => setRefus(null)}>
        <div className="space-y-4">
          <Champ label="Motif du refus" obligatoire aide="Le collaborateur pourra déposer un complément.">
            {(id) => <textarea id={id} rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} className={classeSaisie} />}
          </Champ>
          <div className="flex justify-end gap-2">
            <Bouton variante="secondaire" onClick={() => setRefus(null)}>Annuler</Bouton>
            <Bouton variante="danger" disabled={!motif.trim()} enCours={examen.enCours} onClick={() => refus && decider(refus, false, motif)}>
              Refuser
            </Bouton>
          </div>
        </div>
      </Dialogue>
    </Carte>
  );
}
