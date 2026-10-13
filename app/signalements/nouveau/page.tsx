'use client';
/** Déclaration immédiate d'une absence ou d'un retard, avec ou sans justificatif. */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, messageErreur, nouvelleCle } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';
import { aujourdhui } from '../../../lib/format';
import type { Parametres } from '../../../lib/types';
import { Alerte, Bouton, Carte, Champ, classeSaisie, EnTetePage, Onglets } from '../../../components/ui';

export default function PageNouveauSignalement() {
  const router = useRouter();
  const { donnees: p } = useApi<Parametres>('/parametres');
  const [type, setType] = useState<'absence' | 'retard'>('absence');
  const [categorie, setCategorie] = useState('');
  const [dateDebut, setDateDebut] = useState(aujourdhui());
  const [dateFin, setDateFin] = useState('');
  const [dureeEstimee, setDureeEstimee] = useState('');
  const [heurePrevue, setHeurePrevue] = useState('09:00');
  const [heureEstimee, setHeureEstimee] = useState('');
  const [heureReelle, setHeureReelle] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = useRef(nouvelleCle());

  const categories = (p?.categories ?? []).filter((c) => c.type === type);
  const cat = categories.find((c) => c.code === categorie);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const corps =
        type === 'absence'
          ? { type, categorie, dateDebut, dateFin: dateFin || null, dureeEstimee, commentaire, cleIdempotence: cle.current }
          : { type, categorie, dateDebut, heurePrevue, heureArriveeEstimee: heureEstimee || null, heureArriveeReelle: heureReelle || null, commentaire, cleIdempotence: cle.current };
      const r = await api.post<{ id: string }>('/signalements', corps);
      router.push(`/signalements/detail?id=${r.id}`);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <EnTetePage titre="Signaler une absence ou un retard" sousTitre="Le signalement est enregistré sans attendre d’autorisation, avec l’heure réelle de dépôt." />
      <Carte className="max-w-3xl">
        <Onglets valeur={type} onChange={(v) => { setType(v); setCategorie(''); }} options={[{ valeur: 'absence', libelle: 'Absence' }, { valeur: 'retard', libelle: 'Retard' }]} />
        <form onSubmit={envoyer} className="space-y-5">
          <Champ label="Motif" obligatoire>
            {(id) => (
              <select id={id} required value={categorie} onChange={(e) => setCategorie(e.target.value)} className={classeSaisie}>
                <option value="">Choisir…</option>
                {categories.map((c) => <option key={c.code} value={c.code}>{c.libelle}</option>)}
              </select>
            )}
          </Champ>
          {cat && (
            <Alerte ton="info">
              {cat.justificatif === 'a_fournir'
                ? `Un justificatif sera attendu sous ${cat.delaiJustificatifJours} jour(s). Vous pouvez le déposer maintenant ou plus tard : son absence n’empêche pas le signalement.`
                : 'Aucun justificatif n’est requis pour ce motif.'}
              {cat.medical && ' Les informations médicales ne sont visibles que par vous et les RH habilités.'}
            </Alerte>
          )}

          {type === 'absence' ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Champ label="Date de début" obligatoire aide="Une déclaration a posteriori est possible.">
                {(id) => <input id={id} type="date" required value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className={classeSaisie} />}
              </Champ>
              <Champ label="Date de fin" aide="Facultative : à compléter plus tard si inconnue.">
                {(id) => <input id={id} type="date" min={dateDebut} value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={classeSaisie} />}
              </Champ>
              <Champ label="Durée estimée" aide="Ex. : 2 jours, une matinée…">
                {(id) => <input id={id} type="text" maxLength={100} value={dureeEstimee} onChange={(e) => setDureeEstimee(e.target.value)} className={classeSaisie} />}
              </Champ>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Date" obligatoire>
                {(id) => <input id={id} type="date" required value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className={classeSaisie} />}
              </Champ>
              <Champ label="Heure de prise de poste prévue" obligatoire>
                {(id) => <input id={id} type="time" required value={heurePrevue} onChange={(e) => setHeurePrevue(e.target.value)} className={classeSaisie} />}
              </Champ>
              <Champ label="Heure d’arrivée estimée">
                {(id) => <input id={id} type="time" value={heureEstimee} onChange={(e) => setHeureEstimee(e.target.value)} className={classeSaisie} />}
              </Champ>
              <Champ label="Heure d’arrivée réelle" aide="La durée définitive est calculée à partir de l’arrivée réelle.">
                {(id) => <input id={id} type="time" value={heureReelle} onChange={(e) => setHeureReelle(e.target.value)} className={classeSaisie} />}
              </Champ>
            </div>
          )}

          <Champ label="Commentaire" aide="Facultatif.">
            {(id) => <textarea id={id} rows={3} maxLength={1000} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} className={classeSaisie} />}
          </Champ>
          {dateDebut > aujourdhui() && type === 'absence' && <p className="text-xs text-gris-500">Absence prévue : pensez à une demande de congé si elle doit être autorisée.</p>}
          {erreur && <Alerte>{erreur}</Alerte>}
          <Bouton type="submit" enCours={enCours} disabled={!categorie || !dateDebut}>Envoyer le signalement</Bouton>
        </form>
      </Carte>
    </>
  );
}
