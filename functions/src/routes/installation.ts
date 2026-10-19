/**
 * Installation : création du PREMIER super-utilisateur (administrateur), une
 * seule fois, depuis le site. Ces routes sont publiques (aucun compte n'existe
 * encore) mais protégées :
 *  - elles exigent la clé d'installation CLE_INSTALLATION (secret de la fonction,
 *    connu de la seule personne qui déploie) ; sans clé configurée, l'installation
 *    en ligne est désactivée (hors émulateur local) ;
 *  - elles se ferment définitivement dès qu'un administrateur existe
 *    (document config/installation créé dans une transaction) ;
 *  - elles sont limitées en débit par adresse IP (voir app.ts).
 * L'administrateur crée ensuite lui-même les autres comptes, qui reçoivent leurs
 * identifiants provisoires par e-mail.
 */
import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { auth, COL, db } from '../infra/firebase';
import { conflit, ErreurHttp, interdit } from '../infra/erreurs';
import { lireParametres } from '../services/parametres';
import { creerDotationSiAbsente, lireDotationTx } from '../services/dotations';
import { journaliser } from '../services/journal';
import { anneeDe, aujourdhui } from '../domain/calendrier';
import { Utilisateur } from '../domain/types';
import { motDePasseRobuste, texte } from './schemas';

export const routesInstallation = Router();

const CLE_LOCALE = 'installation-locale';

function cleAttendue(): string | null {
  if (process.env.CLE_INSTALLATION) return process.env.CLE_INSTALLATION;
  // Émulateurs (développement local) : clé connue, documentée dans le README
  return process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'test' ? CLE_LOCALE : null;
}

function cleValide(fournie: string): boolean {
  const attendue = cleAttendue();
  if (!attendue) return false;
  const a = Buffer.from(fournie);
  const b = Buffer.from(attendue);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** L'installation est nécessaire tant qu'aucun administrateur n'existe. */
async function installationNecessaire(): Promise<boolean> {
  const [config, admins] = await Promise.all([
    db().collection(COL.config).doc('installation').get(),
    db().collection(COL.users).where('roles', 'array-contains', 'admin').limit(1).get(),
  ]);
  return !config.exists && admins.empty;
}

routesInstallation.get('/installation', async (_req, res) => {
  res.json({ necessaire: await installationNecessaire(), disponible: !!cleAttendue() });
});

const identifiant = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, 'identifiant en minuscules (a-z, 0-9, -)');

routesInstallation.post('/installation', async (req, res) => {
  const b = z
    .object({
      cle: z.string().min(1).max(200),
      email: z.string().trim().toLowerCase().email().max(200),
      prenom: texte(80).min(1),
      nom: texte(80).min(1),
      fonction: texte(100).default('Administrateur'),
      motDePasse: motDePasseRobuste,
      campus: z.object({ id: identifiant, nom: texte(100).min(2) }),
      service: z.object({ id: identifiant, nom: texte(100).min(2) }),
    })
    .parse(req.body);

  if (!cleAttendue()) {
    throw interdit("L'installation en ligne est désactivée : définissez CLE_INSTALLATION dans la configuration de la fonction.");
  }
  if (!cleValide(b.cle)) throw new ErreurHttp(403, 'CLE_INVALIDE', "Clé d'installation incorrecte.");
  if (!(await installationNecessaire())) throw conflit('DEJA_INSTALLEE', "L'application est déjà installée : connectez-vous avec un compte administrateur.");

  let uid: string;
  try {
    uid = (await auth().createUser({ email: b.email, password: b.motDePasse, displayName: `${b.prenom} ${b.nom}`, emailVerified: false })).uid;
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/email-already-exists') throw conflit('EMAIL_EXISTANT', 'Un compte existe déjà avec cette adresse.');
    throw e;
  }

  const p = await lireParametres();
  const profil: Omit<Utilisateur, 'uid'> = {
    email: b.email,
    prenom: b.prenom,
    nom: b.nom,
    fonction: b.fonction,
    roles: ['collaborateur', 'admin'],
    campusId: b.campus.id,
    serviceId: b.service.id,
    managerId: null,
    actif: true,
    perimetreRh: { tous: false, campusIds: [] },
  };
  try {
    await db().runTransaction(async (tx) => {
      const refConfig = db().collection(COL.config).doc('installation');
      const config = await tx.get(refConfig);
      const dot = await lireDotationTx(tx, uid, anneeDe(aujourdhui()), p.dotationParDefaut);
      // Deux installations simultanées : seule la première aboutit
      if (config.exists) throw conflit('DEJA_INSTALLEE', "L'application est déjà installée.");
      tx.set(refConfig, { installeeLe: FieldValue.serverTimestamp(), premierAdministrateur: uid });
      tx.set(db().collection(COL.campus).doc(b.campus.id), { nom: b.campus.nom, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(db().collection(COL.services).doc(b.service.id), { nom: b.service.nom, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(db().collection(COL.users).doc(uid), { ...profil, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      creerDotationSiAbsente(tx, dot, { uid, ...profil });
      journaliser(tx, 'systeme', {
        entite: 'utilisateur',
        entiteId: uid,
        action: 'installation',
        resume: `Installation de l'application : premier administrateur ${b.prenom} ${b.nom}.`,
      });
    });
  } catch (e) {
    await auth().deleteUser(uid).catch(() => undefined);
    throw e;
  }
  res.status(201).json({ ok: true });
});
