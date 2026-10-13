import { Router } from 'express';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { acteur, exigerRole } from '../middleware/authentification';
import { COL, db } from '../infra/firebase';
import { interdit, introuvable, invalide } from '../infra/erreurs';
import { peutConsulterDotation, peutGererDotation, rhCouvre } from '../domain/authz';
import { anneeDe, aujourdhui, enDemi, enJours } from '../domain/calendrier';
import { calculerSolde, formaterJours, verifierSoldeNonNegatif } from '../domain/solde';
import { Utilisateur } from '../domain/types';
import { lireParametres } from '../services/parametres';
import {
  ajouterMouvement,
  creerDotationSiAbsente,
  joursEnAttenteTx,
  lireDotation,
  lireDotationTx,
  resumeDotation,
} from '../services/dotations';
import { journaliser, notifier } from '../services/journal';
import { lireUtilisateur, nomComplet, versUtilisateur } from '../services/utilisateurs';
import { appliquerPerimetre } from '../services/listes';
import { iso } from '../services/historique';
import { texte } from './schemas';

export const routesDotations = Router();

const annee = z.coerce.number().int().min(2020).max(2100);
const anneeCourante = () => anneeDe(aujourdhui());

async function details(uid: string, a: number) {
  const p = await lireParametres();
  const dot = await lireDotation(uid, a, p.dotationParDefaut);
  const enAttente = await joursEnAttenteTx(null, uid, a);
  const mouvements = await db()
    .collection(COL.mouvements)
    .where('userId', '==', uid)
    .where('annee', '==', a)
    .orderBy('date', 'desc')
    .limit(100)
    .get();
  return {
    ...resumeDotation(dot, enAttente),
    initialisee: dot.existe,
    mouvements: mouvements.docs.map((m) => ({ id: m.id, ...m.data(), date: iso(m.get('date')) })),
  };
}

/** Mes droits (année courante par défaut). */
routesDotations.get('/moi', async (req, res) => {
  const a = annee.optional().parse(req.query.annee) ?? anneeCourante();
  res.json(await details(acteur(req).uid, a));
});

/** Liste des collaborateurs du périmètre RH avec leur solde. */
routesDotations.get('/', exigerRole('rh'), async (req, res) => {
  const u = acteur(req);
  const q = z
    .object({ annee: annee.optional(), limite: z.coerce.number().int().min(1).max(100).default(25), curseur: z.string().optional() })
    .parse(req.query);
  const a = q.annee ?? anneeCourante();
  const p = await lireParametres();
  let requete = appliquerPerimetre(db().collection(COL.users), u, 'rh');
  if (!requete) {
    res.json({ elements: [], suivant: null });
    return;
  }
  requete = requete.orderBy('nom').orderBy('prenom');
  if (q.curseur) {
    const c = await db().collection(COL.users).doc(q.curseur).get();
    if (c.exists) requete = requete.startAfter(c);
  }
  const snap = await requete.limit(q.limite + 1).get();
  const users = snap.docs.slice(0, q.limite).map((d) => versUtilisateur(d)!);
  const refs = users.map((x) => db().collection(COL.dotations).doc(`${x.uid}_${a}`));
  const dots = refs.length ? await db().getAll(...refs) : [];
  res.json({
    elements: users.map((x, i) => {
      const d = dots[i];
      const c = {
        annee: a,
        joursAttribues: d.exists ? Number(d.get('joursAttribues')) : p.dotationParDefaut,
        ajustements: d.exists ? Number(d.get('ajustements') ?? 0) : 0,
        joursDebites: d.exists ? Number(d.get('joursDebites') ?? 0) : 0,
      };
      return { uid: x.uid, nomComplet: nomComplet(x), email: x.email, campusId: x.campusId, actif: x.actif, initialisee: d.exists, solde: calculerSolde(c), ...c };
    }),
    suivant: snap.docs.length > q.limite ? users[users.length - 1].uid : null,
  });
});

async function cibleAutorisee(acteurU: Utilisateur, uid: string, gestion: boolean): Promise<Utilisateur> {
  const cible = await lireUtilisateur(uid);
  if (!cible) throw introuvable('Collaborateur introuvable.');
  const ok = gestion ? peutGererDotation(acteurU, cible) : peutConsulterDotation(acteurU, cible);
  if (!ok) {
    throw interdit(
      gestion && acteurU.uid === uid
        ? 'Vous ne pouvez pas modifier vos propres droits : un autre gestionnaire RH doit intervenir.'
        : 'Ce collaborateur ne relève pas de votre périmètre.',
    );
  }
  return cible;
}

routesDotations.get('/:uid/:annee', async (req, res) => {
  await cibleAutorisee(acteur(req), req.params.uid, false);
  res.json(await details(req.params.uid, annee.parse(req.params.annee)));
});

/** Modification de la dotation annuelle (motif obligatoire, solde jamais négatif). */
routesDotations.put('/:uid/:annee', exigerRole('rh'), async (req, res) => {
  const u = acteur(req);
  const a = annee.parse(req.params.annee);
  const b = z
    .object({
      joursAttribues: z.number().min(0).max(366).refine((n) => Number.isInteger(n * 2), 'par demi-journée'),
      motif: texte(500).min(3, 'motif obligatoire'),
    })
    .parse(req.body);
  const cible = await cibleAutorisee(u, String(req.params.uid), true);
  const p = await lireParametres();
  await db().runTransaction(async (tx) => {
    const dot = await lireDotationTx(tx, cible.uid, a, p.dotationParDefaut);
    const avant = dot.joursAttribues;
    if (avant === b.joursAttribues && dot.existe) throw invalide('La dotation est déjà à cette valeur.');
    const soldeApres = verifierSoldeNonNegatif({ ...dot, joursAttribues: b.joursAttribues });
    creerDotationSiAbsente(tx, dot, cible);
    tx.update(dot.ref, { joursAttribues: b.joursAttribues, updatedAt: FieldValue.serverTimestamp() });
    ajouterMouvement(tx, {
      userId: cible.uid,
      annee: a,
      type: 'MODIFICATION_DOTATION',
      jours: enJours(enDemi(b.joursAttribues) - enDemi(avant)),
      motif: b.motif,
      auteur: u,
      soldeApres,
    });
    journaliser(tx, u, {
      entite: 'dotation',
      entiteId: `${cible.uid}_${a}`,
      userId: cible.uid,
      action: 'modification_dotation',
      resume: `Dotation ${a} : ${formaterJours(avant)} → ${formaterJours(b.joursAttribues)}.`,
      motif: b.motif,
    });
    notifier(tx, [cible.uid], {
      titre: 'Droits à congé modifiés',
      message: `Votre dotation ${a} est désormais de ${formaterJours(b.joursAttribues)}.`,
      lien: '/conges',
    });
  });
  res.json(await details(cible.uid, a));
});

/** Ajustement ponctuel du solde (+/-), motivé et tracé. */
routesDotations.post('/:uid/:annee/ajustements', exigerRole('rh'), async (req, res) => {
  const u = acteur(req);
  const a = annee.parse(req.params.annee);
  const b = z
    .object({
      jours: z.number().min(-366).max(366).refine((n) => n !== 0 && Number.isInteger(n * 2), 'valeur non nulle, par demi-journée'),
      motif: texte(500).min(3, 'motif obligatoire'),
    })
    .parse(req.body);
  const cible = await cibleAutorisee(u, String(req.params.uid), true);
  const p = await lireParametres();
  await db().runTransaction(async (tx) => {
    const dot = await lireDotationTx(tx, cible.uid, a, p.dotationParDefaut);
    const ajustements = enJours(enDemi(dot.ajustements) + enDemi(b.jours));
    const soldeApres = verifierSoldeNonNegatif({ ...dot, ajustements });
    creerDotationSiAbsente(tx, dot, cible);
    tx.update(dot.ref, { ajustements, updatedAt: FieldValue.serverTimestamp() });
    ajouterMouvement(tx, { userId: cible.uid, annee: a, type: 'AJUSTEMENT', jours: b.jours, motif: b.motif, auteur: u, soldeApres });
    journaliser(tx, u, {
      entite: 'dotation',
      entiteId: `${cible.uid}_${a}`,
      userId: cible.uid,
      action: 'ajustement',
      resume: `Ajustement ${a} : ${b.jours > 0 ? '+' : ''}${formaterJours(b.jours)}.`,
      motif: b.motif,
    });
    notifier(tx, [cible.uid], {
      titre: 'Solde ajusté',
      message: `Un ajustement de ${b.jours > 0 ? '+' : ''}${formaterJours(b.jours)} a été appliqué à votre solde ${a}.`,
      lien: '/conges',
    });
  });
  res.json(await details(cible.uid, a));
});

/** Attribution annuelle en lot : crée les dotations manquantes du périmètre. */
routesDotations.post('/attribution', exigerRole('rh'), async (req, res) => {
  const u = acteur(req);
  const a = annee.parse(req.body?.annee);
  const p = await lireParametres();
  const requete = appliquerPerimetre(db().collection(COL.users), u, 'rh');
  const users = requete ? (await requete.get()).docs.map((d) => versUtilisateur(d)!).filter((x) => x.actif) : [];
  let creees = 0;
  for (const cible of users) {
    if (!rhCouvre(u, cible)) continue;
    const creee = await db().runTransaction(async (tx) => {
      const dot = await lireDotationTx(tx, cible.uid, a, p.dotationParDefaut);
      if (dot.existe) return false;
      creerDotationSiAbsente(tx, dot, cible);
      return true;
    });
    if (creee) creees++;
  }
  const batch = db().batch();
  journaliser(batch, u, {
    entite: 'dotation',
    entiteId: `attribution_${a}`,
    action: 'attribution_annuelle',
    resume: `Attribution annuelle ${a} : ${creees} dotation(s) créée(s) à ${formaterJours(p.dotationParDefaut)}.`,
  });
  await batch.commit();
  res.json({ annee: a, creees, total: users.length });
});
