/**
 * Administration : comptes, rôles, rattachements, référentiels.
 * Pas d'inscription publique : seuls les administrateurs créent des comptes.
 * Chaque nouveau compte reçoit par e-mail un mot de passe provisoire et le lien
 * de première connexion ; l'employé choisit alors son mot de passe personnel.
 * Le rôle administrateur ne donne accès à aucun dossier ni justificatif.
 */
import { Router } from 'express';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { acteur, exigerRole } from '../middleware/authentification';
import { auth, COL, db } from '../infra/firebase';
import { conflit, interdit, introuvable, invalide } from '../infra/erreurs';
import { aLeRole } from '../domain/authz';
import { anneeDe, aujourdhui } from '../domain/calendrier';
import { ROLES, Utilisateur } from '../domain/types';
import { journaliser } from '../services/journal';
import { lireParametres } from '../services/parametres';
import { creerDotationSiAbsente, lireDotationTx } from '../services/dotations';
import { lireUtilisateur, nomComplet, profilPublic, versUtilisateur } from '../services/utilisateurs';
import { envoyerInvitation, expirationInvitation, genererMotDePasseProvisoire } from '../services/comptes';
import { texte } from './schemas';

export const routesAdmin = Router();
routesAdmin.use(exigerRole('admin'));

const perimetre = z.object({ tous: z.boolean(), campusIds: z.array(z.string().max(50)).max(30) });
const champsProfil = {
  nom: texte(80).min(1),
  prenom: texte(80).min(1),
  roles: z.array(z.enum(ROLES)).min(1),
  campusId: z.string().min(1).max(50),
  serviceId: z.string().min(1).max(50),
  fonction: texte(100).optional(),
  managerId: z.string().max(128).nullable(),
  perimetreRh: perimetre.optional(),
};

async function verifierRattachement(uid: string | null, b: { managerId: string | null; campusId: string; serviceId: string }) {
  const [campus, service] = await Promise.all([
    db().collection(COL.campus).doc(b.campusId).get(),
    db().collection(COL.services).doc(b.serviceId).get(),
  ]);
  if (!campus.exists) throw invalide('Campus inconnu.');
  if (!service.exists) throw invalide('Service inconnu.');
  if (b.managerId) {
    if (b.managerId === uid) throw invalide('Un collaborateur ne peut pas être son propre responsable.');
    const m = await lireUtilisateur(b.managerId);
    if (!m || !m.actif || !aLeRole(m, 'responsable')) throw invalide('Le responsable désigné doit être un compte actif ayant le rôle « responsable ».');
  }
}

routesAdmin.get('/utilisateurs', async (req, res) => {
  const q = z.object({ limite: z.coerce.number().int().min(1).max(100).default(25), curseur: z.string().optional() }).parse(req.query);
  let requete = db().collection(COL.users).orderBy('nom').orderBy('prenom');
  if (q.curseur) {
    const c = await db().collection(COL.users).doc(q.curseur).get();
    if (c.exists) requete = requete.startAfter(c);
  }
  const snap = await requete.limit(q.limite + 1).get();
  const users = snap.docs.slice(0, q.limite).map((d) => profilPublic(versUtilisateur(d)!));
  res.json({ elements: users, suivant: snap.docs.length > q.limite ? users[users.length - 1].uid : null });
});

routesAdmin.post('/utilisateurs', async (req, res) => {
  const u = acteur(req);
  const b = z
    .object({
      email: z.string().email().max(200),
      ...champsProfil,
    })
    .parse(req.body);
  await verifierRattachement(null, b);

  // Mot de passe provisoire aléatoire : jamais choisi ni vu par l'administrateur
  // (sauf si l'e-mail ne peut pas partir), jamais stocké par l'application.
  const motDePasse = genererMotDePasseProvisoire();
  const expireLe = expirationInvitation();
  let uid: string;
  try {
    const cree = await auth().createUser({
      email: b.email.toLowerCase(),
      password: motDePasse,
      displayName: `${b.prenom} ${b.nom}`,
      emailVerified: false,
    });
    uid = cree.uid;
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/email-already-exists') throw conflit('EMAIL_EXISTANT', 'Un compte existe déjà avec cette adresse.');
    throw e;
  }

  const p = await lireParametres();
  const profil: Omit<Utilisateur, 'uid'> = {
    email: b.email.toLowerCase(),
    nom: b.nom,
    prenom: b.prenom,
    roles: b.roles.includes('collaborateur') ? b.roles : ['collaborateur', ...b.roles],
    campusId: b.campusId,
    serviceId: b.serviceId,
    fonction: b.fonction ?? '',
    managerId: b.managerId,
    actif: true,
    perimetreRh: b.perimetreRh ?? { tous: false, campusIds: [] },
  };
  await db().runTransaction(async (tx) => {
    const dot = await lireDotationTx(tx, uid, anneeDe(aujourdhui()), p.dotationParDefaut);
    tx.set(db().collection(COL.users).doc(uid), {
      ...profil,
      motDePasseProvisoire: true,
      provisoireExpireLe: expireLe,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    creerDotationSiAbsente(tx, dot, { uid, ...profil });
    journaliser(tx, u, { entite: 'utilisateur', entiteId: uid, action: 'creation_compte', resume: `Compte créé pour ${b.prenom} ${b.nom} (${profil.roles.join(', ')}).` });
  });

  const invitation = await envoyerInvitation(profil, motDePasse, expireLe);
  res.status(201).json({ uid, invitation });
});

routesAdmin.patch('/utilisateurs/:uid', async (req, res) => {
  const u = acteur(req);
  const uid = req.params.uid;
  const avant = await lireUtilisateur(uid);
  if (!avant) throw introuvable('Utilisateur introuvable.');
  const b = z.object(champsProfil).partial().parse(req.body);
  const apres = { ...avant, ...b };
  await verifierRattachement(uid, apres);
  // Séparation des pouvoirs : un administrateur ne modifie ni ses propres rôles ni son périmètre
  // (sinon il pourrait s'attribuer le rôle RH et accéder aux dossiers et justificatifs).
  if (uid === u.uid && (b.roles !== undefined || b.perimetreRh !== undefined)) {
    throw interdit('Vos propres rôles et votre périmètre doivent être modifiés par un autre administrateur.');
  }
  if (b.roles && !b.roles.includes('collaborateur')) b.roles = ['collaborateur', ...b.roles];

  await db().collection(COL.users).doc(uid).update({ ...b, updatedAt: FieldValue.serverTimestamp() });

  // Propagation du rattachement sur les dossiers pour que les accès suivent
  const rattachementModifie = apres.managerId !== avant.managerId || apres.campusId !== avant.campusId;
  if (rattachementModifie) {
    for (const col of [COL.demandes, COL.signalements, COL.justificatifs, COL.dotations]) {
      const snap = await db().collection(col).where('userId', '==', uid).get();
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db().batch();
        snap.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { managerId: apres.managerId, campusId: apres.campusId }));
        await batch.commit();
      }
    }
  }
  const batch = db().batch();
  journaliser(batch, u, {
    entite: 'utilisateur',
    entiteId: uid,
    action: 'modification_compte',
    resume: `Compte de ${nomComplet(apres)} modifié (${Object.keys(b).join(', ')}).`,
    details: { avant: { roles: avant.roles, managerId: avant.managerId, campusId: avant.campusId, serviceId: avant.serviceId }, apres: b },
  });
  await batch.commit();
  res.json(profilPublic((await lireUtilisateur(uid))!));
});

async function changerActivation(acteurU: Utilisateur, uid: string, actif: boolean) {
  if (uid === acteurU.uid) throw invalide('Vous ne pouvez pas désactiver votre propre compte.');
  const cible = await lireUtilisateur(uid);
  if (!cible) throw introuvable('Utilisateur introuvable.');
  await auth().updateUser(uid, { disabled: !actif });
  if (!actif) await auth().revokeRefreshTokens(uid);
  const batch = db().batch();
  batch.update(db().collection(COL.users).doc(uid), { actif, updatedAt: FieldValue.serverTimestamp() });
  journaliser(batch, acteurU, {
    entite: 'utilisateur',
    entiteId: uid,
    action: actif ? 'reactivation' : 'desactivation',
    resume: `Compte de ${nomComplet(cible)} ${actif ? 'réactivé' : 'désactivé'}.`,
  });
  await batch.commit();
}

routesAdmin.post('/utilisateurs/:uid/desactiver', async (req, res) => {
  await changerActivation(acteur(req), req.params.uid, false);
  res.json({ ok: true });
});

routesAdmin.post('/utilisateurs/:uid/reactiver', async (req, res) => {
  await changerActivation(acteur(req), req.params.uid, true);
  res.json({ ok: true });
});

/**
 * Renvoie une invitation : nouveau mot de passe provisoire (l'ancien cesse de
 * fonctionner), sessions fermées, e-mail envoyé. Sert aussi lorsqu'un employé a
 * perdu son mot de passe ou laissé expirer son invitation.
 */
routesAdmin.post('/utilisateurs/:uid/renvoyer-invitation', async (req, res) => {
  const u = acteur(req);
  if (req.params.uid === u.uid) throw invalide('Utilisez « Changer mon mot de passe » pour votre propre compte.');
  const cible = await lireUtilisateur(req.params.uid);
  if (!cible) throw introuvable('Utilisateur introuvable.');
  if (!cible.actif) throw invalide('Réactivez le compte avant de renvoyer une invitation.');
  const motDePasse = genererMotDePasseProvisoire();
  const expireLe = expirationInvitation();
  await auth().updateUser(cible.uid, { password: motDePasse });
  await auth().revokeRefreshTokens(cible.uid);
  const batch = db().batch();
  batch.update(db().collection(COL.users).doc(cible.uid), {
    motDePasseProvisoire: true,
    provisoireExpireLe: expireLe,
    updatedAt: FieldValue.serverTimestamp(),
  });
  journaliser(batch, u, {
    entite: 'utilisateur',
    entiteId: cible.uid,
    action: 'renvoi_invitation',
    resume: `Nouvelle invitation envoyée à ${nomComplet(cible)} (mot de passe provisoire régénéré).`,
  });
  await batch.commit();
  res.json({ invitation: await envoyerInvitation(cible, motDePasse, expireLe, true) });
});

const referentiel = z.object({ id: z.string().regex(/^[a-z0-9-]{2,40}$/, 'identifiant en minuscules (a-z, 0-9, -)'), nom: texte(100).min(2) });

for (const col of [COL.campus, COL.services] as const) {
  routesAdmin.post(`/${col}`, async (req, res) => {
    const b = referentiel.parse(req.body);
    await db().collection(col).doc(b.id).set({ nom: b.nom, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    res.status(201).json({ id: b.id, nom: b.nom });
  });

  // Suppression d'un campus ou d'un service, seulement s'il n'est plus utilisé
  routesAdmin.delete(`/${col}/:id`, async (req, res) => {
    const u = acteur(req);
    const id = req.params.id;
    const ref = db().collection(col).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw introuvable('Élément introuvable.');
    const champ = col === COL.campus ? 'campusId' : 'serviceId';
    const [rattaches, dossiers, perimetres] = await Promise.all([
      db().collection(COL.users).where(champ, '==', id).limit(1).get(),
      col === COL.campus ? db().collection(COL.demandes).where('campusId', '==', id).limit(1).get() : Promise.resolve({ empty: true }),
      col === COL.campus ? db().collection(COL.users).where('perimetreRh.campusIds', 'array-contains', id).limit(1).get() : Promise.resolve({ empty: true }),
    ]);
    if (!rattaches.empty || !dossiers.empty || !perimetres.empty) {
      throw conflit('REFERENTIEL_UTILISE', 'Suppression impossible : des comptes, des périmètres ou des dossiers y sont encore rattachés.');
    }
    const batch = db().batch();
    batch.delete(ref);
    journaliser(batch, u, {
      entite: 'parametres',
      entiteId: id,
      action: 'suppression_referentiel',
      resume: `${col === COL.campus ? 'Campus' : 'Service'} « ${doc.get('nom') ?? id} » supprimé.`,
    });
    await batch.commit();
    res.json({ ok: true });
  });
}
