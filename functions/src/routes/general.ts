import { Router } from 'express';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { acteur, exigerRole } from '../middleware/authentification';
import { auth, COL, db } from '../infra/firebase';
import { ErreurHttp, interdit, introuvable, invalide } from '../infra/erreurs';
import { aLeRole, peutModifierParametres } from '../domain/authz';
import { anneeDe, aujourdhui, estDateValide } from '../domain/calendrier';
import { calculerSolde } from '../domain/solde';
import { STATUTS_EN_ATTENTE } from '../domain/types';
import { appliquerPerimetre } from '../services/listes';
import { ecrireParametres, lireParametres } from '../services/parametres';
import { journaliser } from '../services/journal';
import { lireDotation } from '../services/dotations';
import { profilPublic } from '../services/utilisateurs';
import { date, motDePasseRobuste, texte } from './schemas';

export const routesGenerales = Router();

/** Profil de l'utilisateur connecté + compteur de notifications non lues. */
routesGenerales.get('/moi', async (req, res) => {
  const u = acteur(req);
  const nonLues = await db().collection(COL.notifications).where('userId', '==', u.uid).where('lu', '==', false).count().get();
  res.json({ ...profilPublic(u), notificationsNonLues: nonLues.data().count });
});

/**
 * Choix du mot de passe personnel (première connexion) ou changement volontaire.
 * Exige une saisie récente du mot de passe actuel (ré-authentification côté
 * navigateur, claim auth_time < 5 min) : un jeton volé ne suffit pas.
 */
routesGenerales.post('/moi/mot-de-passe', async (req, res) => {
  const u = acteur(req);
  const b = z.object({ nouveau: motDePasseRobuste }).parse(req.body);
  if (!req.authTime || Date.now() / 1000 - req.authTime > 300) {
    throw new ErreurHttp(401, 'REAUTHENTIFICATION_REQUISE', 'Pour des raisons de sécurité, saisissez de nouveau votre mot de passe actuel.');
  }
  const local = u.email.split('@')[0].toLowerCase();
  if (local.length >= 4 && b.nouveau.toLowerCase().includes(local)) {
    throw invalide('Le mot de passe ne doit pas contenir votre identifiant.');
  }
  await auth().updateUser(u.uid, { password: b.nouveau });
  const batch = db().batch();
  batch.update(db().collection(COL.users).doc(u.uid), {
    motDePasseProvisoire: false,
    provisoireExpireLe: null,
    motDePasseModifieLe: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  journaliser(batch, u, {
    entite: 'utilisateur',
    entiteId: u.uid,
    action: u.motDePasseProvisoire ? 'activation_compte' : 'changement_mot_de_passe',
    resume: u.motDePasseProvisoire ? 'Mot de passe personnel choisi (première connexion).' : 'Mot de passe modifié par son titulaire.',
  });
  await batch.commit();
  // Les autres sessions ouvertes sont fermées ; le navigateur se reconnecte avec le nouveau mot de passe.
  await auth().revokeRefreshTokens(u.uid);
  res.json({ ok: true });
});

/** Référentiels (campus, services) et responsables (pour les formulaires). */
routesGenerales.get('/referentiels', async (req, res) => {
  const u = acteur(req);
  const [campus, services] = await Promise.all([db().collection(COL.campus).get(), db().collection(COL.services).get()]);
  let responsables: Array<{ uid: string; nomComplet: string }> = [];
  if (aLeRole(u, 'admin') || aLeRole(u, 'rh')) {
    const snap = await db().collection(COL.users).where('roles', 'array-contains', 'responsable').get();
    responsables = snap.docs.filter((d) => d.get('actif') !== false).map((d) => ({ uid: d.id, nomComplet: `${d.get('prenom')} ${d.get('nom')}` }));
  }
  res.json({
    campus: campus.docs.map((d) => ({ id: d.id, nom: d.get('nom') })),
    services: services.docs.map((d) => ({ id: d.id, nom: d.get('nom') })),
    responsables,
  });
});

// ---------------------------------------------------------------------------
// Paramètres RH
// ---------------------------------------------------------------------------

routesGenerales.get('/parametres', async (_req, res) => {
  res.json(await lireParametres());
});

routesGenerales.put('/parametres', exigerRole('rh'), async (req, res) => {
  const u = acteur(req);
  if (!peutModifierParametres(u)) throw interdit('Seul un gestionnaire RH au périmètre global peut modifier les paramètres.');
  const b = z
    .object({
      dotationParDefaut: z.number().min(0).max(366).refine((n) => Number.isInteger(n * 2)).optional(),
      joursOuvres: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
      joursFeries: z.array(z.string().refine(estDateValide)).max(200).optional(),
      fiche: z
        .object({
          entite: texte(40),
          titre: texte(80),
          dateApplication: texte(20),
          version: texte(10),
          code: texte(30),
          libelleRaf: texte(60),
          signataireRaf: texte(80),
          libelleDirection: texte(60),
          signataireDirection: texte(80),
        })
        .partial()
        .optional(),
      motif: texte(500).min(3, 'motif obligatoire'),
    })
    .parse(req.body);
  const { motif, fiche, ...reste } = b;
  const avant = await lireParametres();
  const maj = { ...reste, ...(fiche ? { fiche: { ...avant.fiche, ...fiche } } : {}) };
  await ecrireParametres(maj);
  const batch = db().batch();
  journaliser(batch, u, {
    entite: 'parametres',
    entiteId: 'general',
    action: 'modification_parametres',
    resume: `Paramètres modifiés : ${Object.keys(maj).join(', ')}.`,
    motif,
    details: { avant: Object.fromEntries(Object.keys(maj).map((k) => [k, (avant as unknown as Record<string, unknown>)[k]])), apres: maj },
  });
  await batch.commit();
  res.json(await lireParametres());
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

routesGenerales.get('/notifications', async (req, res) => {
  const u = acteur(req);
  const q = z
    .object({ nonLues: z.enum(['true', 'false']).optional(), limite: z.coerce.number().int().min(1).max(50).default(20), curseur: z.string().optional() })
    .parse(req.query);
  let requete = db().collection(COL.notifications).where('userId', '==', u.uid);
  if (q.nonLues === 'true') requete = requete.where('lu', '==', false);
  requete = requete.orderBy('createdAt', 'desc');
  if (q.curseur) {
    const c = await db().collection(COL.notifications).doc(q.curseur).get();
    if (c.exists && c.get('userId') === u.uid) requete = requete.startAfter(c);
  }
  const snap = await requete.limit(q.limite + 1).get();
  const docs = snap.docs.slice(0, q.limite);
  res.json({ elements: docs.map((d) => ({ id: d.id, ...d.data() })), suivant: snap.docs.length > q.limite ? docs[docs.length - 1].id : null });
});

routesGenerales.post('/notifications/:id/lue', async (req, res) => {
  const u = acteur(req);
  const ref = db().collection(COL.notifications).doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) throw introuvable('Notification introuvable.');
  if (snap.get('userId') !== u.uid) throw interdit();
  await ref.update({ lu: true, luLe: FieldValue.serverTimestamp() });
  res.json({ ok: true });
});

routesGenerales.post('/notifications/tout-lire', async (req, res) => {
  const u = acteur(req);
  const snap = await db().collection(COL.notifications).where('userId', '==', u.uid).where('lu', '==', false).limit(400).get();
  const batch = db().batch();
  snap.docs.forEach((d) => batch.update(d.ref, { lu: true, luLe: FieldValue.serverTimestamp() }));
  await batch.commit();
  res.json({ ok: true, nombre: snap.size });
});

// ---------------------------------------------------------------------------
// Planning des congés approuvés (sans motif ni contenu sensible)
// ---------------------------------------------------------------------------

routesGenerales.get('/planning', async (req, res) => {
  const u = acteur(req);
  const q = z.object({ du: date, au: date, vue: z.enum(['moi', 'equipe', 'rh', 'direction']).default('moi') }).parse(req.query);
  let requete = appliquerPerimetre(db().collection(COL.demandes), u, q.vue);
  if (!requete) {
    res.json({ elements: [] });
    return;
  }
  const snap = await requete.where('statut', '==', 'approuvee').where('dateDebut', '<=', q.au).orderBy('dateDebut', 'desc').limit(500).get();
  const elements = snap.docs
    .filter((d) => d.get('dateFin') >= q.du)
    .map((d) => ({
      id: d.id,
      userId: d.get('userId'),
      userNom: d.get('userNom'),
      serviceId: d.get('serviceId'),
      campusId: d.get('campusId'),
      dateDebut: d.get('dateDebut'),
      dateFin: d.get('dateFin'),
      demiJourneeDebut: d.get('demiJourneeDebut'),
      demiJourneeFin: d.get('demiJourneeFin'),
    }))
    .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
  res.json({ elements });
});

// ---------------------------------------------------------------------------
// Tableau de bord par rôle
// ---------------------------------------------------------------------------

routesGenerales.get('/tableau-de-bord', async (req, res) => {
  const u = acteur(req);
  const compter = async (q: FirebaseFirestore.Query | null) => (q ? (await q.count().get()).data().count : 0);
  const annee = anneeDe(aujourdhui());
  const p = await lireParametres();

  const dot = await lireDotation(u.uid, annee, p.dotationParDefaut);
  const resultat: Record<string, unknown> = {
    annee,
    collaborateur: {
      solde: calculerSolde(dot),
      joursAttribues: dot.joursAttribues,
      demandesEnAttente: await compter(db().collection(COL.demandes).where('userId', '==', u.uid).where('statut', 'in', STATUTS_EN_ATTENTE)),
      signalementsOuverts: await compter(db().collection(COL.signalements).where('userId', '==', u.uid).where('statutTraitement', 'in', ['declare', 'en_cours'])),
      justificatifsAFournir: await compter(db().collection(COL.signalements).where('userId', '==', u.uid).where('justificatifStatut', 'in', ['a_fournir', 'refuse'])),
    },
  };
  if (aLeRole(u, 'responsable')) {
    resultat.responsable = {
      avisEnAttente: await compter(db().collection(COL.demandes).where('managerId', '==', u.uid).where('statut', '==', 'soumise')),
      signalementsEquipe: await compter(db().collection(COL.signalements).where('managerId', '==', u.uid).where('statutTraitement', 'in', ['declare', 'en_cours'])),
    };
  }
  if (aLeRole(u, 'rh')) {
    const base = (col: string) => appliquerPerimetre(db().collection(col), u, 'rh');
    resultat.rh = {
      decisionsEnAttente: await compter(base(COL.demandes)?.where('statut', '==', 'en_decision_rh') ?? null),
      annulationsDemandees: await compter(base(COL.demandes)?.where('annulationDemandee', '==', true) ?? null),
      signalementsATraiter: await compter(base(COL.signalements)?.where('statutTraitement', 'in', ['declare', 'en_cours']) ?? null),
      justificatifsAExaminer: await compter(base(COL.justificatifs)?.where('statut', '==', 'recu_a_examiner') ?? null),
    };
  }
  if (aLeRole(u, 'direction')) {
    resultat.direction = {
      fichesASigner: await compter(appliquerPerimetre(db().collection(COL.demandes), u, 'direction')?.where('ficheStatut', '==', 'attente_direction') ?? null),
    };
  }
  if (aLeRole(u, 'admin')) {
    resultat.admin = {
      comptesActifs: await compter(db().collection(COL.users).where('actif', '==', true)),
      comptesDesactives: await compter(db().collection(COL.users).where('actif', '==', false)),
    };
  }
  res.json(resultat);
});
