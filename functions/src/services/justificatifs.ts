/**
 * Justificatifs : stockés dans Cloud Storage (fichiers privés, jamais de lien
 * public), seules les métadonnées sont dans Firestore. Le dépôt et le
 * téléchargement passent par l'API qui contrôle l'accès à chaque fois.
 */
import { DocumentSnapshot, FieldValue } from 'firebase-admin/firestore';
import { bucket, COL, db } from '../infra/firebase';
import { conflit, interdit, introuvable, invalide } from '../infra/erreurs';
import { controlerFichier, EXTENSIONS, nomFichierSur } from '../domain/fichiers';
import { estProprietaire, peutDecider, peutVoirJustificatif } from '../domain/authz';
import { Rattachement, Utilisateur } from '../domain/types';
import { lireParametres } from './parametres';
import { journaliser, notifier } from './journal';
import { rhDuCampus } from './utilisateurs';

export type TypeDossier = 'demande' | 'signalement';

export interface Justificatif extends Rattachement {
  id: string;
  dossierType: TypeDossier;
  dossierId: string;
  nomFichier: string;
  contentType: string;
  taille: number;
  medical: boolean;
  chemin: string;
  statut: 'recu_a_examiner' | 'accepte' | 'refuse';
  motifDecision: string | null;
  deposeLe: unknown;
}

const collectionDossier = (t: TypeDossier) => (t === 'demande' ? COL.demandes : COL.signalements);
const lienDossier = (t: TypeDossier, id: string) => (t === 'demande' ? `/conges/detail?id=${id}` : `/signalements/detail?id=${id}`);

export function versJustificatif(snap: DocumentSnapshot): Justificatif {
  return { id: snap.id, ...(snap.data() as Omit<Justificatif, 'id'>) };
}

/** Métadonnées renvoyées au client (sans chemin de stockage). */
export function vueJustificatif(j: Justificatif) {
  const { chemin: _chemin, ...reste } = j;
  return reste;
}

export async function deposer(
  user: Utilisateur,
  e: { dossierType: TypeDossier; dossierId: string; nomFichier: string; contentType: string; contenuBase64: string },
) {
  const p = await lireParametres();
  const contenu = Buffer.from(e.contenuBase64, 'base64');
  const controle = controlerFichier(contenu, e.contentType, p.justificatifs.tailleMaxOctets);
  if (!controle.ok || !controle.type) throw invalide(controle.erreur ?? 'Fichier refusé.');

  const refDossier = db().collection(collectionDossier(e.dossierType)).doc(e.dossierId);
  const dossierSnap = await refDossier.get();
  if (!dossierSnap.exists) throw introuvable('Dossier introuvable.');
  const dossier = dossierSnap.data() as Rattachement & {
    statut?: string;
    statutTraitement?: string;
    medical?: boolean;
    justificatifStatut?: string;
  };
  if (!estProprietaire(user, dossier)) throw interdit('Seul le déposant du dossier peut y joindre un justificatif.');
  if (e.dossierType === 'signalement' && dossier.statutTraitement === 'cloture') {
    throw conflit('CLOTURE', 'Ce signalement est clôturé.');
  }
  if (e.dossierType === 'demande' && !['brouillon', 'soumise', 'en_decision_rh'].includes(dossier.statut ?? '')) {
    throw conflit('STATUT_INCOMPATIBLE', 'Impossible de joindre une pièce à une demande déjà traitée.');
  }

  const id = db().collection(COL.justificatifs).doc().id;
  const chemin = `justificatifs/${user.uid}/${e.dossierId}/${id}.${EXTENSIONS[controle.type]}`;

  // 1) Réservation atomique de la place (max. N pièces par dossier)
  await db().runTransaction(async (tx) => {
    const existants = await tx.get(db().collection(COL.justificatifs).where('dossierId', '==', e.dossierId));
    if (existants.size >= p.justificatifs.maxParDossier) {
      throw conflit('LIMITE_ATTEINTE', `Ce dossier contient déjà ${p.justificatifs.maxParDossier} pièces (maximum autorisé).`);
    }
    tx.set(db().collection(COL.justificatifs).doc(id), {
      userId: dossier.userId,
      managerId: dossier.managerId ?? null,
      campusId: dossier.campusId,
      dossierType: e.dossierType,
      dossierId: e.dossierId,
      nomFichier: nomFichierSur(e.nomFichier),
      contentType: controle.type,
      taille: contenu.length,
      medical: e.dossierType === 'signalement' ? !!dossier.medical : false,
      chemin,
      statut: 'recu_a_examiner',
      motifDecision: null,
      televerse: false,
      deposeLe: FieldValue.serverTimestamp(),
    });
    const majDossier: Record<string, unknown> = { nbJustificatifs: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() };
    if (e.dossierType === 'signalement') majDossier.justificatifStatut = 'recu_a_examiner';
    tx.update(refDossier, majDossier);
    journaliser(tx, user, {
      entite: e.dossierType,
      entiteId: e.dossierId,
      userId: dossier.userId,
      action: 'depot_justificatif',
      resume: 'Justificatif déposé, en attente d’examen RH.',
    });
  });

  // 2) Écriture du fichier privé (aucun jeton de téléchargement public)
  try {
    await bucket().file(chemin).save(contenu, {
      contentType: controle.type,
      resumable: false,
      metadata: { cacheControl: 'private, no-store', metadata: { justificatifId: id, proprietaire: user.uid } },
    });
    await db().collection(COL.justificatifs).doc(id).update({ televerse: true });
  } catch (err) {
    // Annulation de la réservation pour ne pas laisser de métadonnée orpheline
    await db().collection(COL.justificatifs).doc(id).delete();
    await refDossier.update({ nbJustificatifs: FieldValue.increment(-1) });
    throw err;
  }

  const rh = (await rhDuCampus(dossier.campusId)).filter((r) => r.uid !== user.uid);
  const batch = db().batch();
  notifier(batch, rh.map((r) => r.uid), {
    titre: 'Justificatif à examiner',
    message: 'Un nouveau justificatif a été déposé et attend votre examen.',
    lien: lienDossier(e.dossierType, e.dossierId),
  });
  await batch.commit();
  return { id };
}

export async function listerPourDossier(acteur: Utilisateur, dossierId: string) {
  const snap = await db().collection(COL.justificatifs).where('dossierId', '==', dossierId).get();
  return snap.docs
    .map(versJustificatif)
    .filter((j) => peutVoirJustificatif(acteur, j))
    .map(vueJustificatif);
}

export async function lireContenu(acteur: Utilisateur, id: string) {
  const snap = await db().collection(COL.justificatifs).doc(id).get();
  if (!snap.exists) throw introuvable('Justificatif introuvable.');
  const j = versJustificatif(snap);
  // Contrôle d'accès AVANT toute lecture du fichier
  if (!peutVoirJustificatif(acteur, j)) throw interdit('Vous n’êtes pas habilité à consulter ce justificatif.');
  const [contenu] = await bucket().file(j.chemin).download();
  // Traçabilité des consultations (pièces potentiellement médicales)
  if (acteur.uid !== j.userId) {
    const batch = db().batch();
    journaliser(batch, acteur, {
      entite: j.dossierType,
      entiteId: j.dossierId,
      userId: j.userId,
      action: 'consultation_justificatif',
      resume: 'Justificatif consulté.',
    });
    await batch.commit();
  }
  return { contenu, j };
}

export async function deciderJustificatif(acteur: Utilisateur, id: string, accepte: boolean, motif: string) {
  if (!accepte && !motif.trim()) throw invalide('Le refus d’un justificatif doit être motivé.');
  await db().runTransaction(async (tx) => {
    const ref = db().collection(COL.justificatifs).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw introuvable('Justificatif introuvable.');
    const j = versJustificatif(snap);
    if (!peutDecider(acteur, j)) throw interdit('Seul un gestionnaire RH habilité (autre que le déposant) peut examiner ce justificatif.');
    const refDossier = db().collection(collectionDossier(j.dossierType)).doc(j.dossierId);
    tx.update(ref, {
      statut: accepte ? 'accepte' : 'refuse',
      motifDecision: motif || null,
      examinePar: acteur.uid,
      examineLe: FieldValue.serverTimestamp(),
    });
    if (j.dossierType === 'signalement') {
      tx.update(refDossier, {
        justificatifStatut: accepte ? 'accepte' : 'refuse',
        statutTraitement: 'en_cours',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    journaliser(tx, acteur, {
      entite: j.dossierType,
      entiteId: j.dossierId,
      userId: j.userId,
      action: accepte ? 'justificatif_accepte' : 'justificatif_refuse',
      resume: accepte ? 'Justificatif accepté.' : 'Justificatif refusé : un complément peut être fourni.',
      motif: motif || null,
    });
    notifier(tx, [j.userId], {
      titre: accepte ? 'Justificatif accepté' : 'Justificatif refusé',
      message: accepte ? 'Votre justificatif a été accepté.' : `Motif : ${motif}. Vous pouvez déposer un complément.`,
      lien: lienDossier(j.dossierType, j.dossierId),
    });
  });
}
