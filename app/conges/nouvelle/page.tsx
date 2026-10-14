'use client';
/**
 * Demande de congé saisie directement sur le formulaire F031/DI en ligne.
 *
 * - L'identité (nom, prénom, fonction) vient du compte : elle n'est pas
 *   modifiable, pour qu'on ne puisse pas déposer une fiche au nom d'autrui.
 * - Durée, date de reprise, reste acquis et répartition payée / non payée sont
 *   calculés par le serveur avant tout envoi ; l'accord explicite est demandé
 *   si le solde est insuffisant (aucune conversion automatique).
 * - La case « Je certifie… » vaut signature électronique de l'employé.
 * - Les cases de la RAF et de la direction sont verrouillées : seuls leurs
 *   titulaires peuvent les signer, depuis leur compte.
 * Avec ?id=…, la page modifie un brouillon existant.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ErreurApi, messageErreur, nouvelleCle } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';
import { useSession } from '../../../lib/session';
import { ajouterJours, aujourdhui, date, joursLong } from '../../../lib/format';
import type { Demande, Parametres, Simulation } from '../../../lib/types';
import { Alerte, Bouton, Case, Chargement, classeSaisie, EnTetePage } from '../../../components/ui';
import { CaseVerrouillee, FicheF031 } from '../../../components/FicheF031';

interface Initial {
  id: string | null;
  type: 'conge_paye' | 'conge_sans_solde';
  dateDebut: string;
  dateFin: string;
  demiDebut: boolean;
  demiFin: boolean;
  commentaire: string;
  interim: string;
}

function Plages({ titre, plages, ton }: { titre: string; plages: Simulation['periodes'][number]['repartition']['plagesPayees']; ton: 'payes' | 'non' }) {
  if (!plages.length) return null;
  return (
    <div className={`rounded-lg border p-3 ${ton === 'payes' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-gris-600">{titre}</p>
      {plages.map((p) => (
        <p key={p.debut} className="mt-1 text-sm font-semibold">
          {p.debut === p.fin ? date(p.debut) : `${date(p.debut)} → ${date(p.fin)}`} · {joursLong(p.jours)}
        </p>
      ))}
    </div>
  );
}

const Calcule = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-2">
    {children}
    <span className="rounded bg-gris-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gris-500">calculé</span>
  </span>
);

function Formulaire({ initial, parametres }: { initial: Initial; parametres: Parametres }) {
  const router = useRouter();
  const { profil } = useSession();
  const [type, setType] = useState(initial.type);
  const [dateDebut, setDateDebut] = useState(initial.dateDebut);
  const [dateFin, setDateFin] = useState(initial.dateFin);
  const [demiDebut, setDemiDebut] = useState(initial.demiDebut);
  const [demiFin, setDemiFin] = useState(initial.demiFin);
  const [commentaire, setCommentaire] = useState(initial.commentaire);
  const [interim, setInterim] = useState(initial.interim);
  const [attestation, setAttestation] = useState(false);
  const saisieValide = !!dateDebut && !!dateFin && dateFin >= dateDebut;
  const cleSaisie = JSON.stringify([type, dateDebut, dateFin, demiDebut, demiFin]);
  const [accordEtat, setAccordEtat] = useState({ cle: '', valeur: false });
  const accord = accordEtat.cle === cleSaisie && accordEtat.valeur;
  const setAccord = (valeur: boolean) => setAccordEtat({ cle: cleSaisie, valeur });
  const [simEtat, setSimEtat] = useState<{ cle: string; sim: Simulation | null; erreur: string | null }>({ cle: '', sim: null, erreur: null });
  const sim = saisieValide ? simEtat.sim : null;
  const erreurSim = saisieValide && simEtat.cle === cleSaisie ? simEtat.erreur : null;
  const calcul = saisieValide && simEtat.cle !== cleSaisie;
  const [envoi, setEnvoi] = useState<null | 'brouillon' | 'soumettre'>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = useRef(nouvelleCle());

  useEffect(() => {
    if (!saisieValide) return;
    const minuteur = setTimeout(async () => {
      try {
        const r = await api.post<Simulation>('/demandes/simulation', { type, dateDebut, dateFin, demiJourneeDebut: demiDebut, demiJourneeFin: demiFin });
        setSimEtat({ cle: cleSaisie, sim: r, erreur: null });
      } catch (e) {
        setSimEtat({ cle: cleSaisie, sim: null, erreur: messageErreur(e) });
      }
    }, 300);
    return () => clearTimeout(minuteur);
  }, [type, dateDebut, dateFin, demiDebut, demiFin, saisieValide, cleSaisie]);

  const accordNecessaire = type === 'conge_paye' && !!sim?.insuffisant;
  const calculOk = !!sim && sim.dureeTotale > 0 && !calcul && (!accordNecessaire || accord);
  const derniere = sim?.periodes[sim.periodes.length - 1];

  async function envoyer(soumettre: boolean) {
    setErreur(null);
    setEnvoi(soumettre ? 'soumettre' : 'brouillon');
    const saisie = { type, dateDebut, dateFin, demiJourneeDebut: demiDebut, demiJourneeFin: demiFin, commentaire, interim };
    const accordNonPaye = type === 'conge_sans_solde' ? true : accord;
    try {
      if (initial.id) {
        await api.put(`/demandes/${initial.id}`, saisie);
        if (soumettre) await api.post(`/demandes/${initial.id}/soumettre`, { accordNonPaye, attestation });
        router.push(`/conges/detail?id=${initial.id}`);
        return;
      }
      const r = await api.post<{ ids: string[] }>('/demandes', { ...saisie, accordNonPaye, soumettre, attestation, cleIdempotence: cle.current });
      cle.current = nouvelleCle();
      router.push(r.ids.length === 1 ? (soumettre ? `/conges/fiche?id=${r.ids[0]}` : `/conges/detail?id=${r.ids[0]}`) : '/conges');
    } catch (e) {
      setErreur(messageErreur(e));
      if (e instanceof ErreurApi && e.code === 'ACCORD_REQUIS' && e.details) {
        setSimEtat({ cle: cleSaisie, sim: e.details as Simulation, erreur: null });
        setAccordEtat({ cle: '', valeur: false });
      }
    } finally {
      setEnvoi(null);
    }
  }

  const aujourdhuiCourt = date(aujourdhui(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  const enAttente = <span className="text-gris-400">{calcul ? 'calcul…' : '—'}</span>;

  return (
    <>
      <EnTetePage
        titre={initial.id ? 'Modifier le brouillon' : 'Demande de congé'}
        sousTitre="Remplissez le formulaire en ligne. Les champs calculés et les cases réservées à la RAF et à la direction ne sont pas modifiables."
      />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <FicheF031
          parametres={parametres.fiche}
          numero={<span className="font-normal text-gris-500">attribué à l’envoi</span>}
          champs={[
            ['NOM', <span key="n" className="uppercase">{profil?.nom}</span>],
            ['Prénom', profil?.prenom],
            ['Fonction', profil?.fonction || <span className="text-gris-400">non renseignée (à demander à l’administrateur)</span>],
            ['Type de congé', (
              <select key="t" aria-label="Type de congé" value={type} onChange={(e) => setType(e.target.value as Initial['type'])} className={`${classeSaisie} max-w-sm`}>
                <option value="conge_paye">Congé payé (décompté du solde)</option>
                <option value="conge_sans_solde">Congé sans solde (non payé)</option>
              </select>
            )],
            ["Congé au titre de l'année", <Calcule key="a">{dateDebut ? dateDebut.slice(0, 4) : '—'}</Calcule>],
            ['Période choisie', (
              <div key="p" className="flex flex-wrap items-start gap-3">
                <div className="space-y-1">
                  <label htmlFor="date-debut" className="block text-xs text-gris-500">Du</label>
                  <input id="date-debut" aria-label="Date de début" type="date" min={initial.id ? undefined : aujourdhui()} value={dateDebut} onChange={(e) => { setDateDebut(e.target.value); if (e.target.value > dateFin) setDateFin(e.target.value); }} className={`${classeSaisie} w-44`} />
                  <Case coche={demiDebut} onChange={setDemiDebut}>à partir de l’après-midi</Case>
                </div>
                <div className="space-y-1">
                  <label htmlFor="date-fin" className="block text-xs text-gris-500">au (inclus)</label>
                  <input id="date-fin" aria-label="Date de fin" type="date" min={dateDebut} value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={`${classeSaisie} w-44`} />
                  <Case coche={demiFin} onChange={setDemiFin}>jusqu’à midi</Case>
                </div>
              </div>
            )],
            ['Nombre de jours ouvrables', <Calcule key="j">{sim ? joursLong(sim.dureeTotale) : enAttente}</Calcule>],
            ['Date de reprise', <Calcule key="r">{sim?.reprise ?? enAttente}</Calcule>],
            ['Reste Acquis', <Calcule key="ra">{derniere ? `${joursLong(Math.max(0, derniere.soldeApres))} après ce congé (${derniere.annee})` : enAttente}</Calcule>],
            ['Intérim', <input key="i" aria-label="Intérim" type="text" maxLength={150} placeholder="Personne qui assure vos missions (facultatif)" value={interim} onChange={(e) => setInterim(e.target.value)} className={`${classeSaisie} max-w-md`} />],
            ['Commentaire', <textarea key="c" aria-label="Commentaire" rows={2} maxLength={1000} placeholder="Facultatif" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} className={`${classeSaisie} max-w-md`} />],
          ]}
          accord={<CaseVerrouillee texte="Réservé à la direction régionale" />}
          colonnes={[
            {
              titre: 'Signature de l’employé',
              nom: <span className="font-semibold">{profil?.nomComplet}</span>,
              visa: (
                <div className="text-left">
                  <Case coche={attestation} onChange={setAttestation}>
                    <span className="text-xs">Je certifie l’exactitude des informations ; cette case vaut <strong>signature électronique</strong>.</span>
                  </Case>
                </div>
              ),
              date: attestation ? <span className="font-semibold">{aujourdhuiCourt}</span> : <span className="text-gris-400">à la signature</span>,
            },
            { titre: `Signature de la ${parametres.fiche.libelleRaf}`, nom: <CaseVerrouillee texte={`Réservé à la ${parametres.fiche.libelleRaf}`} />, visa: <CaseVerrouillee texte="Visa à la décision RH" />, date: '' },
            { titre: `Signature de la ${parametres.fiche.libelleDirection}`, nom: <CaseVerrouillee texte="Réservé à la direction" />, visa: <CaseVerrouillee texte="Visa de la direction" />, date: '' },
          ]}
        />

        <div className="space-y-4">
          <div className="rounded-xl border border-gris-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-bold">Décompte</h2>
            {erreurSim && <Alerte>{erreurSim}</Alerte>}
            {!sim && !erreurSim && <p className="text-sm text-gris-600">{calcul ? 'Calcul en cours…' : 'Choisissez vos dates.'}</p>}
            {sim && (
              <div className={`space-y-3 ${calcul ? 'opacity-60' : ''}`}>
                {sim.scindee && <Alerte ton="info">Cette période traverse deux années : elle sera enregistrée en deux demandes.</Alerte>}
                {sim.periodes.map((p) => (
                  <div key={p.annee} className="space-y-2">
                    {sim.scindee && <p className="text-sm font-bold">Année {p.annee}</p>}
                    <dl className="grid grid-cols-2 gap-1 text-sm">
                      <dt className="text-gris-600">Solde avant</dt><dd className="text-right font-semibold">{joursLong(p.soldeAvant)}</dd>
                      {p.enAttente > 0 && (<><dt className="text-gris-600">Déjà engagés</dt><dd className="text-right font-semibold">{joursLong(p.enAttente)}</dd></>)}
                      <dt className="text-gris-600">Solde après</dt><dd className="text-right font-bold text-ynov-turquoise-fonce">{joursLong(p.soldeApres)}</dd>
                    </dl>
                    <Plages titre="Jours payés (décomptés)" plages={p.repartition.plagesPayees} ton="payes" />
                    <Plages titre="Jours non payés" plages={p.repartition.plagesNonPayees} ton="non" />
                  </div>
                ))}
                {sim.dureeTotale === 0 && <Alerte ton="attente">Aucun jour ouvré sur cette période.</Alerte>}
                {accordNecessaire && (
                  <Alerte ton="attente" titre="Solde insuffisant">
                    <p>
                      Votre solde couvre {joursLong(sim.joursPayes)} sur {joursLong(sim.dureeTotale)}. Les {joursLong(sim.joursNonPayes)} restants peuvent être
                      demandés en <strong>congé non payé</strong> ; vous pouvez aussi modifier la période ou abandonner.
                    </p>
                    <div className="mt-2">
                      <Case coche={accord} onChange={setAccord}>J’accepte que {joursLong(sim.joursNonPayes)} soient en congé non payé.</Case>
                    </div>
                  </Alerte>
                )}
              </div>
            )}
          </div>
          {erreur && <Alerte>{erreur}</Alerte>}
          <Bouton className="w-full" disabled={!calculOk || !attestation || !!envoi} enCours={envoi === 'soumettre'} onClick={() => envoyer(true)}>
            Signer et envoyer la demande
          </Bouton>
          {!attestation && calculOk && <p className="text-xs text-gris-500">Cochez la case de certification dans la colonne « Signature de l’employé ».</p>}
          <Bouton variante="secondaire" className="w-full" disabled={!saisieValide || !!envoi || (!!sim && sim.dureeTotale === 0)} enCours={envoi === 'brouillon'} onClick={() => envoyer(false)}>
            Enregistrer en brouillon (sans signer)
          </Bouton>
          <p className="text-xs text-gris-500">Le solde n’est débité qu’après la décision des RH. Votre responsable donne ensuite son avis, la RAF et la direction signent depuis leur propre compte.</p>
        </div>
      </div>
    </>
  );
}

function Chargeur() {
  const id = useSearchParams().get('id');
  const { donnees: parametres, erreur: erreurP } = useApi<Parametres>('/parametres');
  const { donnees: detail, erreur } = useApi<{ demande: Demande; actions: string[] }>(id ? `/demandes/${id}` : null);
  if (erreurP || erreur) return <Alerte>{erreurP ?? erreur}</Alerte>;
  if (!parametres || (id && !detail)) return <Chargement />;
  if (id && detail && !detail.actions.includes('modifier')) {
    return <Alerte>Cette demande n’est plus un brouillon : elle ne peut plus être modifiée.</Alerte>;
  }
  const demain = ajouterJours(aujourdhui(), 1);
  const d = detail?.demande;
  const initial: Initial = d
    ? { id: d.id, type: d.type, dateDebut: d.dateDebut, dateFin: d.dateFin, demiDebut: d.demiJourneeDebut, demiFin: d.demiJourneeFin, commentaire: d.commentaire, interim: d.interim ?? '' }
    : { id: null, type: 'conge_paye', dateDebut: demain, dateFin: demain, demiDebut: false, demiFin: false, commentaire: '', interim: '' };
  return <Formulaire key={initial.id ?? 'nouvelle'} initial={initial} parametres={parametres} />;
}

export default function PageNouvelleDemande() {
  return (
    <Suspense fallback={<Chargement />}>
      <Chargeur />
    </Suspense>
  );
}
