/**
 * Service des demandes de congé : simulation, création, soumission, avis,
 * décision RH, reconfirmation, annulation et restitution.
 *
 * Toutes les opérations qui touchent au solde s'exécutent dans une transaction
 * Firestore qui lit la dotation de l'année : deux opérations concurrentes sur le
 * même collaborateur et la même année sont donc sérialisées (pas de double
 * débit, pas de chevauchement accepté deux fois).
 */
import { DocumentSnapshot, FieldValue, Transaction } from 'firebase-admin/firestore';
import { COL, db } from '../infra/firebase';
import { conflit, interdit, introuvable, invalide } from '../infra/erreurs';
import {
  aujourdhui,
  chevauche,
  joursOuvresDeLaPeriode,
  OptionsPeriode,
  scinderParAnnee,
} from '../domain/calendrier';
import { calculerSolde, formaterJours, repartir, repartitionCouverte } from '../domain/solde';
import { enDemi, enJours } from '../domain/calendrier';
import { randomBytes } from 'node:crypto';
import { dateDeReprise } from '../domain/fiche';
import { estProprietaire, peutDecider, peutDonnerAvis, peutSignerDirection, peutVoirDemande } from '../domain/authz';
import { statutApresSoumission, transitionAutorisee } from '../domain/workflow';
import { Parametres, Repartition, STATUTS_ACTIFS, StatutDemande, TypeConge, Utilisateur } from '../domain/types';
import { lireParametres } from './parametres';
import { ajouterMouvement, creerDotationSiAbsente, joursEnAttenteTx, lireDotation, lireDotationTx } from './dotations';
import { journaliser, notifier } from './journal';
import { nomComplet, rhDuCampus, utilisateursDuRole, versUtilisateur } from './utilisateurs';

export type StatutFiche = 'attente_direction' | 'signee' | 'refusee_direction' | 'annulee';

export interface Visa {
  uid: string;
  nom: string;
  fonction: string;
  date: unknown;
}

export interface Signatures {
  employe: Visa | null;
  raf: Visa | null;
  direction: (Visa & { accordDu: string; accordAu: string }) | null;
}

/** Visa électronique de l'acteur authentifié (horodatage serveur). */
function visa(u: Utilisateur): Visa {
  return { uid: u.uid, nom: nomComplet(u), fonction: u.fonction ?? '', date: FieldValue.serverTimestamp() };
}

const ATTESTATION_REQUISE =
  'Cochez la case « Je certifie l’exactitude des informations » : elle vaut signature électronique de la demande.';

export interface SaisieDemande {
  type: TypeConge;
  dateDebut: string;
  dateFin: string;
  demiJourneeDebut?: boolean;
  demiJourneeFin?: boolean;
  commentaire?: string;
  /** Personne assurant l'intérim (facultatif, reporté sur la fiche). */
  interim?: string;
}

export interface Demande {
  id: string;
  userId: string;
  userNom: string;
  managerId: string | null;
  campusId: string;
  serviceId: string;
  type: TypeConge;
  annee: number;
  dateDebut: string;
  dateFin: string;
  demiJourneeDebut: boolean;
  demiJourneeFin: boolean;
  commentaire: string;
  interim?: string;
  /** Numéro attribué à la première édition de la fiche papier. */
  ficheNumero?: string | null;
  /** Sel aléatoire du code de vérification de la fiche. */
  ficheSel?: string;
  /** État de la fiche F031 : en attente de l'accord de la direction, signée, refusée… */
  ficheStatut?: StatutFiche | null;
  /** Visas électroniques : apposés UNIQUEMENT par le serveur, jamais reçus du client. */
  signatures?: Signatures;
  statut: StatutDemande;
  dureeTotale: number;
  joursPayes: number;
  joursNonPayes: number;
  plagesPayees: Repartition['plagesPayees'];
  plagesNonPayees: Repartition['plagesNonPayees'];
  accordNonPaye: boolean;
  reconfirmationRequise: boolean;
  debitEffectue: boolean;
  restitutionEffectuee: boolean;
  groupeId: string | null;
  avis: null | { favorable: boolean; commentaire: string; auteurId: string; auteurNom: string; date: unknown };
  decision: null | { statut: StatutDemande; motif: string; auteurId: string; auteurNom: string; date: unknown; par?: 'responsable' | 'rh' };
  annulation: null | { demandeeLe: unknown; motif: string; demandeeParId: string };
}

const lien = (id: string) => `/conges/detail?id=${id}`;

export function versDemande(snap: DocumentSnapshot): Demande {
  return { id: snap.id, ...(snap.data() as Omit<Demande, 'id'>) };
}

function optionsDe(s: SaisieDemande): OptionsPeriode {
  return { demiJourneeDebut: !!s.demiJourneeDebut, demiJourneeFin: !!s.demiJourneeFin };
}

// ---------------------------------------------------------------------------
// Simulation (aucune écriture)
// ---------------------------------------------------------------------------

export interface PeriodeSimulee {
  annee: number;
  dateDebut: string;
  dateFin: string;
  demiJourneeDebut: boolean;
  demiJourneeFin: boolean;
  soldeAvant: number;
  enAttente: number;
  soldePrevisionnel: number;
  repartition: Repartition;
  soldeApres: number;
}

export interface Simulation {
  periodes: PeriodeSimulee[];
  scindee: boolean;
  insuffisant: boolean;
  dureeTotale: number;
  joursPayes: number;
  joursNonPayes: number;
  /** Date de reprise du travail (libellé), comme sur la fiche F031. */
  reprise?: string;
}

/**
 * Calcule, pour chaque année couverte, la durée en jours ouvrés, le solde avant
 * et après, et la répartition payée / non payée proposée.
 */
export async function simuler(user: Utilisateur, s: SaisieDemande, params?: Parametres): Promise<Simulation> {
  const p = params ?? (await lireParametres());
  const morceaux = scinderParAnnee(s.dateDebut, s.dateFin, optionsDe(s));
  const periodes: PeriodeSimulee[] = [];
  for (const m of morceaux) {
    const jours = joursOuvresDeLaPeriode(m.debut, m.fin, p, m.options);
    const dot = await lireDotation(user.uid, m.annee, p.dotationParDefaut);
    const enAttente = await joursEnAttenteTx(null, user.uid, m.annee);
    periodes.push(construirePeriode(m, jours, calculerSolde(dot), enAttente, s.type));
  }
  return { ...resumer(periodes), reprise: dateDeReprise(s.dateFin, !!s.demiJourneeFin, p).libelle };
}

function construirePeriode(
  m: { annee: number; debut: string; fin: string; options: OptionsPeriode },
  jours: ReturnType<typeof joursOuvresDeLaPeriode>,
  solde: number,
  enAttente: number,
  type: TypeConge,
): PeriodeSimulee {
  const soldePrevisionnel = Math.max(0, enJours(enDemi(solde) - enDemi(enAttente)));
  const repartition = repartir(jours, soldePrevisionnel, type);
  return {
    annee: m.annee,
    dateDebut: m.debut,
    dateFin: m.fin,
    demiJourneeDebut: !!m.options.demiJourneeDebut,
    demiJourneeFin: !!m.options.demiJourneeFin,
    soldeAvant: solde,
    enAttente,
    soldePrevisionnel,
    repartition,
    soldeApres: enJours(enDemi(solde) - enDemi(repartition.joursPayes)),
  };
}

function resumer(periodes: PeriodeSimulee[]): Simulation {
  const somme = (f: (p: PeriodeSimulee) => number) => enJours(periodes.reduce((a, p) => a + enDemi(f(p)), 0));
  const joursNonPayes = somme((p) => p.repartition.joursNonPayes);
  return {
    periodes,
    scindee: periodes.length > 1,
    insuffisant: joursNonPayes > 0,
    dureeTotale: somme((p) => p.repartition.dureeTotale),
    joursPayes: somme((p) => p.repartition.joursPayes),
    joursNonPayes,
  };
}

function verifierSaisie(s: SaisieDemande, jours: number) {
  if (jours <= 0) {
    throw invalide("La période choisie ne contient aucun jour ouvré (week-end ou jour férié).");
  }
  if (s.dateDebut < aujourdhui()) {
    throw invalide(
      'La date de début est passée. Une correction après le début du congé relève d’une régularisation RH.',
    );
  }
}

/** Demande de confirmation explicite lorsque des jours ne sont pas couverts. */
function exigerAccord(type: TypeConge, rep: Repartition, accord: boolean | undefined, sim?: unknown) {
  if (type === 'conge_paye' && rep.joursNonPayes > 0 && !accord) {
    throw conflit(
      'ACCORD_REQUIS',
      `Votre solde ne couvre pas toute la période : ${formaterJours(rep.joursPayes)} payé(s) et ` +
        `${formaterJours(rep.joursNonPayes)} non payé(s). Confirmez la répartition, modifiez la période ou abandonnez.`,
      sim,
    );
  }
}

/** Recherche des demandes actives de l'utilisateur qui chevauchent la période. */
async function verifierChevauchementTx(tx: Transaction, uid: string, debut: string, fin: string, exclure: string[] = []) {
  const snap = await tx.get(
    db()
      .collection(COL.demandes)
      .where('userId', '==', uid)
      .where('statut', 'in', STATUTS_ACTIFS)
      .where('dateDebut', '<=', fin),
  );
  const conflits = snap.docs.filter((d) => !exclure.includes(d.id) && chevauche(debut, fin, d.get('dateDebut'), d.get('dateFin')));
  if (conflits.length) {
    const c = conflits[0];
    throw conflit(
      'CHEVAUCHEMENT',
      `Cette période chevauche une autre demande (${c.get('dateDebut')} → ${c.get('dateFin')}).`,
    );
  }
}

// ---------------------------------------------------------------------------
// Création (avec scission sur deux années et protection contre la double soumission)
// ---------------------------------------------------------------------------

export async function creer(
  user: Utilisateur,
  s: SaisieDemande & { accordNonPaye?: boolean; soumettre?: boolean; attestation?: boolean; cleIdempotence: string },
): Promise<{ ids: string[]; doublon: boolean }> {
  if (s.soumettre && !s.attestation) throw invalide(ATTESTATION_REQUISE);
  const p = await lireParametres();
  const morceaux = scinderParAnnee(s.dateDebut, s.dateFin, optionsDe(s));
  const joursParMorceau = morceaux.map((m) => joursOuvresDeLaPeriode(m.debut, m.fin, p, m.options));
  joursParMorceau.forEach((j) => verifierSaisie(s, j.length));

  const refIdem = db().collection(COL.idempotence).doc(`${user.uid}_${s.cleIdempotence}`);
  const groupeId = morceaux.length > 1 ? db().collection(COL.demandes).doc().id : null;

  const r = await db().runTransaction(async (tx): Promise<{ ids: string[]; doublon: boolean; statut?: StatutDemande }> => {
    // ----- Lectures -----
    const idem = await tx.get(refIdem);
    if (idem.exists) return { ids: idem.get('ids') as string[], doublon: true };

    const etats: Array<{ dot: Awaited<ReturnType<typeof lireDotationTx>>; enAttente: number }> = [];
    for (const m of morceaux) {
      const dot = await lireDotationTx(tx, user.uid, m.annee, p.dotationParDefaut);
      const enAttente = await joursEnAttenteTx(tx, user.uid, m.annee);
      etats.push({ dot, enAttente });
    }
    if (s.soumettre) await verifierChevauchementTx(tx, user.uid, s.dateDebut, s.dateFin);

    const periodes = morceaux.map((m, i) =>
      construirePeriode(m, joursParMorceau[i], calculerSolde(etats[i].dot), etats[i].enAttente, s.type),
    );
    const sim = resumer(periodes);
    for (const per of periodes) exigerAccord(s.type, per.repartition, s.accordNonPaye, sim);

    // ----- Écritures -----
    const statut: StatutDemande = s.soumettre ? statutApresSoumission(!!user.managerId) : 'brouillon';
    const ids: string[] = [];
    periodes.forEach((per, i) => {
      creerDotationSiAbsente(tx, etats[i].dot, user);
      const ref = db().collection(COL.demandes).doc();
      ids.push(ref.id);
      tx.set(ref, {
        userId: user.uid,
        userNom: nomComplet(user),
        managerId: user.managerId,
        campusId: user.campusId,
        serviceId: user.serviceId,
        type: s.type,
        annee: per.annee,
        dateDebut: per.dateDebut,
        dateFin: per.dateFin,
        demiJourneeDebut: per.demiJourneeDebut,
        demiJourneeFin: per.demiJourneeFin,
        commentaire: s.commentaire ?? '',
        interim: s.interim ?? '',
        ficheNumero: null,
        ficheSel: randomBytes(16).toString('hex'),
        ficheStatut: null,
        signatures: { employe: s.soumettre ? visa(user) : null, raf: null, direction: null },
        statut,
        ...per.repartition,
        accordNonPaye: per.repartition.joursNonPayes > 0,
        reconfirmationRequise: false,
        debitEffectue: false,
        restitutionEffectuee: false,
        groupeId,
        avis: null,
        decision: null,
        annulation: null,
        annulationDemandee: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        soumiseLe: s.soumettre ? FieldValue.serverTimestamp() : null,
      });
      journaliser(tx, user, {
        entite: 'demande',
        entiteId: ref.id,
        userId: user.uid,
        action: s.soumettre ? 'creation_soumission' : 'creation_brouillon',
        resume:
          `Demande ${s.soumettre ? 'créée et soumise' : 'enregistrée en brouillon'} : ` +
          `${formaterJours(per.repartition.dureeTotale)} (${formaterJours(per.repartition.joursPayes)} payé(s), ` +
          `${formaterJours(per.repartition.joursNonPayes)} non payé(s)).`,
        details: { soldeAvant: per.soldeAvant, soldeApres: per.soldeApres, groupeId },
      });
    });
    tx.set(refIdem, { ids, createdAt: FieldValue.serverTimestamp() });
    return { ids, doublon: false, statut };
  });
  if (!r.doublon && s.soumettre && r.statut) {
    for (const id of r.ids) await notifierSoumission(user, id, r.statut);
  }
  return { ids: r.ids, doublon: r.doublon };
}

async function notifierSoumission(user: Utilisateur, id: string, statut: StatutDemande) {
  const batch = db().batch();
  if (statut === 'soumise' && user.managerId) {
    notifier(batch, [user.managerId], {
      titre: 'Nouvelle demande de congé',
      message: `${nomComplet(user)} a soumis une demande de congé. Votre avis est attendu.`,
      lien: lien(id),
    });
  } else {
    const rh = (await rhDuCampus(user.campusId)).filter((r) => r.uid !== user.uid);
    notifier(batch, rh.map((r) => r.uid), {
      titre: 'Demande de congé à décider',
      message: `${nomComplet(user)} a soumis une demande de congé en attente de décision RH.`,
      lien: lien(id),
    });
    // Personne ne valide sa propre demande : sans autre RH, l'administrateur doit en désigner un
    if (!rh.length) await alerterAdministrateurs(batch, `Aucun gestionnaire RH (autre que le demandeur) ne couvre le campus de ${nomComplet(user)} : désignez un valideur.`);
  }
  await batch.commit();
}

// ---------------------------------------------------------------------------
// Chargement et contrôle d'accès
// ---------------------------------------------------------------------------

export async function chargerDemande(acteur: Utilisateur, id: string): Promise<Demande> {
  const snap = await db().collection(COL.demandes).doc(id).get();
  if (!snap.exists) throw introuvable('Demande introuvable.');
  const d = versDemande(snap);
  if (!peutVoirDemande(acteur, d)) throw interdit();
  return d;
}

async function lireTx(tx: Transaction, id: string): Promise<Demande> {
  const snap = await tx.get(db().collection(COL.demandes).doc(id));
  if (!snap.exists) throw introuvable('Demande introuvable.');
  return versDemande(snap);
}

function exigerTransition(action: Parameters<typeof transitionAutorisee>[0], d: Demande) {
  if (!transitionAutorisee(action, d.statut)) {
    throw conflit('STATUT_INCOMPATIBLE', `Action impossible : la demande est au statut « ${d.statut} ».`);
  }
}

/** Actions proposées à l'interface pour un acteur donné (le serveur revérifie toujours). */
export function actionsPossibles(acteur: Utilisateur, d: Demande): string[] {
  const a: string[] = [];
  const proprietaire = estProprietaire(acteur, d);
  if (proprietaire && d.statut === 'brouillon') a.push('soumettre');
  if (proprietaire && transitionAutorisee('annuler_collaborateur', d.statut)) a.push('annuler');
  if (proprietaire && d.statut === 'approuvee' && !d.annulation) a.push('demander_annulation');
  if (proprietaire && d.reconfirmationRequise) a.push('reconfirmer');
  if (peutDonnerAvis(acteur, d) && d.statut === 'soumise') a.push('avis', 'refuser_responsable');
  if (peutDecider(acteur, d) && d.statut === 'en_decision_rh' && !d.reconfirmationRequise) a.push('approuver');
  if (peutDecider(acteur, d) && d.statut === 'en_decision_rh') a.push('refuser');
  if (peutDecider(acteur, d) && d.statut === 'approuvee') a.push('annuler_rh');
  if (proprietaire && ['brouillon', 'soumise', 'en_decision_rh'].includes(d.statut)) a.push('deposer_justificatif');
  if (peutDecider(acteur, d)) a.push('examiner_justificatifs');
  if (proprietaire && d.statut === 'brouillon') a.push('modifier');
  // Fiche F031 (formulaire en ligne et PDF) : visible dès la soumission
  if (d.statut !== 'brouillon') a.push('telecharger_fiche');
  if (peutSignerDirection(acteur, d) && d.statut === 'approuvee' && d.ficheStatut === 'attente_direction') {
    a.push('signer_direction');
  }
  return a;
}

// ---------------------------------------------------------------------------
// Soumission d'un brouillon
// ---------------------------------------------------------------------------

export async function soumettre(user: Utilisateur, id: string, accordNonPaye?: boolean, attestation?: boolean) {
  if (!attestation) throw invalide(ATTESTATION_REQUISE);
  const p = await lireParametres();
  const statut = await db().runTransaction(async (tx) => {
    const d = await lireTx(tx, id);
    if (!estProprietaire(user, d)) throw interdit('Seul le demandeur peut soumettre sa demande.');
    exigerTransition('soumettre', d);
    if (d.dateDebut < aujourdhui()) throw invalide('La date de début est passée : modifiez la période.');
    const dot = await lireDotationTx(tx, user.uid, d.annee, p.dotationParDefaut);
    const enAttente = await joursEnAttenteTx(tx, user.uid, d.annee, d.id);
    await verifierChevauchementTx(tx, user.uid, d.dateDebut, d.dateFin, [d.id]);

    const jours = joursOuvresDeLaPeriode(d.dateDebut, d.dateFin, p, d);
    const per = construirePeriode(
      { annee: d.annee, debut: d.dateDebut, fin: d.dateFin, options: d },
      jours,
      calculerSolde(dot),
      enAttente,
      d.type,
    );
    exigerAccord(d.type, per.repartition, accordNonPaye, resumer([per]));

    creerDotationSiAbsente(tx, dot, user);
    const nouveau = statutApresSoumission(!!user.managerId);
    tx.update(db().collection(COL.demandes).doc(id), {
      ...per.repartition,
      accordNonPaye: per.repartition.joursNonPayes > 0,
      statut: nouveau,
      managerId: user.managerId,
      'signatures.employe': visa(user),
      soumiseLe: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    journaliser(tx, user, {
      entite: 'demande',
      entiteId: id,
      userId: user.uid,
      action: 'soumission',
      resume: `Demande soumise (${formaterJours(per.repartition.joursPayes)} payé(s), ${formaterJours(per.repartition.joursNonPayes)} non payé(s)).`,
    });
    return nouveau;
  });
  await notifierSoumission(user, id, statut);
}

// ---------------------------------------------------------------------------
// Avis du responsable hiérarchique
// ---------------------------------------------------------------------------

export async function donnerAvis(acteur: Utilisateur, id: string, favorable: boolean, commentaire: string) {
  if (!favorable && !commentaire.trim()) throw invalide('Un avis défavorable doit être motivé.');
  const d = await db().runTransaction(async (tx) => {
    const d = await lireTx(tx, id);
    if (!peutDonnerAvis(acteur, d)) {
      throw interdit("Seul le responsable hiérarchique du demandeur (autre que lui-même) peut émettre un avis.");
    }
    exigerTransition('avis', d);
    tx.update(db().collection(COL.demandes).doc(id), {
      statut: 'en_decision_rh',
      avis: { favorable, commentaire, auteurId: acteur.uid, auteurNom: nomComplet(acteur), date: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
    });
    journaliser(tx, acteur, {
      entite: 'demande',
      entiteId: id,
      userId: d.userId,
      action: 'avis',
      resume: `Avis hiérarchique ${favorable ? 'favorable' : 'défavorable'}. Transmise aux RH pour décision.`,
      motif: commentaire || null,
    });
    notifier(tx, [d.userId], {
      titre: 'Avis de votre responsable',
      message: `Votre responsable a émis un avis ${favorable ? 'favorable' : 'défavorable'}. La décision finale revient aux RH.`,
      lien: lien(id),
    });
    return d;
  });
  const rh = (await rhDuCampus(d.campusId)).filter((r) => r.uid !== d.userId);
  const batch = db().batch();
  notifier(batch, rh.map((r) => r.uid), {
    titre: 'Demande de congé à décider',
    message: `La demande de ${d.userNom} a reçu l'avis du responsable et attend votre décision.`,
    lien: lien(id),
  });
  await batch.commit();
}

// ---------------------------------------------------------------------------
// Refus par le responsable hiérarchique (N+1)
// ---------------------------------------------------------------------------

/**
 * Le responsable refuse la demande : refus motivé et définitif, la demande
 * n'est pas transmise aux RH. Aucun jour n'a encore été débité (le débit n'a
 * lieu qu'à l'approbation RH) : il n'y a rien à restituer.
 */
export async function refuserParResponsable(acteur: Utilisateur, id: string, motif: string) {
  if (!motif.trim()) throw invalide('Un refus doit être motivé.');
  await db().runTransaction(async (tx) => {
    const d = await lireTx(tx, id);
    if (!peutDonnerAvis(acteur, d)) {
      throw interdit('Seul le responsable hiérarchique du demandeur (autre que lui-même) peut refuser cette demande.');
    }
    exigerTransition('refuser_responsable', d);
    const auteur = { auteurId: acteur.uid, auteurNom: nomComplet(acteur), date: FieldValue.serverTimestamp() };
    tx.update(db().collection(COL.demandes).doc(id), {
      statut: 'refusee',
      avis: { favorable: false, commentaire: motif, ...auteur },
      decision: { statut: 'refusee', motif, par: 'responsable', ...auteur },
      updatedAt: FieldValue.serverTimestamp(),
    });
    journaliser(tx, acteur, {
      entite: 'demande',
      entiteId: id,
      userId: d.userId,
      action: 'refus_responsable',
      resume: 'Demande refusée par le responsable hiérarchique.',
      motif,
    });
    notifier(tx, [d.userId], { titre: 'Demande de congé refusée par votre responsable', message: `Motif : ${motif}`, lien: lien(id) });
  });
}

// ---------------------------------------------------------------------------
// Décision RH
// ---------------------------------------------------------------------------

export async function decider(acteur: Utilisateur, id: string, decision: 'approuver' | 'refuser', motif: string) {
  if (decision === 'refuser' && !motif.trim()) throw invalide('Un refus doit être motivé.');
  const p = await lireParametres();

  const resultat = await db().runTransaction(async (tx) => {
    const d = await lireTx(tx, id);
    if (!peutDecider(acteur, d)) {
      throw interdit(
        estProprietaire(acteur, d)
          ? 'Vous ne pouvez pas décider de votre propre demande : un autre gestionnaire RH doit être désigné.'
          : 'Cette demande ne relève pas de votre périmètre RH.',
      );
    }
    exigerTransition(decision, d);
    const ref = db().collection(COL.demandes).doc(id);
    const traceDecision = (statut: StatutDemande) => ({
      statut,
      motif,
      auteurId: acteur.uid,
      auteurNom: nomComplet(acteur),
      date: FieldValue.serverTimestamp(),
    });

    if (decision === 'refuser') {
      tx.update(ref, { statut: 'refusee', decision: traceDecision('refusee'), updatedAt: FieldValue.serverTimestamp() });
      journaliser(tx, acteur, { entite: 'demande', entiteId: id, userId: d.userId, action: 'refus', resume: 'Demande refusée par les RH.', motif });
      notifier(tx, [d.userId], { titre: 'Demande de congé refusée', message: `Motif : ${motif}`, lien: lien(id) });
      return { ok: true as const };
    }

    // --- Approbation : revérification du solde côté serveur ---
    if (d.reconfirmationRequise) {
      throw conflit('RECONFIRMATION_REQUISE', 'Le collaborateur doit d’abord confirmer la nouvelle répartition.');
    }
    const cible = await lireUtilisateurTx(tx, d.userId);
    const dot = await lireDotationTx(tx, d.userId, d.annee, p.dotationParDefaut);
    const solde = calculerSolde(dot);

    if (!repartitionCouverte(d.joursPayes, solde)) {
      tx.update(ref, { reconfirmationRequise: true, updatedAt: FieldValue.serverTimestamp() });
      journaliser(tx, acteur, {
        entite: 'demande',
        entiteId: id,
        userId: d.userId,
        action: 'decision_bloquee',
        resume: `Décision bloquée : le solde actuel (${formaterJours(solde)}) ne couvre plus les ${formaterJours(d.joursPayes)} payés acceptés. Nouvelle confirmation du collaborateur requise.`,
      });
      notifier(tx, [d.userId], {
        titre: 'Confirmation requise',
        message: 'Votre solde a changé : merci de confirmer la nouvelle répartition de votre demande.',
        lien: lien(id),
      });
      return { ok: false as const, solde };
    }

    if (cible) creerDotationSiAbsente(tx, dot, cible);
    const soldeApres = enJours(enDemi(solde) - enDemi(d.joursPayes));
    if (d.joursPayes > 0 && !d.debitEffectue) {
      tx.update(dot.ref, {
        joursDebites: enJours(enDemi(dot.joursDebites) + enDemi(d.joursPayes)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      ajouterMouvement(tx, {
        userId: d.userId,
        annee: d.annee,
        type: 'DEBIT',
        jours: -d.joursPayes,
        motif: `Congé approuvé du ${d.dateDebut} au ${d.dateFin}`,
        auteur: acteur,
        demandeId: id,
        soldeApres,
      });
    }
    tx.update(ref, {
      statut: 'approuvee',
      debitEffectue: true,
      decision: traceDecision('approuvee'),
      // Visa électronique de la RAF (gestionnaire RH qui décide) ; la fiche
      // attend ensuite l'accord de la direction régionale.
      'signatures.raf': visa(acteur),
      ficheStatut: 'attente_direction',
      updatedAt: FieldValue.serverTimestamp(),
    });
    journaliser(tx, acteur, {
      entite: 'demande',
      entiteId: id,
      userId: d.userId,
      action: 'approbation',
      resume: `Demande approuvée : ${formaterJours(d.joursPayes)} débité(s), ${formaterJours(d.joursNonPayes)} non payé(s). Solde après : ${formaterJours(soldeApres)}.`,
      motif: motif || null,
    });
    notifier(tx, [d.userId], {
      titre: 'Demande de congé approuvée',
      message: `Votre congé du ${d.dateDebut} au ${d.dateFin} est approuvé.`,
      lien: lien(id),
    });
    return { ok: true as const, campusId: d.campusId, userId: d.userId, userNom: d.userNom };
  });

  if (resultat.ok && 'campusId' in resultat && resultat.campusId) {
    const direction = (await utilisateursDuRole('direction', resultat.campusId)).filter((u) => u.uid !== resultat.userId);
    const batch = db().batch();
    if (!direction.length) {
      await alerterAdministrateurs(batch, `Aucun membre de la direction régionale ne peut signer la fiche de ${resultat.userNom} : désignez un signataire.`);
    }
    notifier(batch, direction.map((u) => u.uid), {
      titre: 'Fiche de congé à signer',
      message: `Le congé de ${resultat.userNom} a été approuvé par les RH : l’accord de la direction est attendu.`,
      lien: `/conges/fiche?id=${id}`,
    });
    await batch.commit();
  }

  if (!resultat.ok) {
    throw conflit(
      'SOLDE_MODIFIE',
      `Le solde du collaborateur (${formaterJours(resultat.solde)}) ne couvre plus la répartition acceptée. ` +
        'La décision est bloquée jusqu’à sa nouvelle confirmation.',
    );
  }
}

async function lireUtilisateurTx(tx: Transaction, uid: string): Promise<Utilisateur | null> {
  const snap = await tx.get(db().collection(COL.users).doc(uid));
  return versUtilisateur(snap);
}

// ---------------------------------------------------------------------------
// Reconfirmation par le collaborateur après changement de solde
// ---------------------------------------------------------------------------

export async function reconfirmer(user: Utilisateur, id: string, accordNonPaye?: boolean) {
  const p = await lireParametres();
  await db().runTransaction(async (tx) => {
    const d = await lireTx(tx, id);
    if (!estProprietaire(user, d)) throw interdit();
    if (!d.reconfirmationRequise) throw conflit('INUTILE', 'Aucune confirmation n’est attendue pour cette demande.');
    const dot = await lireDotationTx(tx, user.uid, d.annee, p.dotationParDefaut);
    const enAttente = await joursEnAttenteTx(tx, user.uid, d.annee, d.id);
    const jours = joursOuvresDeLaPeriode(d.dateDebut, d.dateFin, p, d);
    const per = construirePeriode({ annee: d.annee, debut: d.dateDebut, fin: d.dateFin, options: d }, jours, calculerSolde(dot), enAttente, d.type);
    exigerAccord(d.type, per.repartition, accordNonPaye, resumer([per]));
    tx.update(db().collection(COL.demandes).doc(id), {
      ...per.repartition,
      accordNonPaye: per.repartition.joursNonPayes > 0,
      reconfirmationRequise: false,
      // Nouvelle répartition = nouveau consentement : le visa de l'employé est renouvelé
      'signatures.employe': visa(user),
      updatedAt: FieldValue.serverTimestamp(),
    });
    journaliser(tx, user, {
      entite: 'demande',
      entiteId: id,
      userId: d.userId,
      action: 'reconfirmation',
      resume: `Nouvelle répartition confirmée : ${formaterJours(per.repartition.joursPayes)} payé(s), ${formaterJours(per.repartition.joursNonPayes)} non payé(s).`,
    });
  });
}

// ---------------------------------------------------------------------------
// Annulations
// ---------------------------------------------------------------------------

/** Annulation par le collaborateur (avant décision) ou demande d'annulation (après approbation). */
export async function annulerParCollaborateur(user: Utilisateur, id: string, motif: string) {
  const d = await db().runTransaction(async (tx) => {
    const d = await lireTx(tx, id);
    if (!estProprietaire(user, d)) throw interdit('Seul le demandeur peut annuler sa demande.');
    const ref = db().collection(COL.demandes).doc(id);

    if (transitionAutorisee('annuler_collaborateur', d.statut)) {
      tx.update(ref, { statut: 'annulee', updatedAt: FieldValue.serverTimestamp() });
      journaliser(tx, user, { entite: 'demande', entiteId: id, userId: d.userId, action: 'annulation', resume: 'Demande annulée par le collaborateur (aucun jour n’avait été débité).', motif: motif || null });
      return { d, mode: 'directe' as const };
    }
    if (d.statut === 'approuvee') {
      if (d.annulation) throw conflit('DEJA_DEMANDEE', 'Une demande d’annulation est déjà en cours.');
      if (!motif.trim()) throw invalide("Indiquez le motif de l'annulation.");
      tx.update(ref, {
        annulation: { demandeeLe: FieldValue.serverTimestamp(), motif, demandeeParId: user.uid },
        annulationDemandee: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      journaliser(tx, user, { entite: 'demande', entiteId: id, userId: d.userId, action: 'demande_annulation', resume: "Demande d'annulation transmise aux RH.", motif });
      return { d, mode: 'demandee' as const };
    }
    throw conflit('STATUT_INCOMPATIBLE', `Impossible d'annuler une demande au statut « ${d.statut} ».`);
  });

  const rh = (await rhDuCampus(d.d.campusId)).filter((r) => r.uid !== d.d.userId);
  const batch = db().batch();
  notifier(batch, d.mode === 'demandee' ? rh.map((r) => r.uid) : [d.d.statut !== 'brouillon' ? d.d.managerId : null], {
    titre: d.mode === 'demandee' ? "Demande d'annulation" : 'Demande annulée',
    message:
      d.mode === 'demandee'
        ? `${d.d.userNom} demande l'annulation d'un congé approuvé.`
        : `${d.d.userNom} a annulé sa demande de congé.`,
    lien: lien(id),
  });
  await batch.commit();
}

/**
 * Décision RH sur l'annulation d'un congé approuvé. Les jours payés sont
 * restitués UNE SEULE FOIS (indicateur restitutionEffectuee) ; les jours non
 * payés ne donnent lieu à aucun crédit. Après le début du congé, l'opération
 * est tracée comme une régularisation RH motivée.
 */
export async function deciderAnnulation(acteur: Utilisateur, id: string, accepter: boolean, motif: string) {
  if (!motif.trim()) throw invalide('Le motif est obligatoire.');
  const p = await lireParametres();
  await db().runTransaction(async (tx) => {
    const d = await lireTx(tx, id);
    if (!peutDecider(acteur, d)) throw interdit('Cette décision revient à un gestionnaire RH habilité, autre que le demandeur.');
    exigerTransition('annuler_rh', d);
    const ref = db().collection(COL.demandes).doc(id);

    if (!accepter) {
      if (!d.annulation) throw conflit('AUCUNE_DEMANDE', "Aucune demande d'annulation à refuser.");
      tx.update(ref, { annulation: null, annulationDemandee: false, updatedAt: FieldValue.serverTimestamp() });
      journaliser(tx, acteur, { entite: 'demande', entiteId: id, userId: d.userId, action: 'refus_annulation', resume: "Demande d'annulation refusée.", motif });
      notifier(tx, [d.userId], { titre: "Annulation refusée", message: `Motif : ${motif}`, lien: lien(id) });
      return;
    }

    const regularisation = d.dateDebut <= aujourdhui();
    const dot = await lireDotationTx(tx, d.userId, d.annee, p.dotationParDefaut);
    const restitue = restituerTx(tx, acteur, d, dot, `${regularisation ? 'Régularisation' : 'Annulation'} : ${motif}`);
    tx.update(ref, {
      statut: 'annulee',
      restitutionEffectuee: true,
      annulationDemandee: false,
      ficheStatut: d.ficheStatut ? 'annulee' : null,
      decision: { statut: 'annulee', motif, auteurId: acteur.uid, auteurNom: nomComplet(acteur), date: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
    });
    journaliser(tx, acteur, {
      entite: 'demande',
      entiteId: id,
      userId: d.userId,
      action: regularisation ? 'regularisation' : 'annulation_rh',
      resume: `${regularisation ? 'Régularisation RH après début du congé' : 'Annulation validée par les RH'} : ${formaterJours(restitue)} restitué(s), ${formaterJours(d.joursNonPayes)} non payé(s) sans crédit.`,
      motif,
    });
    notifier(tx, [d.userId], {
      titre: 'Congé annulé',
      message: `Votre congé du ${d.dateDebut} au ${d.dateFin} est annulé. ${formaterJours(restitue)} restitué(s) sur votre solde.`,
      lien: lien(id),
    });
  });
}


/**
 * Restitue UNE SEULE FOIS les jours payés d'un congé approuvé (les jours non
 * payés ne donnent aucun crédit). À appeler après toutes les lectures de la
 * transaction. Renvoie le nombre de jours restitués.
 */
function restituerTx(
  tx: Transaction,
  acteur: Utilisateur,
  d: Demande,
  dot: Awaited<ReturnType<typeof lireDotationTx>>,
  motif: string,
): number {
  if (!d.debitEffectue || d.restitutionEffectuee || d.joursPayes <= 0) return 0;
  const nouveauxDebites = enJours(enDemi(dot.joursDebites) - enDemi(d.joursPayes));
  tx.update(dot.ref, { joursDebites: nouveauxDebites, updatedAt: FieldValue.serverTimestamp() });
  ajouterMouvement(tx, {
    userId: d.userId,
    annee: d.annee,
    type: 'RESTITUTION',
    jours: d.joursPayes,
    motif,
    auteur: acteur,
    demandeId: d.id,
    soldeApres: calculerSolde({ ...dot, joursDebites: nouveauxDebites }),
  });
  return d.joursPayes;
}

// ---------------------------------------------------------------------------
// Accord de la direction régionale (dernière signature de la fiche F031)
// ---------------------------------------------------------------------------

/**
 * La direction régionale signe l'accord pour la période approuvée par les RH,
 * ou le refuse (motif obligatoire) : le congé est alors annulé et les jours
 * payés restitués. Le visa est apposé par le serveur au nom de l'utilisateur
 * authentifié : il ne peut être ni saisi ni modifié par un autre profil.
 */
export async function signerDirection(acteur: Utilisateur, id: string, accord: boolean, motif: string) {
  if (!accord && !motif.trim()) throw invalide('Le refus de la direction doit être motivé.');
  const p = await lireParametres();
  const d = await db().runTransaction(async (tx) => {
    const d = await lireTx(tx, id);
    if (!peutSignerDirection(acteur, d)) {
      throw interdit(
        estProprietaire(acteur, d)
          ? 'Vous ne pouvez pas signer l’accord de votre propre congé : un autre membre de la direction doit le faire.'
          : 'Seule la direction régionale du périmètre peut signer cette fiche.',
      );
    }
    if (d.statut !== 'approuvee' || d.ficheStatut !== 'attente_direction') {
      throw conflit('STATUT_INCOMPATIBLE', 'Cette fiche n’attend pas (ou plus) l’accord de la direction.');
    }
    const ref = db().collection(COL.demandes).doc(id);
    if (accord) {
      tx.update(ref, {
        'signatures.direction': { ...visa(acteur), accordDu: d.dateDebut, accordAu: d.dateFin },
        ficheStatut: 'signee',
        updatedAt: FieldValue.serverTimestamp(),
      });
      journaliser(tx, acteur, {
        entite: 'demande',
        entiteId: id,
        userId: d.userId,
        action: 'accord_direction',
        resume: `Accord de la direction pour la période du ${d.dateDebut} au ${d.dateFin} : fiche entièrement signée.`,
        motif: motif || null,
      });
      notifier(tx, [d.userId], {
        titre: 'Fiche de congé signée',
        message: 'La direction a signé l’accord de votre congé : la fiche est complète.',
        lien: `/conges/fiche?id=${id}`,
      });
      return d;
    }
    const dot = await lireDotationTx(tx, d.userId, d.annee, p.dotationParDefaut);
    const restitue = restituerTx(tx, acteur, d, dot, `Refus de la direction : ${motif}`);
    tx.update(ref, {
      statut: 'annulee',
      restitutionEffectuee: true,
      ficheStatut: 'refusee_direction',
      decision: { statut: 'annulee', motif, auteurId: acteur.uid, auteurNom: nomComplet(acteur), date: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
    });
    journaliser(tx, acteur, {
      entite: 'demande',
      entiteId: id,
      userId: d.userId,
      action: 'refus_direction',
      resume: `Accord refusé par la direction : congé annulé, ${formaterJours(restitue)} restitué(s).`,
      motif,
    });
    notifier(tx, [d.userId], {
      titre: 'Congé refusé par la direction',
      message: `Motif : ${motif}. ${formaterJours(restitue)} restitué(s) sur votre solde.`,
      lien: lien(id),
    });
    return d;
  });
  if (!accord) {
    const rh = (await rhDuCampus(d.campusId)).filter((r) => r.uid !== d.userId);
    const batch = db().batch();
    notifier(batch, rh.map((r) => r.uid), {
      titre: 'Refus de la direction',
      message: `La direction a refusé l’accord du congé de ${d.userNom} (annulé, jours payés restitués).`,
      lien: lien(id),
    });
    await batch.commit();
  }
}

// ---------------------------------------------------------------------------
// Modification d'un brouillon
// ---------------------------------------------------------------------------

export async function modifierBrouillon(user: Utilisateur, id: string, s: SaisieDemande) {
  const p = await lireParametres();
  const morceaux = scinderParAnnee(s.dateDebut, s.dateFin, optionsDe(s));
  if (morceaux.length > 1) {
    throw invalide('Une période sur deux années doit faire l’objet d’une nouvelle demande (elle sera scindée automatiquement).');
  }
  const m = morceaux[0];
  const jours = joursOuvresDeLaPeriode(m.debut, m.fin, p, m.options);
  verifierSaisie(s, jours.length);
  await db().runTransaction(async (tx) => {
    const d = await lireTx(tx, id);
    if (!estProprietaire(user, d)) throw interdit('Seul le demandeur peut modifier sa demande.');
    if (d.statut !== 'brouillon') throw conflit('STATUT_INCOMPATIBLE', 'Seul un brouillon peut être modifié.');
    const dot = await lireDotationTx(tx, user.uid, m.annee, p.dotationParDefaut);
    const enAttente = await joursEnAttenteTx(tx, user.uid, m.annee, d.id);
    const per = construirePeriode(m, jours, calculerSolde(dot), enAttente, s.type);
    tx.update(db().collection(COL.demandes).doc(id), {
      type: s.type,
      annee: m.annee,
      dateDebut: m.debut,
      dateFin: m.fin,
      demiJourneeDebut: !!m.options.demiJourneeDebut,
      demiJourneeFin: !!m.options.demiJourneeFin,
      commentaire: s.commentaire ?? '',
      interim: s.interim ?? '',
      ...per.repartition,
      accordNonPaye: per.repartition.joursNonPayes > 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
    journaliser(tx, user, {
      entite: 'demande',
      entiteId: id,
      userId: user.uid,
      action: 'modification_brouillon',
      resume: `Brouillon modifié : ${m.debut} → ${m.fin} (${formaterJours(per.repartition.dureeTotale)}).`,
    });
  });
}

/** Prévient les administrateurs qu'un valideur ou un signataire doit être désigné. */
async function alerterAdministrateurs(batch: FirebaseFirestore.WriteBatch, message: string) {
  const admins = await db().collection(COL.users).where('roles', 'array-contains', 'admin').get();
  notifier(batch, admins.docs.filter((d) => d.get('actif') !== false).map((d) => d.id), {
    titre: 'Valideur à désigner',
    message,
    lien: '/admin/comptes',
  });
}
