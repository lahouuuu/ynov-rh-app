'use client';
/**
 * Détail d'une demande de congé. Page statique : l'identifiant est lu dans
 * l'URL (?id=…) et les données chargées depuis l'API, ce qui permet d'afficher
 * les dossiers créés après le déploiement.
 */
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { useAction, useApi } from '../../../lib/hooks';
import { date, instant, joursLong, periode } from '../../../lib/format';
import { STATUTS_DEMANDE, STATUTS_FICHE, TYPES_CONGE } from '../../../lib/libelles';
import type { Demande, EntreeHistorique, Justificatif } from '../../../lib/types';
import { Alerte, Bouton, Carte, Case, Chargement, Champ, classeSaisie, Dialogue, EnTetePage, LienBouton, PastilleDe } from '../../../components/ui';
import { DialogueMotif } from '../../../components/DialogueMotif';
import { Historique } from '../../../components/Historique';
import { Justificatifs } from '../../../components/Justificatifs';

interface Detail {
  demande: Demande;
  actions: string[];
  justificatifs: Justificatif[];
  historique: EntreeHistorique[];
}

type Dialogue = null | 'annuler' | 'demander_annulation' | 'refuser' | 'approuver' | 'annuler_rh' | 'refuser_annulation' | 'avis' | 'refuser_responsable';

function Contenu() {
  const id = useSearchParams().get('id');
  const { donnees, erreur, chargement, recharger } = useApi<Detail>(id ? `/demandes/${id}` : null);
  const action = useAction();
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const [accord, setAccord] = useState(false);
  const [attestation, setAttestation] = useState(false);
  const [succes, setSucces] = useState<string | null>(null);

  if (!id) return <Alerte>Identifiant de demande manquant.</Alerte>;
  if (erreur && !donnees) return <Alerte>{erreur}</Alerte>;
  if (chargement && !donnees) return <Chargement />;
  if (!donnees) return null;
  const { demande: d, actions } = donnees;
  const a = (x: string) => actions.includes(x);

  async function faire(chemin: string, corps: object, message: string) {
    const ok = await action.executer(() => api.post(`/demandes/${d.id}${chemin}`, corps));
    if (ok) {
      setDialogue(null);
      setSucces(message);
      setAccord(false);
      await recharger();
    } else {
      await recharger();
    }
  }

  return (
    <>
      <EnTetePage
        titre={`${TYPES_CONGE[d.type]} — ${d.userNom}`}
        sousTitre={periode(d.dateDebut, d.dateFin, d.demiJourneeDebut, d.demiJourneeFin)}
        actions={<button onClick={() => history.back()} className="text-sm font-semibold text-ynov-turquoise-fonce hover:underline">← Retour</button>}
      />
      <div className="space-y-4">
        {succes && <Alerte ton="succes">{succes}</Alerte>}
        {action.erreur && !dialogue && <Alerte>{action.erreur}</Alerte>}

        {a('reconfirmer') && (
          <Alerte ton="attente" titre="Votre confirmation est nécessaire">
            <p>Votre solde a changé depuis la demande : la répartition payée / non payée doit être recalculée et confirmée avant la décision RH.</p>
            <div className="mt-3 space-y-3">
              <Case coche={accord} onChange={setAccord}>J’accepte que les jours non couverts par mon solde soient en congé non payé.</Case>
              <Bouton enCours={action.enCours} onClick={() => faire('/reconfirmer', { accordNonPaye: accord }, 'Nouvelle répartition confirmée.')}>
                Recalculer et confirmer
              </Bouton>
            </div>
          </Alerte>
        )}
        {d.annulation && d.statut === 'approuvee' && (
          <Alerte ton="attente" titre="Annulation demandée">Motif : {d.annulation.motif}. En attente de la décision RH.</Alerte>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <Carte titre="Demande" className="lg:col-span-2">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-gris-500">Statut</dt><dd className="mt-1"><PastilleDe table={STATUTS_DEMANDE} valeur={d.statut} /></dd></div>
              <div><dt className="text-gris-500">Durée</dt><dd className="mt-1 font-semibold">{joursLong(d.dureeTotale)} ouvrés</dd></div>
              <div><dt className="text-gris-500">Jours payés (décomptés)</dt><dd className="mt-1 font-semibold">{joursLong(d.joursPayes)} {d.plagesPayees.map((p) => `(${date(p.debut)} → ${date(p.fin)})`).join(' ')}</dd></div>
              <div><dt className="text-gris-500">Jours non payés</dt><dd className="mt-1 font-semibold">{joursLong(d.joursNonPayes)} {d.plagesNonPayees.map((p) => `(${date(p.debut)} → ${date(p.fin)})`).join(' ')}</dd></div>
              {d.groupeId && <div className="sm:col-span-2"><dt className="text-gris-500">Remarque</dt><dd className="mt-1">Demande scindée sur deux années (l’autre partie est une demande distincte).</dd></div>}
              {d.interim && <div><dt className="text-gris-500">Intérim</dt><dd className="mt-1">{d.interim}</dd></div>}
              {d.ficheNumero && <div><dt className="text-gris-500">Fiche de congé</dt><dd className="mt-1">N° {d.ficheNumero}</dd></div>}
              {d.commentaire && <div className="sm:col-span-2"><dt className="text-gris-500">Commentaire</dt><dd className="mt-1 whitespace-pre-line">{d.commentaire}</dd></div>}
              {d.soumiseLe && <div><dt className="text-gris-500">Soumise le</dt><dd className="mt-1">{instant(d.soumiseLe)}</dd></div>}
            </dl>
          </Carte>

          <Carte titre="Validation">
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-semibold">Avis du responsable</p>
                <AvisResponsable d={d} />
              </div>
              <div>
                <p className="font-semibold">Décision RH</p>
                {d.decision?.par === 'responsable' && <p className="mt-1 text-gris-600">Non transmise : demande refusée par le responsable.</p>}
                {d.decision && d.decision.par !== 'responsable' && (
                  <p className="mt-1">{STATUTS_DEMANDE[d.decision.statut]?.libelle} — {d.decision.auteurNom}, {instant(d.decision.date)}{d.decision.motif && <><br /><span className="text-gris-600">Motif : {d.decision.motif}</span></>}</p>
                )}
                {!d.decision && <p className="mt-1 text-gris-600">En attente</p>}
              </div>
              <p className="text-xs text-gris-500">Le responsable peut refuser la demande ou la transmettre aux RH avec son avis ; seule la décision RH approuve le congé.</p>
            </div>
          </Carte>
        </div>

        {a('telecharger_fiche') && (
          <div className="flex flex-col gap-3 rounded-xl border border-ynov-turquoise bg-ynov-turquoise/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="flex flex-wrap items-center gap-2 font-bold">
                Fiche de congé F031{d.ficheNumero ? ` n° ${d.ficheNumero}` : ''}
                {d.statut === 'approuvee' && d.ficheStatut && <PastilleDe table={STATUTS_FICHE} valeur={d.ficheStatut} />}
              </p>
              <p className="text-sm text-gris-600">
                {a('signer_direction')
                  ? 'Votre accord (visa de la direction régionale) est attendu sur cette fiche.'
                  : 'Formulaire « Demande de congé » rempli en ligne, avec les visas électroniques de l’employé, de la RAF et de la direction.'}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <LienBouton href={`/conges/fiche?id=${d.id}`} variante="accent">{a('signer_direction') ? 'Ouvrir et signer' : 'Voir la fiche'}</LienBouton>
              <Bouton
                variante="secondaire"
                enCours={action.enCours}
                onClick={async () => {
                  await action.executer(() => api.telecharger(`/demandes/${d.id}/fiche`, 'fiche-conge.pdf'));
                  await recharger();
                }}
              >
                PDF
              </Bouton>
            </div>
          </div>
        )}

        {actions.some((x) => !['deposer_justificatif', 'reconfirmer', 'examiner_justificatifs', 'telecharger_fiche', 'signer_direction'].includes(x)) && (
          <Carte titre="Actions">
            <div className="flex flex-wrap gap-2">
              {a('soumettre') && (
                <div className="w-full space-y-3">
                  {d.joursNonPayes > 0 && d.type === 'conge_paye' && (
                    <Case coche={accord} onChange={setAccord}>J’accepte que {joursLong(d.joursNonPayes)} soient en congé non payé (sous réserve du solde au moment de l’envoi).</Case>
                  )}
                  <Case coche={attestation} onChange={setAttestation}>Je certifie l’exactitude des informations ; cette case vaut signature électronique de ma demande.</Case>
                  <div className="flex flex-wrap gap-2">
                    <Bouton enCours={action.enCours} disabled={!attestation} onClick={() => faire('/soumettre', { accordNonPaye: accord || d.type === 'conge_sans_solde', attestation }, 'Demande signée et soumise.')}>Signer et soumettre</Bouton>
                    {a('modifier') && <LienBouton href={`/conges/nouvelle?id=${d.id}`} variante="secondaire">Modifier le brouillon</LienBouton>}
                  </div>
                </div>
              )}
              {a('avis') && <Bouton variante="accent" onClick={() => setDialogue('avis')}>Transmettre aux RH avec mon avis</Bouton>}
              {a('refuser_responsable') && <Bouton variante="danger" onClick={() => setDialogue('refuser_responsable')}>Refuser la demande</Bouton>}
              {a('approuver') && <Bouton variante="accent" onClick={() => setDialogue('approuver')}>Approuver</Bouton>}
              {a('refuser') && <Bouton variante="danger" onClick={() => setDialogue('refuser')}>Refuser</Bouton>}
              {a('annuler_rh') && d.annulation && (
                <>
                  <Bouton variante="accent" onClick={() => setDialogue('annuler_rh')}>Accepter l’annulation</Bouton>
                  <Bouton variante="danger" onClick={() => setDialogue('refuser_annulation')}>Refuser l’annulation</Bouton>
                </>
              )}
              {a('annuler_rh') && !d.annulation && <Bouton variante="danger" onClick={() => setDialogue('annuler_rh')}>Annuler / régulariser</Bouton>}
              {a('annuler') && <Bouton variante="danger" onClick={() => setDialogue('annuler')}>Annuler la demande</Bouton>}
              {a('demander_annulation') && <Bouton variante="danger" onClick={() => setDialogue('demander_annulation')}>Demander l’annulation</Bouton>}
            </div>
          </Carte>
        )}

        <Justificatifs
          dossierType="demande"
          dossierId={d.id}
          pieces={donnees.justificatifs}
          peutDeposer={a('deposer_justificatif')}
          peutExaminer={a('examiner_justificatifs')}
          onChange={recharger}
        />
        <Historique entrees={donnees.historique} />
      </div>

      <DialogueMotif ouvert={dialogue === 'annuler'} titre="Annuler la demande" obligatoire={false} libelleMotif="Motif (facultatif)" libelleConfirmer="Annuler la demande" variante="danger" enCours={action.enCours} erreur={action.erreur}
        description="Aucun jour n’a encore été débité : l’annulation est immédiate." onFermer={() => setDialogue(null)} onConfirmer={(m) => faire('/annuler', { motif: m }, 'Demande annulée.')} />
      <DialogueMotif ouvert={dialogue === 'demander_annulation'} titre="Demander l’annulation" libelleConfirmer="Envoyer la demande" variante="danger" enCours={action.enCours} erreur={action.erreur}
        description="Ce congé est approuvé : son annulation nécessite une décision RH. Les jours payés seront restitués une seule fois ; les jours non payés ne donnent aucun crédit." onFermer={() => setDialogue(null)} onConfirmer={(m) => faire('/annuler', { motif: m }, 'Demande d’annulation transmise aux RH.')} />
      <DialogueMotif ouvert={dialogue === 'approuver'} titre="Approuver la demande" obligatoire={false} libelleMotif="Commentaire (facultatif)" libelleConfirmer="Approuver" variante="accent" enCours={action.enCours} erreur={action.erreur}
        description={<>Le solde sera revérifié puis {joursLong(d.joursPayes)} seront débités ({joursLong(d.joursNonPayes)} non payés).</>} onFermer={() => setDialogue(null)} onConfirmer={(m) => faire('/decision', { decision: 'approuver', motif: m }, 'Demande approuvée.')} />
      <DialogueMotif ouvert={dialogue === 'refuser'} titre="Refuser la demande" libelleMotif="Motif du refus" libelleConfirmer="Refuser" variante="danger" enCours={action.enCours} erreur={action.erreur}
        description="Le refus est motivé et notifié au collaborateur." onFermer={() => setDialogue(null)} onConfirmer={(m) => faire('/decision', { decision: 'refuser', motif: m }, 'Demande refusée.')} />
      <DialogueMotif ouvert={dialogue === 'annuler_rh'} titre={d.annulation ? 'Accepter l’annulation' : 'Annuler / régulariser ce congé'} libelleConfirmer="Confirmer l’annulation" variante="danger" enCours={action.enCours} erreur={action.erreur}
        description={<>{joursLong(d.joursPayes)} payés seront restitués (une seule fois). {d.dateDebut <= new Date().toISOString().slice(0, 10) && 'Le congé a commencé : l’opération sera tracée comme une régularisation RH.'}</>}
        onFermer={() => setDialogue(null)} onConfirmer={(m) => faire('/annulation/decision', { accepter: true, motif: m }, 'Congé annulé, jours payés restitués.')} />
      <DialogueMotif ouvert={dialogue === 'refuser_annulation'} titre="Refuser l’annulation" libelleConfirmer="Refuser" variante="danger" enCours={action.enCours} erreur={action.erreur}
        onFermer={() => setDialogue(null)} onConfirmer={(m) => faire('/annulation/decision', { accepter: false, motif: m }, 'Demande d’annulation refusée.')} />

      <DialogueAvis ouvert={dialogue === 'avis'} enCours={action.enCours} erreur={action.erreur} onFermer={() => setDialogue(null)}
        onConfirmer={(favorable, commentaire) => faire('/avis', { favorable, commentaire }, 'Avis transmis aux RH.')} />
      <DialogueMotif ouvert={dialogue === 'refuser_responsable'} titre="Refuser la demande" libelleMotif="Motif du refus" libelleConfirmer="Refuser" variante="danger" enCours={action.enCours} erreur={action.erreur}
        description="En tant que responsable, votre refus est définitif : la demande n’est pas transmise aux RH. Le motif est notifié au collaborateur."
        onFermer={() => setDialogue(null)} onConfirmer={(m) => faire('/refus-responsable', { motif: m }, 'Demande refusée.')} />
    </>
  );
}

/** Avis ou refus du responsable hiérarchique, tel qu’affiché dans la carte « Validation ». */
function AvisResponsable({ d }: Readonly<{ d: Demande }>) {
  if (d.decision?.par === 'responsable') {
    return (
      <p className="mt-1">
        Refusée par le responsable — {d.decision.auteurNom}, {instant(d.decision.date)}
        <br />
        <span className="text-gris-600">Motif : {d.decision.motif}</span>
      </p>
    );
  }
  if (!d.avis) {
    return <p className="mt-1 text-gris-600">{d.managerId ? 'En attente' : 'Aucun responsable désigné : transmission directe aux RH.'}</p>;
  }
  return (
    <p className="mt-1">
      {d.avis.favorable ? 'Favorable' : 'Défavorable'} — {d.avis.auteurNom}, {instant(d.avis.date)}
      {d.avis.commentaire && (
        <>
          <br />
          <span className="text-gris-600">« {d.avis.commentaire} »</span>
        </>
      )}
    </p>
  );
}

/** Transmission de la demande aux RH avec l’avis (favorable ou défavorable) du responsable. */
function DialogueAvis({ ouvert, enCours, erreur, onFermer, onConfirmer }: Readonly<{
  ouvert: boolean;
  enCours: boolean;
  erreur: string | null;
  onFermer: () => void;
  onConfirmer: (favorable: boolean, commentaire: string) => void;
}>) {
  const [favorable, setFavorable] = useState(true);
  const [commentaire, setCommentaire] = useState('');
  return (
    <Dialogue ouvert={ouvert} titre="Transmettre aux RH" onFermer={onFermer}>
      <div className="space-y-4">
        {erreur && <Alerte>{erreur}</Alerte>}
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={favorable} onChange={() => setFavorable(true)} className="accent-ynov-turquoise" /> Avis favorable</label>
          <label className="flex items-center gap-2"><input type="radio" checked={!favorable} onChange={() => setFavorable(false)} className="accent-ynov-turquoise" /> Avis défavorable</label>
        </div>
        <Champ label="Commentaire" obligatoire={!favorable}>
          {(cid) => <textarea id={cid} rows={3} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} className={classeSaisie} />}
        </Champ>
        <p className="text-xs text-gris-500">La demande est transmise aux RH, qui prennent la décision finale. Pour refuser vous-même la demande, utilisez « Refuser la demande ».</p>
        <div className="flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={onFermer}>Annuler</Bouton>
          <Bouton enCours={enCours} disabled={!favorable && !commentaire.trim()} onClick={() => onConfirmer(favorable, commentaire)}>
            Transmettre aux RH
          </Bouton>
        </div>
      </div>
    </Dialogue>
  );
}

export default function PageDetailDemande() {
  return (
    <Suspense fallback={<Chargement />}>
      <Contenu />
    </Suspense>
  );
}
