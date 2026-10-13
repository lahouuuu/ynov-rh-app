'use client';
/** Paramètres RH : dotation par défaut, jours ouvrés, jours fériés, modèle de la fiche de congé. */
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useAction, useApi } from '../../../lib/hooks';
import { useSession } from '../../../lib/session';
import type { Parametres, ParametresFiche } from '../../../lib/types';
import { Alerte, Bouton, Carte, Champ, Chargement, classeSaisie, EnTetePage, Tableau } from '../../../components/ui';

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export default function PageParametres() {
  const { donnees: p, erreur, recharger } = useApi<Parametres>('/parametres');
  if (erreur) return <Alerte>{erreur}</Alerte>;
  if (!p) return <Chargement />;
  return <Formulaire p={p} recharger={recharger} />;
}

function Formulaire({ p, recharger }: { p: Parametres; recharger: () => Promise<void> }) {
  const { profil } = useSession();
  const action = useAction();
  const [dotation, setDotation] = useState(String(p.dotationParDefaut));
  const [ouvres, setOuvres] = useState<number[]>(p.joursOuvres);
  const [feries, setFeries] = useState(p.joursFeries.join('\n'));
  const [fiche, setFiche] = useState<ParametresFiche>(p.fiche);
  const [motif, setMotif] = useState('');
  const [succes, setSucces] = useState(false);
  const modifiable = !!profil?.perimetreRh.tous;

  async function enregistrer() {
    setSucces(false);
    const listeFeries = feries.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const ok = await action.executer(() => api.put('/parametres', { dotationParDefaut: Number(dotation), joursOuvres: ouvres, joursFeries: listeFeries, fiche, motif }));
    if (ok) {
      setSucces(true);
      setMotif('');
      await recharger();
    }
  }

  return (
    <>
      <EnTetePage titre="Paramètres RH" sousTitre="Ces paramètres s’appliquent au calcul des durées et aux nouvelles dotations." />
      {!modifiable && <div className="mb-4"><Alerte ton="info">Consultation seule : seul un gestionnaire RH au périmètre global peut modifier les paramètres.</Alerte></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Carte titre="Congés et calendrier">
          <fieldset disabled={!modifiable} className="space-y-5">
            <Champ label="Dotation annuelle par défaut (jours)" aide="Valeur initiale attribuée à chaque collaborateur pour une nouvelle année (18 jours prévus).">
              {(id) => <input id={id} type="number" step="0.5" min="0" value={dotation} onChange={(e) => setDotation(e.target.value)} className={classeSaisie} />}
            </Champ>
            <div>
              <p className="mb-2 text-sm font-semibold">Jours ouvrés</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 0].map((j) => (
                  <label key={j} className="flex items-center gap-1.5 rounded-lg border border-gris-200 px-2.5 py-1.5 text-sm">
                    <input type="checkbox" className="accent-ynov-turquoise" checked={ouvres.includes(j)} onChange={(e) => setOuvres((o) => (e.target.checked ? [...o, j] : o.filter((x) => x !== j)))} />
                    {JOURS[j]}
                  </label>
                ))}
              </div>
            </div>
            <Champ label="Jours fériés" aide="Une date AAAA-MM-JJ par ligne. Les fêtes religieuses sont à confirmer chaque année.">
              {(id) => <textarea id={id} rows={8} value={feries} onChange={(e) => setFeries(e.target.value)} className={`${classeSaisie} font-mono`} />}
            </Champ>
            <fieldset className="rounded-lg border border-gris-200 p-3">
              <legend className="px-1 text-sm font-semibold">Fiche de congé papier (formulaire à signer)</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ['entite', 'Entité (en-tête)'],
                  ['code', 'Code du formulaire'],
                  ['version', 'Version'],
                  ['dateApplication', 'Date d’application'],
                  ['libelleRaf', 'Intitulé 2ᵉ signature'],
                  ['signataireRaf', 'Nom 2ᵉ signataire'],
                  ['libelleDirection', 'Intitulé 3ᵉ signature'],
                  ['signataireDirection', 'Nom 3ᵉ signataire'],
                ] as Array<[keyof ParametresFiche, string]>).map(([cle, libelle]) => (
                  <Champ key={cle} label={libelle}>
                    {(id) => <input id={id} value={fiche[cle]} onChange={(e) => setFiche((f) => ({ ...f, [cle]: e.target.value }))} className={classeSaisie} />}
                  </Champ>
                ))}
              </div>
            </fieldset>
            <Champ label="Motif de la modification" obligatoire>
              {(id) => <input id={id} type="text" value={motif} onChange={(e) => setMotif(e.target.value)} className={classeSaisie} />}
            </Champ>
            {action.erreur && <Alerte>{action.erreur}</Alerte>}
            {succes && <Alerte ton="succes">Paramètres enregistrés.</Alerte>}
            {modifiable && <Bouton enCours={action.enCours} disabled={motif.trim().length < 3} onClick={enregistrer}>Enregistrer</Bouton>}
          </fieldset>
        </Carte>
        <Carte titre="Motifs d’absence et de retard">
          <Tableau entetes={['Type', 'Motif', 'Justificatif', 'Délai', 'Médical']}>
            {p.categories.map((c) => (
              <tr key={`${c.type}-${c.code}`}>
                <td className="px-3 py-2">{c.type === 'absence' ? 'Absence' : 'Retard'}</td>
                <td className="px-3 py-2 font-semibold">{c.libelle}</td>
                <td className="px-3 py-2">{c.justificatif === 'a_fournir' ? 'À fournir' : 'Non requis'}</td>
                <td className="px-3 py-2">{c.delaiJustificatifJours ? `${c.delaiJustificatifJours} j` : '—'}</td>
                <td className="px-3 py-2">{c.medical ? 'Oui' : 'Non'}</td>
              </tr>
            ))}
          </Tableau>
          <p className="mt-3 text-xs text-gris-500">Justificatifs : PDF, JPEG ou PNG, {Math.round(p.justificatifs.tailleMaxOctets / 1048576)} Mo maximum, {p.justificatifs.maxParDossier} pièces par dossier.</p>
        </Carte>
      </div>
    </>
  );
}
