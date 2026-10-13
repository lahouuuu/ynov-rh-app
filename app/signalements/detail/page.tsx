'use client';
/** Détail d'un signalement : compléments, prise de connaissance, traitement RH. */
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { useAction, useApi } from '../../../lib/hooks';
import { ajouterJours, aujourdhui, date, instant, periode } from '../../../lib/format';
import { QUALIFICATIONS, STATUTS_JUSTIFICATIF, STATUTS_TRAITEMENT } from '../../../lib/libelles';
import type { EntreeHistorique, Justificatif, Signalement } from '../../../lib/types';
import { Alerte, Bouton, Carte, Chargement, Champ, classeSaisie, EnTetePage, PastilleDe } from '../../../components/ui';
import { Historique } from '../../../components/Historique';
import { Justificatifs } from '../../../components/Justificatifs';

interface Detail {
  signalement: Signalement;
  actions: string[];
  justificatifs: Justificatif[];
  historique: EntreeHistorique[];
}

function FormulaireComplement({ s, onFait }: { s: Signalement; onFait: (m: string) => void }) {
  const action = useAction();
  const [dateFin, setDateFin] = useState(s.dateFin ?? '');
  const [dureeEstimee, setDureeEstimee] = useState(s.dureeEstimee ?? '');
  const [heureEstimee, setHeureEstimee] = useState(s.retard?.heureArriveeEstimee ?? '');
  const [heureReelle, setHeureReelle] = useState(s.retard?.heureArriveeReelle ?? '');
  const [motif, setMotif] = useState('');

  const corps: Record<string, string | null> = {};
  if (s.type === 'absence') {
    if ((dateFin || null) !== s.dateFin) corps.dateFin = dateFin || null;
    if (dureeEstimee !== (s.dureeEstimee ?? '')) corps.dureeEstimee = dureeEstimee;
  } else if (s.retard) {
    if ((heureEstimee || null) !== s.retard.heureArriveeEstimee) corps.heureArriveeEstimee = heureEstimee || null;
    if ((heureReelle || null) !== s.retard.heureArriveeReelle) corps.heureArriveeReelle = heureReelle || null;
  }
  const valeursAvant: Record<string, unknown> = { dateFin: s.dateFin, dureeEstimee: s.dureeEstimee, heureArriveeEstimee: s.retard?.heureArriveeEstimee, heureArriveeReelle: s.retard?.heureArriveeReelle };
  const estCorrection = Object.keys(corps).some((k) => valeursAvant[k] !== null && valeursAvant[k] !== undefined && valeursAvant[k] !== '');
  const modifie = Object.keys(corps).length > 0;

  async function enregistrer() {
    const ok = await action.executer(() => api.patch(`/signalements/${s.id}`, { ...corps, motif: motif || undefined }));
    if (ok) {
      setMotif('');
      onFait(estCorrection ? 'Correction enregistrée.' : 'Informations complétées.');
    }
  }

  return (
    <Carte titre={s.type === 'absence' ? 'Compléter ou corriger' : 'Arrivée'}>
      <div className="space-y-4">
        {s.type === 'absence' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Date de fin">{(id) => <input id={id} type="date" min={s.dateDebut} value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={classeSaisie} />}</Champ>
            <Champ label="Durée estimée">{(id) => <input id={id} type="text" maxLength={100} value={dureeEstimee} onChange={(e) => setDureeEstimee(e.target.value)} className={classeSaisie} />}</Champ>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Arrivée estimée">{(id) => <input id={id} type="time" value={heureEstimee} onChange={(e) => setHeureEstimee(e.target.value)} className={classeSaisie} />}</Champ>
            <Champ label="Arrivée réelle" aide="Détermine la durée définitive du retard.">{(id) => <input id={id} type="time" value={heureReelle} onChange={(e) => setHeureReelle(e.target.value)} className={classeSaisie} />}</Champ>
          </div>
        )}
        {estCorrection && (
          <Champ label="Motif de la correction" obligatoire aide="Toute correction conserve son auteur, sa date et son motif.">
            {(id) => <input id={id} type="text" value={motif} onChange={(e) => setMotif(e.target.value)} className={classeSaisie} />}
          </Champ>
        )}
        {action.erreur && <Alerte>{action.erreur}</Alerte>}
        <Bouton variante="secondaire" disabled={!modifie || (estCorrection && !motif.trim())} enCours={action.enCours} onClick={enregistrer}>
          Enregistrer
        </Bouton>
      </div>
    </Carte>
  );
}

function TraitementRh({ s, onFait, peutImputer }: { s: Signalement; onFait: (m: string) => void; peutImputer: boolean }) {
  const action = useAction();
  const [qualification, setQualification] = useState(s.qualification);
  const [statut, setStatut] = useState(s.statutTraitement);
  const [motif, setMotif] = useState('');
  const [demander, setDemander] = useState(false);
  const [imputer, setImputer] = useState(false);
  const [echeance, setEcheance] = useState(ajouterJours(aujourdhui(), 3));

  async function enregistrer() {
    const corps: Record<string, unknown> = { motif };
    if (qualification !== s.qualification) corps.qualification = qualification;
    if (statut !== s.statutTraitement) corps.statutTraitement = statut;
    if (demander) corps.demanderJustificatif = { echeance };
    if (imputer) corps.imputerConges = true;
    const ok = await action.executer(() => api.post(`/signalements/${s.id}/traitement`, corps));
    if (ok) {
      setMotif('');
      setDemander(false);
      onFait('Traitement enregistré.');
    }
  }

  return (
    <Carte titre="Traitement RH">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Qualification">
            {(id) => (
              <select id={id} value={qualification} onChange={(e) => setQualification(e.target.value)} className={classeSaisie}>
                {Object.entries(QUALIFICATIONS).map(([v, q]) => <option key={v} value={v}>{q.libelle}</option>)}
              </select>
            )}
          </Champ>
          <Champ label="Statut de traitement">
            {(id) => (
              <select id={id} value={statut} onChange={(e) => setStatut(e.target.value)} className={classeSaisie}>
                {Object.entries(STATUTS_TRAITEMENT).map(([v, q]) => <option key={v} value={v}>{q.libelle}</option>)}
              </select>
            )}
          </Champ>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={demander} onChange={(e) => setDemander(e.target.checked)} className="h-4 w-4 accent-ynov-turquoise" />
          Demander un justificatif (complément)
        </label>
        {peutImputer && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={imputer} onChange={(e) => setImputer(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ynov-turquoise" />
            <span>
              Imputer cette absence sur le solde de congés
              <span className="block text-xs text-gris-500">Validation hiérarchique obtenue. Les jours ouvrés de l’absence sont décomptés (motif obligatoire, opération tracée, bloquée si le solde est insuffisant).</span>
            </span>
          </label>
        )}
        {demander && (
          <Champ label="Échéance de dépôt">{(id) => <input id={id} type="date" min={aujourdhui()} value={echeance} onChange={(e) => setEcheance(e.target.value)} className={classeSaisie} />}</Champ>
        )}
        <Champ label="Motif / commentaire" obligatoire={qualification === 'non_justifie' || imputer} aide="Obligatoire pour une qualification « non justifié » ou une imputation sur les congés.">
          {(id) => <textarea id={id} rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} className={classeSaisie} />}
        </Champ>
        {action.erreur && <Alerte>{action.erreur}</Alerte>}
        <Bouton enCours={action.enCours} disabled={((qualification === 'non_justifie' && qualification !== s.qualification) || imputer) && !motif.trim()} onClick={enregistrer}>
          Enregistrer la décision
        </Bouton>
      </div>
    </Carte>
  );
}

function Contenu() {
  const id = useSearchParams().get('id');
  const { donnees, erreur, chargement, recharger } = useApi<Detail>(id ? `/signalements/${id}` : null);
  const action = useAction();
  const [succes, setSucces] = useState<string | null>(null);

  if (!id) return <Alerte>Identifiant manquant.</Alerte>;
  if (erreur && !donnees) return <Alerte>{erreur}</Alerte>;
  if (chargement && !donnees) return <Chargement />;
  if (!donnees) return null;
  const { signalement: s, actions } = donnees;
  const a = (x: string) => actions.includes(x);
  const fait = async (m: string) => {
    setSucces(m);
    await recharger();
  };

  return (
    <>
      <EnTetePage
        titre={`${s.type === 'absence' ? 'Absence' : 'Retard'} — ${s.userNom}`}
        sousTitre={s.type === 'absence' ? periode(s.dateDebut, s.dateFin) : date(s.dateDebut)}
        actions={<button onClick={() => history.back()} className="text-sm font-semibold text-ynov-turquoise-fonce hover:underline">← Retour</button>}
      />
      <div className="space-y-4">
        {succes && <Alerte ton="succes">{succes}</Alerte>}
        {action.erreur && <Alerte>{action.erreur}</Alerte>}

        <div className="grid gap-4 lg:grid-cols-3">
          <Carte titre="Signalement" className="lg:col-span-2">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-gris-500">Motif</dt><dd className="mt-1 font-semibold">{s.categorieLibelle}</dd></div>
              <div><dt className="text-gris-500">Déclaré le</dt><dd className="mt-1">{instant(s.declareLe)}{s.aPosteriori && ' (a posteriori)'}</dd></div>
              {s.type === 'absence' ? (
                <>
                  <div><dt className="text-gris-500">Période</dt><dd className="mt-1">{periode(s.dateDebut, s.dateFin)}{!s.dateFin && ' (fin à préciser)'}</dd></div>
                  <div><dt className="text-gris-500">Durée estimée</dt><dd className="mt-1">{s.dureeEstimee || '—'}</dd></div>
                </>
              ) : (
                s.retard && (
                  <>
                    <div><dt className="text-gris-500">Prise de poste prévue</dt><dd className="mt-1">{s.retard.heurePrevue}</dd></div>
                    <div><dt className="text-gris-500">Arrivée estimée / réelle</dt><dd className="mt-1">{s.retard.heureArriveeEstimee ?? '—'} / {s.retard.heureArriveeReelle ?? '—'}</dd></div>
                    <div><dt className="text-gris-500">Durée du retard</dt><dd className="mt-1 font-semibold">{s.retard.minutes != null ? `${s.retard.minutes} min` : 'En attente de l’heure d’arrivée réelle'}</dd></div>
                  </>
                )
              )}
              {s.commentaire && <div className="sm:col-span-2"><dt className="text-gris-500">Commentaire</dt><dd className="mt-1 whitespace-pre-line">{s.commentaire}</dd></div>}
            </dl>
          </Carte>
          <Carte titre="Suivi">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-gris-500">Traitement</dt><dd className="mt-1"><PastilleDe table={STATUTS_TRAITEMENT} valeur={s.statutTraitement} /></dd></div>
              <div><dt className="text-gris-500">Qualification RH</dt><dd className="mt-1"><PastilleDe table={QUALIFICATIONS} valeur={s.qualification} />{s.decision?.motif && <span className="mt-1 block text-gris-600">Motif : {s.decision.motif}</span>}</dd></div>
              <div><dt className="text-gris-500">Justificatif</dt><dd className="mt-1"><PastilleDe table={STATUTS_JUSTIFICATIF} valeur={s.justificatifStatut} />{s.echeanceJustificatif && ['a_fournir', 'refuse'].includes(s.justificatifStatut) && <span className="mt-1 block text-gris-600">Échéance : {date(s.echeanceJustificatif)}</span>}</dd></div>
              <div><dt className="text-gris-500">Responsable</dt><dd className="mt-1">{s.priseConnaissance ? `Pris connaissance — ${s.priseConnaissance.parNom}, ${instant(s.priseConnaissance.date)}` : 'Pas encore consulté'}</dd></div>
              {s.imputation && <div><dt className="text-gris-500">Imputation sur les congés</dt><dd className="mt-1">{s.imputation.jours} j décomptés ({s.imputation.annee}) — {s.imputation.parNom}</dd></div>}
            </dl>
            {a('prendre_connaissance') && (
              <Bouton className="mt-4 w-full" variante="accent" enCours={action.enCours} onClick={async () => { if (await action.executer(() => api.post(`/signalements/${s.id}/prise-connaissance`))) await fait('Prise de connaissance enregistrée.'); }}>
                J’ai pris connaissance
              </Bouton>
            )}
            <p className="mt-3 text-xs text-gris-500">La prise de connaissance par le responsable ne remplace pas la décision RH.</p>
          </Carte>
        </div>

        {a('completer') && <FormulaireComplement s={s} onFait={fait} />}
        {a('traiter') && <TraitementRh s={s} onFait={fait} peutImputer={a('imputer_conges')} />}
        <Justificatifs
          dossierType="signalement"
          dossierId={s.id}
          pieces={donnees.justificatifs}
          nombreTotal={s.nbJustificatifs}
          peutDeposer={a('deposer_justificatif')}
          peutExaminer={a('traiter')}
          onChange={recharger}
          consigne={
            s.justificatifStatut === 'a_fournir' && a('deposer_justificatif') ? (
              <Alerte ton="attente">Un justificatif est attendu{s.echeanceJustificatif ? ` avant le ${date(s.echeanceJustificatif)}` : ''}.</Alerte>
            ) : s.justificatifStatut === 'refuse' && a('deposer_justificatif') ? (
              <Alerte ton="attente">Votre justificatif a été refusé : vous pouvez fournir un complément.</Alerte>
            ) : undefined
          }
        />
        <Historique entrees={donnees.historique} />
      </div>
    </>
  );
}

export default function PageDetailSignalement() {
  return (
    <Suspense fallback={<Chargement />}>
      <Contenu />
    </Suspense>
  );
}
