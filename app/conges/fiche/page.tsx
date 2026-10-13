'use client';
/**
 * Fiche F031 en ligne : contenu, visas électroniques (employé, RAF,
 * direction), code de vérification, PDF. La direction régionale y signe
 * l'accord ; aucun autre profil ne voit ce bouton, et le serveur le refuse.
 */
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { useAction, useApi } from '../../../lib/hooks';
import { date } from '../../../lib/format';
import { STATUTS_FICHE } from '../../../lib/libelles';
import type { Demande, Fiche } from '../../../lib/types';
import { Alerte, Bouton, Chargement, EnTetePage, PastilleDe } from '../../../components/ui';
import { Cachet, CaseVerrouillee, FicheF031 } from '../../../components/FicheF031';
import { DialogueMotif } from '../../../components/DialogueMotif';

function Contenu() {
  const id = useSearchParams().get('id');
  const { donnees: fiche, erreur, recharger } = useApi<Fiche>(id ? `/demandes/${id}/fiche/donnees` : null);
  const { donnees: detail, recharger: rechargerDetail } = useApi<{ demande: Demande; actions: string[] }>(id ? `/demandes/${id}` : null);
  const action = useAction();
  const [dialogue, setDialogue] = useState<null | 'accord' | 'refus'>(null);
  const [succes, setSucces] = useState<string | null>(null);

  if (!id) return <Alerte>Identifiant manquant.</Alerte>;
  if (erreur && !fiche) return <Alerte>{erreur}</Alerte>;
  if (!fiche) return <Chargement />;
  const peutSigner = !!detail?.actions.includes('signer_direction');
  const c = fiche.contenu;
  const p = fiche.parametres;

  async function signer(accord: boolean, motif: string) {
    const ok = await action.executer(() => api.post(`/demandes/${id}/direction`, { accord, motif }));
    if (ok) {
      setDialogue(null);
      setSucces(accord ? 'Accord signé : la fiche est complète.' : 'Accord refusé : le congé est annulé et les jours payés restitués.');
      await Promise.all([recharger(), rechargerDetail()]);
    }
  }

  const visa = (v: Fiche['visas']['employe'], attente: string) => (v ? <Cachet visa={v} /> : <CaseVerrouillee texte={attente} />);

  return (
    <>
      <EnTetePage
        titre={`Fiche de congé n° ${fiche.numero}`}
        sousTitre={<span className="inline-flex flex-wrap items-center gap-2">{fiche.ficheStatut ? <PastilleDe table={STATUTS_FICHE} valeur={fiche.ficheStatut} /> : null}{fiche.etat}</span>}
        actions={
          <>
            <Link href={`/conges/detail?id=${id}`} className="self-center text-sm font-semibold text-ynov-turquoise-fonce hover:underline">Voir le dossier</Link>
            <Bouton variante="secondaire" enCours={action.enCours} onClick={() => action.executer(() => api.telecharger(`/demandes/${id}/fiche`, `fiche-${fiche.numero}.pdf`))}>
              Télécharger le PDF
            </Bouton>
          </>
        }
      />
      <div className="space-y-4">
        {succes && <Alerte ton="succes">{succes}</Alerte>}
        {action.erreur && !dialogue && <Alerte>{action.erreur}</Alerte>}
        {peutSigner && (
          <div className="flex flex-col gap-3 rounded-xl border border-ynov-turquoise bg-ynov-turquoise/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">Accord de la direction attendu</p>
              <p className="text-sm text-gris-600">Votre visa électronique sera apposé à votre nom, avec la date et l’heure, pour la période approuvée par les RH.</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Bouton variante="accent" onClick={() => setDialogue('accord')}>Signer l’accord</Bouton>
              <Bouton variante="danger" onClick={() => setDialogue('refus')}>Refuser</Bouton>
            </div>
          </div>
        )}

        <FicheF031
          parametres={p}
          numero={fiche.numero}
          filigrane={fiche.definitive ? undefined : 'Non définitive'}
          champs={[
            ['NOM', c.nom],
            ['Prénom', c.prenom],
            ['Fonction', c.fonction],
            ["Congé au titre de l'année", c.annee],
            ['Nombre de jours ouvrables', c.nombreJours],
            ['Période choisie', c.periode],
            ['Date de reprise', c.reprise],
            ['Reste Acquis', c.resteAcquis],
            ['Intérim', c.interim],
          ]}
          accord={
            fiche.accordDirection ? (
              <span className="font-semibold">{date(fiche.accordDirection.du)} au {date(fiche.accordDirection.au)}</span>
            ) : (
              <CaseVerrouillee texte="Réservé à la direction régionale" />
            )
          }
          colonnes={[
            { titre: 'Signature de l’employé', nom: fiche.visas.employe?.nom ?? c.signataireEmploye, visa: visa(fiche.visas.employe, 'Non signée'), date: fiche.visas.employe?.dateCourte ?? '' },
            { titre: `Signature de la ${p.libelleRaf}`, nom: fiche.visas.raf?.nom ?? <CaseVerrouillee texte={`Réservé à la ${p.libelleRaf}`} />, visa: visa(fiche.visas.raf, 'En attente de la décision RH'), date: fiche.visas.raf?.dateCourte ?? '' },
            { titre: `Signature de la ${p.libelleDirection}`, nom: fiche.visas.direction?.nom ?? <CaseVerrouillee texte="Réservé à la direction" />, visa: visa(fiche.visas.direction, 'En attente de la direction'), date: fiche.visas.direction?.dateCourte ?? '' },
          ]}
        >
          <div className="mt-6 rounded-lg border border-gris-200 bg-gris-50 p-3 text-xs text-gris-600">
            <p>
              <strong>Code de vérification : <span className="font-mono text-ynov-noir">{fiche.code}</span></strong>
            </p>
            <p className="mt-1">
              Les visas sont des signatures électroniques horodatées apposées par leurs titulaires authentifiés. Toute modification d’une fiche imprimée rend ce code invalide (menu « Vérifier une fiche »).
            </p>
          </div>
        </FicheF031>
      </div>

      <DialogueMotif
        ouvert={dialogue === 'accord'}
        titre="Signer l’accord de la direction"
        description={<>Accord pour la période du <strong>{detail ? date(detail.demande.dateDebut) : ''}</strong> au <strong>{detail ? date(detail.demande.dateFin) : ''}</strong>.</>}
        libelleMotif="Commentaire (facultatif)"
        obligatoire={false}
        libelleConfirmer="Signer"
        variante="accent"
        enCours={action.enCours}
        erreur={action.erreur}
        onFermer={() => setDialogue(null)}
        onConfirmer={(m) => signer(true, m)}
      />
      <DialogueMotif
        ouvert={dialogue === 'refus'}
        titre="Refuser l’accord"
        description="Le congé sera annulé et ses jours payés restitués au collaborateur. Le refus est motivé, notifié et tracé."
        libelleMotif="Motif du refus"
        libelleConfirmer="Refuser l’accord"
        variante="danger"
        enCours={action.enCours}
        erreur={action.erreur}
        onFermer={() => setDialogue(null)}
        onConfirmer={(m) => signer(false, m)}
      />
    </>
  );
}

export default function PageFiche() {
  return (
    <Suspense fallback={<Chargement />}>
      <Contenu />
    </Suspense>
  );
}
