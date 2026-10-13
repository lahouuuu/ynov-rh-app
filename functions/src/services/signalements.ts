/**
 * Signalements d'absence et de retard.
 *
 * Un signalement est enregistré immédiatement, sans autorisation préalable, et
 * notifié au responsable et aux RH. Il ne vaut ni congé approuvé ni absence
 * justifiée et ne modifie pas le solde. Deux axes distincts :
 *  - statut de traitement : declare → en_cours → cloture ;
 *  - qualification RH : a_examiner → justifie | non_justifie.
 * L'absence de pièce n'empêche pas le signalement et n'entraîne jamais
 * automatiquement « non justifié ».
 */
import { DocumentSnapshot, FieldValue } from 'firebase-admin/firestore';
import { COL, db } from '../infra/firebase';
import { conflit, interdit, introuvable, invalide } from '../infra/erreurs';
import { ajouterJours, anneeDe, aujourdhui, joursOuvresDeLaPeriode, minutesDeRetard, sommeJours } from '../domain/calendrier';
import { calculerSolde, formaterJours, verifierSoldeNonNegatif } from '../domain/solde';
import { ajouterMouvement, creerDotationSiAbsente, lireDotationTx } from './dotations';
import { lireUtilisateur } from './utilisateurs';
import { estProprietaire, estResponsableDe, peutDecider, peutVoirContenuMedical, peutVoirDossier } from '../domain/authz';
import { Qualification, StatutJustificatif, StatutTraitement, TypeSignalement, Utilisateur } from '../domain/types';
import { lireParametres, trouverCategorie } from './parametres';
import { journaliser, notifier } from './journal';
import { nomComplet, rhDuCampus } from './utilisateurs';

export interface Signalement {
  id: string;
  userId: string;
  userNom: string;
  managerId: string | null;
  campusId: string;
  serviceId: string;
  type: TypeSignalement;
  categorie: string;
  categorieLibelle: string;
  medical: boolean;
  dateDebut: string;
  dateFin: string | null;
  dureeEstimee: string;
  commentaire: string;
  retard: null | {
    heurePrevue: string;
    heureArriveeEstimee: string | null;
    heureArriveeReelle: string | null;
    minutes: number | null;
  };
  aPosteriori: boolean;
  statutTraitement: StatutTraitement;
  qualification: Qualification;
  justificatifStatut: StatutJustificatif;
  echeanceJustificatif: string | null;
  priseConnaissance: null | { parId: string; parNom: string; date: unknown };
  decision: null | { qualification: Qualification; motif: string; auteurNom: string; date: unknown };
  /** Imputation sur le solde de congés (après validation hiérarchique). */
  imputation?: null | { jours: number; annee: number; parNom: string; date: unknown };
  nbJustificatifs: number;
  declareLe: unknown;
}

const lien = (id: string) => `/signalements/detail?id=${id}`;
const libelleType = (t: TypeSignalement) => (t === 'absence' ? 'absence' : 'retard');
const LIB_QUALIF: Record<Qualification, string> = { a_examiner: 'à examiner', justifie: 'justifié', non_justifie: 'non justifié' };
const LIB_STATUT: Record<StatutTraitement, string> = { declare: 'déclaré', en_cours: 'en cours', cloture: 'clôturé' };
const dUn = (t: TypeSignalement) => (t === 'absence' ? "d'absence" : 'de retard');

export function versSignalement(snap: DocumentSnapshot): Signalement {
  return { id: snap.id, ...(snap.data() as Omit<Signalement, 'id'>) };
}

/** Masque le contenu médical pour les profils non habilités (responsable). */
export function vueSignalement(acteur: Utilisateur, s: Signalement): Signalement {
  if (!s.medical || peutVoirContenuMedical(acteur, s)) return s;
  return { ...s, categorie: 'confidentiel', categorieLibelle: 'Motif confidentiel', commentaire: '' };
}

export interface SaisieSignalement {
  type: TypeSignalement;
  categorie: string;
  dateDebut: string;
  dateFin?: string | null;
  dureeEstimee?: string;
  commentaire?: string;
  heurePrevue?: string;
  heureArriveeEstimee?: string | null;
  heureArriveeReelle?: string | null;
  cleIdempotence: string;
}

export async function declarer(user: Utilisateur, s: SaisieSignalement): Promise<{ id: string; doublon: boolean }> {
  const p = await lireParametres();
  const cat = trouverCategorie(p, s.categorie, s.type);
  if (!cat) throw invalide('Catégorie de motif inconnue pour ce type de signalement.');
  if (s.dateFin && s.dateFin < s.dateDebut) throw invalide('La date de fin doit être postérieure à la date de début.');
  if (s.type === 'retard' && !s.heurePrevue) throw invalide("L'heure de prise de poste prévue est obligatoire.");

  const jour = aujourdhui();
  const refIdem = db().collection(COL.idempotence).doc(`${user.uid}_${s.cleIdempotence}`);
  const ref = db().collection(COL.signalements).doc();

  const r = await db().runTransaction(async (tx) => {
    const idem = await tx.get(refIdem);
    if (idem.exists) return { id: (idem.get('ids') as string[])[0], doublon: true };

    const retard =
      s.type === 'retard'
        ? {
            heurePrevue: s.heurePrevue!,
            heureArriveeEstimee: s.heureArriveeEstimee ?? null,
            heureArriveeReelle: s.heureArriveeReelle ?? null,
            minutes: s.heureArriveeReelle ? minutesDeRetard(s.heurePrevue!, s.heureArriveeReelle) : null,
          }
        : null;

    tx.set(ref, {
      userId: user.uid,
      userNom: nomComplet(user),
      managerId: user.managerId,
      campusId: user.campusId,
      serviceId: user.serviceId,
      type: s.type,
      categorie: cat.code,
      categorieLibelle: cat.libelle,
      medical: cat.medical,
      dateDebut: s.dateDebut,
      dateFin: s.type === 'retard' ? s.dateDebut : (s.dateFin ?? null),
      dureeEstimee: s.dureeEstimee ?? '',
      commentaire: s.commentaire ?? '',
      retard,
      aPosteriori: s.dateDebut < jour,
      statutTraitement: 'declare',
      qualification: 'a_examiner',
      justificatifStatut: cat.justificatif,
      echeanceJustificatif:
        cat.justificatif === 'a_fournir' ? ajouterJours(s.dateDebut > jour ? s.dateDebut : jour, cat.delaiJustificatifJours) : null,
      priseConnaissance: null,
      decision: null,
      nbJustificatifs: 0,
      declareLe: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    journaliser(tx, user, {
      entite: 'signalement',
      entiteId: ref.id,
      userId: user.uid,
      action: 'declaration',
      resume: `Signalement ${dUn(s.type)} déclaré${s.dateDebut < jour ? ' a posteriori' : ''}.`,
    });
    tx.set(refIdem, { ids: [ref.id], createdAt: FieldValue.serverTimestamp() });
    return { id: ref.id, doublon: false };
  });

  if (!r.doublon) {
    const rh = (await rhDuCampus(user.campusId)).filter((x) => x.uid !== user.uid);
    const batch = db().batch();
    // Pas de contenu médical dans les notifications : seul le type est indiqué.
    notifier(batch, [user.managerId, ...rh.map((x) => x.uid)], {
      titre: `Nouveau signalement ${dUn(s.type)}`,
      message: `${nomComplet(user)} a signalé ${s.type === 'absence' ? 'une absence' : 'un retard'} pour le ${s.dateDebut}.`,
      lien: lien(r.id),
    });
    await batch.commit();
  }
  return r;
}

export async function chargerSignalement(acteur: Utilisateur, id: string): Promise<Signalement> {
  const snap = await db().collection(COL.signalements).doc(id).get();
  if (!snap.exists) throw introuvable('Signalement introuvable.');
  const s = versSignalement(snap);
  if (!peutVoirDossier(acteur, s)) throw interdit();
  return s;
}

export function actionsSignalement(acteur: Utilisateur, s: Signalement): string[] {
  const a: string[] = [];
  const proprietaire = estProprietaire(acteur, s);
  const rh = peutDecider(acteur, s);
  if ((proprietaire || rh) && s.statutTraitement !== 'cloture') a.push('completer');
  if (proprietaire && s.statutTraitement !== 'cloture' && ['a_fournir', 'refuse', 'non_requis', 'recu_a_examiner'].includes(s.justificatifStatut)) {
    a.push('deposer_justificatif');
  }
  if (estResponsableDe(acteur, s) && !s.priseConnaissance) a.push('prendre_connaissance');
  if (rh) a.push('traiter');
  if (rh && s.type === 'absence' && !s.imputation && s.dateFin && (!s.managerId || s.priseConnaissance)) a.push('imputer_conges');
  return a;
}

export interface Complement {
  dateFin?: string | null;
  dureeEstimee?: string;
  commentaire?: string;
  heureArriveeEstimee?: string | null;
  heureArriveeReelle?: string | null;
  motif?: string;
}

/**
 * Compléter (date de fin, arrivée réelle…) ou corriger un signalement. Toute
 * modification d'une valeur déjà renseignée est une correction : elle exige un
 * motif et conserve auteur, date et ancienne valeur.
 */
export async function completer(acteur: Utilisateur, id: string, c: Complement) {
  await db().runTransaction(async (tx) => {
    const ref = db().collection(COL.signalements).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw introuvable('Signalement introuvable.');
    const s = versSignalement(snap);
    if (!(estProprietaire(acteur, s) || peutDecider(acteur, s))) throw interdit();
    if (s.statutTraitement === 'cloture') throw conflit('CLOTURE', 'Ce signalement est clôturé et ne peut plus être modifié.');

    const maj: Record<string, unknown> = {};
    const changements: Record<string, { avant: unknown; apres: unknown }> = {};
    let correction = false;
    const suivre = (champ: string, avant: unknown, apres: unknown) => {
      if (apres === undefined || apres === avant) return;
      if (avant !== null && avant !== undefined && avant !== '') correction = true;
      changements[champ] = { avant, apres };
    };

    if (s.type === 'absence') {
      if (c.dateFin !== undefined) {
        if (c.dateFin && c.dateFin < s.dateDebut) throw invalide('La date de fin doit être postérieure à la date de début.');
        suivre('dateFin', s.dateFin, c.dateFin);
        maj.dateFin = c.dateFin;
      }
      if (c.dureeEstimee !== undefined) {
        suivre('dureeEstimee', s.dureeEstimee, c.dureeEstimee);
        maj.dureeEstimee = c.dureeEstimee;
      }
    } else if (s.retard) {
      const r = { ...s.retard };
      if (c.heureArriveeEstimee !== undefined) {
        suivre('heureArriveeEstimee', r.heureArriveeEstimee, c.heureArriveeEstimee);
        r.heureArriveeEstimee = c.heureArriveeEstimee;
      }
      if (c.heureArriveeReelle !== undefined) {
        suivre('heureArriveeReelle', r.heureArriveeReelle, c.heureArriveeReelle);
        r.heureArriveeReelle = c.heureArriveeReelle;
        // La durée définitive est calculée à partir de l'arrivée réelle.
        r.minutes = c.heureArriveeReelle ? minutesDeRetard(r.heurePrevue, c.heureArriveeReelle) : null;
      }
      maj.retard = r;
    }
    if (c.commentaire !== undefined && c.commentaire !== s.commentaire) {
      if (s.commentaire) correction = true;
      changements.commentaire = { avant: '(masqué)', apres: '(masqué)' };
      maj.commentaire = c.commentaire;
    }
    if (!Object.keys(changements).length) throw invalide('Aucune modification à enregistrer.');
    if (correction && !c.motif?.trim()) throw invalide('Une correction doit être motivée.');

    tx.update(ref, { ...maj, updatedAt: FieldValue.serverTimestamp() });
    journaliser(tx, acteur, {
      entite: 'signalement',
      entiteId: id,
      userId: s.userId,
      action: correction ? 'correction' : 'complement',
      resume: `${correction ? 'Correction' : 'Complément'} : ${Object.keys(changements).join(', ')}.`,
      motif: c.motif || null,
      details: changements,
    });
  });
}

export async function prendreConnaissance(acteur: Utilisateur, id: string) {
  await db().runTransaction(async (tx) => {
    const ref = db().collection(COL.signalements).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw introuvable('Signalement introuvable.');
    const s = versSignalement(snap);
    if (!estResponsableDe(acteur, s)) throw interdit('Seul le responsable hiérarchique peut prendre connaissance de ce signalement.');
    if (s.priseConnaissance) return;
    tx.update(ref, {
      priseConnaissance: { parId: acteur.uid, parNom: nomComplet(acteur), date: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
    });
    journaliser(tx, acteur, {
      entite: 'signalement',
      entiteId: id,
      userId: s.userId,
      action: 'prise_connaissance',
      resume: 'Prise de connaissance par le responsable (ne vaut pas décision RH).',
    });
  });
}

export interface Traitement {
  qualification?: Qualification;
  statutTraitement?: StatutTraitement;
  motif?: string;
  demanderJustificatif?: { echeance: string } | null;
  /** Imputer l'absence sur le solde de congés (validation hiérarchique requise). */
  imputerConges?: boolean;
}

/** Traitement RH : qualification, demande de complément, clôture. */
export async function traiter(acteur: Utilisateur, id: string, t: Traitement) {
  if (t.qualification === 'non_justifie' && !t.motif?.trim()) {
    throw invalide('La qualification « non justifié » doit être motivée.');
  }
  if (t.imputerConges && !t.motif?.trim()) throw invalide('L’imputation sur les congés doit être motivée.');
  const p = t.imputerConges ? await lireParametres() : null;
  const avantSnap = await db().collection(COL.signalements).doc(id).get();
  const cible = t.imputerConges && avantSnap.exists ? await lireUtilisateur(avantSnap.get('userId')) : null;
  await db().runTransaction(async (tx) => {
    const ref = db().collection(COL.signalements).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw introuvable('Signalement introuvable.');
    const s = versSignalement(snap);
    // Lecture de la dotation AVANT toute écriture (contrainte des transactions)
    let imputation: null | { jours: number; annee: number; dot: Awaited<ReturnType<typeof lireDotationTx>> } = null;
    if (t.imputerConges && p) {
      if (s.type !== 'absence') throw invalide('Seule une absence peut être imputée sur les congés.');
      if (s.imputation) throw conflit('DEJA_IMPUTE', 'Cette absence a déjà été imputée sur les congés.');
      if (!s.dateFin) throw invalide('Renseignez d’abord la date de fin de l’absence.');
      if (s.managerId && !s.priseConnaissance) {
        throw conflit('VALIDATION_HIERARCHIQUE', 'L’imputation sur les congés nécessite d’abord la validation (prise de connaissance) du responsable hiérarchique.');
      }
      if (anneeDe(s.dateDebut) !== anneeDe(s.dateFin)) throw invalide('Une absence sur deux années doit être imputée par ajustement RH, année par année.');
      const jours = sommeJours(joursOuvresDeLaPeriode(s.dateDebut, s.dateFin, p));
      if (jours <= 0) throw invalide('Cette absence ne comporte aucun jour ouvré.');
      const dot = await lireDotationTx(tx, s.userId, anneeDe(s.dateDebut), p.dotationParDefaut);
      imputation = { jours, annee: anneeDe(s.dateDebut), dot };
    }
    if (!peutDecider(acteur, s)) {
      throw interdit(
        estProprietaire(acteur, s)
          ? 'Vous ne pouvez pas traiter votre propre signalement : un autre gestionnaire RH doit être désigné.'
          : 'Ce signalement ne relève pas de votre périmètre RH.',
      );
    }
    if (s.statutTraitement === 'cloture' && t.statutTraitement !== 'en_cours') {
      throw conflit('CLOTURE', 'Ce signalement est clôturé. Rouvrez-le (statut « en cours ») pour le modifier.');
    }
    const maj: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    const resumes: string[] = [];
    const destinataireNotif: string[] = [];

    if (t.demanderJustificatif) {
      if (t.demanderJustificatif.echeance < aujourdhui()) throw invalide("L'échéance doit être dans le futur.");
      maj.justificatifStatut = 'a_fournir';
      maj.echeanceJustificatif = t.demanderJustificatif.echeance;
      resumes.push(`Justificatif demandé (échéance ${t.demanderJustificatif.echeance})`);
      destinataireNotif.push('complement');
    }
    if (t.qualification && t.qualification !== s.qualification) {
      maj.qualification = t.qualification;
      maj.decision = { qualification: t.qualification, motif: t.motif ?? '', auteurNom: nomComplet(acteur), date: FieldValue.serverTimestamp() };
      resumes.push(`Qualification : ${LIB_QUALIF[t.qualification]}`);
      destinataireNotif.push('decision');
    }
    if (imputation) {
      const { jours, annee, dot } = imputation;
      const ajustements = Math.round((dot.ajustements - jours) * 2) / 2;
      let soldeApres: number;
      try {
        soldeApres = verifierSoldeNonNegatif({ ...dot, ajustements });
      } catch {
        throw conflit('SOLDE_INSUFFISANT', `Solde insuffisant pour imputer ${formaterJours(jours)} (solde : ${formaterJours(calculerSolde(dot))}).`);
      }
      if (cible) creerDotationSiAbsente(tx, dot, cible);
      tx.update(dot.ref, { ajustements, updatedAt: FieldValue.serverTimestamp() });
      ajouterMouvement(tx, {
        userId: s.userId,
        annee,
        type: 'IMPUTATION_ABSENCE',
        jours: -jours,
        motif: `Absence du ${s.dateDebut} au ${s.dateFin} imputée sur les congés : ${t.motif}`,
        auteur: acteur,
        soldeApres,
      });
      maj.imputation = { jours, annee, parNom: nomComplet(acteur), date: FieldValue.serverTimestamp() };
      resumes.push(`Absence imputée sur les congés : ${formaterJours(jours)} (solde après : ${formaterJours(soldeApres)})`);
      destinataireNotif.push('imputation');
    }
    const nouveauStatut = t.statutTraitement ?? (s.statutTraitement === 'declare' ? 'en_cours' : s.statutTraitement);
    if (nouveauStatut !== s.statutTraitement) {
      maj.statutTraitement = nouveauStatut;
      resumes.push(`Statut de traitement : ${LIB_STATUT[nouveauStatut]}`);
    }
    if (!resumes.length) throw invalide('Aucune modification à enregistrer.');

    tx.update(ref, maj);
    journaliser(tx, acteur, {
      entite: 'signalement',
      entiteId: id,
      userId: s.userId,
      action: 'traitement_rh',
      resume: resumes.join(' ; ') + '.',
      motif: t.motif || null,
    });
    if (destinataireNotif.includes('complement')) {
      notifier(tx, [s.userId], {
        titre: 'Justificatif demandé',
        message: `Merci de déposer un justificatif avant le ${t.demanderJustificatif!.echeance}.`,
        lien: lien(id),
      });
    }
    if (destinataireNotif.includes('imputation') && imputation) {
      notifier(tx, [s.userId], {
        titre: 'Absence imputée sur vos congés',
        message: `${formaterJours(imputation.jours)} ont été décomptés de votre solde ${imputation.annee}. Motif : ${t.motif}`,
        lien: lien(id),
      });
    }
    if (destinataireNotif.includes('decision')) {
      notifier(tx, [s.userId], {
        titre: 'Décision RH sur votre signalement',
        message: `Votre ${libelleType(s.type)} du ${s.dateDebut} a été ${s.type === 'absence' ? 'qualifiée' : 'qualifié'} « ${LIB_QUALIF[t.qualification!]} ».`,
        lien: lien(id),
      });
    }
  });
}

