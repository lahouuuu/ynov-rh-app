/**
 * Jeu de données FICTIVES pour la démonstration et le développement local.
 *
 * Usage (émulateurs lancés) :   npm run seed
 * Usage (projet de démo réel) : GOOGLE_APPLICATION_CREDENTIALS=cle.json \
 *                               GCLOUD_PROJECT=<projet> node lib/outils/seed.js --confirmer
 *
 * Le script est idempotent : il peut être relancé sans créer de doublons.
 * Aucune donnée réelle ne doit être utilisée sans validation de l'établissement.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { auth, COL, db } from '../infra/firebase';
import { PARAMETRES_PAR_DEFAUT } from '../domain/parametres';
import { anneeDe, aujourdhui, joursOuvresDeLaPeriode } from '../domain/calendrier';
import { repartir } from '../domain/solde';
import { Role } from '../domain/types';
import { randomBytes } from 'node:crypto';

export const MOT_DE_PASSE_DEMO = 'Demo-Ynov-2026!';

interface CompteDemo {
  uid: string;
  email: string;
  prenom: string;
  nom: string;
  roles: Role[];
  campusId: string;
  serviceId: string;
  fonction: string;
  managerId: string | null;
  perimetreRh?: { tous: boolean; campusIds: string[] };
}

export const COMPTES_DEMO: CompteDemo[] = [
  { uid: 'demo-admin', fonction: "Administrateur SI", email: 'admin@demo.ynov.ma', prenom: 'Amine', nom: 'Tazi', roles: ['collaborateur', 'admin'], campusId: 'casablanca', serviceId: 'direction', managerId: null },
  { uid: 'demo-rh', fonction: "Gestionnaire RH", email: 'rh@demo.ynov.ma', prenom: 'Nadia', nom: 'Benali', roles: ['collaborateur', 'rh'], campusId: 'casablanca', serviceId: 'rh', managerId: null, perimetreRh: { tous: true, campusIds: [] } },
  { uid: 'demo-resp', fonction: "Responsable pédagogique", email: 'responsable@demo.ynov.ma', prenom: 'Karim', nom: 'El Idrissi', roles: ['collaborateur', 'responsable'], campusId: 'casablanca', serviceId: 'pedagogie', managerId: null },
  { uid: 'demo-salma', fonction: "Chargée pédagogique", email: 'salma@demo.ynov.ma', prenom: 'Salma', nom: 'Alaoui', roles: ['collaborateur'], campusId: 'casablanca', serviceId: 'pedagogie', managerId: 'demo-resp' },
  { uid: 'demo-youssef', fonction: "Chargé de cours", email: 'youssef@demo.ynov.ma', prenom: 'Youssef', nom: 'Berrada', roles: ['collaborateur'], campusId: 'casablanca', serviceId: 'pedagogie', managerId: 'demo-resp' },
  { uid: 'demo-imane', fonction: "Assistante pédagogique", email: 'imane@demo.ynov.ma', prenom: 'Imane', nom: 'Fassi', roles: ['collaborateur'], campusId: 'casablanca', serviceId: 'pedagogie', managerId: 'demo-resp' },
  { uid: 'demo-direction', fonction: 'Directeur régional', email: 'direction@demo.ynov.ma', prenom: 'Rachid', nom: 'Bennani', roles: ['collaborateur', 'direction'], campusId: 'casablanca', serviceId: 'direction', managerId: null, perimetreRh: { tous: true, campusIds: [] } },
  { uid: 'demo-yassine', fonction: "Chargé d'admissions", email: 'yassine@demo.ynov.ma', prenom: 'Yassine', nom: 'Amrani', roles: ['collaborateur'], campusId: 'casablanca', serviceId: 'admissions', managerId: null },
];

/** Congés déjà approuvés plus tôt dans l'année (pour obtenir des soldes de démonstration). */
const CONGES_PASSES: Array<{ uid: string; debut: string; fin: string }> = [
  // Youssef : 16 jours décomptés → solde 2 (scénario « solde insuffisant »)
  { uid: 'demo-youssef', debut: '02-09', fin: '02-20' },
  { uid: 'demo-youssef', debut: '07-06', fin: '07-13' },
  // Imane : 18 jours décomptés → solde 0 (scénario « solde nul »)
  { uid: 'demo-imane', debut: '04-06', fin: '04-24' },
  { uid: 'demo-imane', debut: '08-03', fin: '08-07' },
  // Salma : 3 jours
  { uid: 'demo-salma', debut: '05-11', fin: '05-13' },
];

/**
 * Les premières versions de la démonstration comptaient des campus à Rabat et
 * Marrakech, qui n'existent pas : on les retire des données déjà créées
 * (référentiel, compte « RH Rabat », rattachements).
 */
async function nettoyerAnciennesDonnees(journal: (m: string) => void) {
  for (const id of ['rabat', 'marrakech']) {
    const ref = db().collection(COL.campus).doc(id);
    if ((await ref.get()).exists) {
      await ref.delete();
      journal(`• campus « ${id} » retiré`);
    }
  }
  const ancien = 'demo-rh-rabat';
  if ((await db().collection(COL.users).doc(ancien).get()).exists) {
    await db().collection(COL.users).doc(ancien).delete();
    for (const col of [COL.dotations, COL.mouvements, COL.notifications]) {
      const snap = await db().collection(col).where('userId', '==', ancien).get();
      for (const d of snap.docs) await d.ref.delete();
    }
    journal('• compte de démonstration rh.rabat retiré');
  }
  await auth().deleteUser(ancien).catch(() => undefined);
  // Dossiers encore rattachés à un ancien campus → Casablanca
  for (const col of [COL.demandes, COL.signalements, COL.justificatifs, COL.dotations]) {
    for (const id of ['rabat', 'marrakech']) {
      const snap = await db().collection(col).where('campusId', '==', id).get();
      for (const d of snap.docs) await d.ref.update({ campusId: 'casablanca' });
    }
  }
}

export async function seed(journal: (m: string) => void = console.log) {
  const annee = anneeDe(aujourdhui());
  const p = { ...PARAMETRES_PAR_DEFAUT };
  await db().collection(COL.parametres).doc('general').set(p, { merge: true });
  // Les comptes de démonstration incluent un administrateur : l'installation en ligne est close
  await db().collection(COL.config).doc('installation').set({ installeeLe: FieldValue.serverTimestamp(), mode: 'demonstration' }, { merge: true });

  await db().collection(COL.campus).doc('casablanca').set({ nom: 'Casablanca' });
  await nettoyerAnciennesDonnees(journal);
  for (const [id, nom] of [['pedagogie', 'Pédagogie'], ['admissions', 'Admissions'], ['rh', 'Ressources humaines'], ['direction', 'Direction'], ['it', 'Informatique']]) {
    await db().collection(COL.services).doc(id).set({ nom });
  }

  for (const c of COMPTES_DEMO) {
    try {
      await auth().getUser(c.uid);
    } catch {
      await auth().createUser({ uid: c.uid, email: c.email, password: MOT_DE_PASSE_DEMO, displayName: `${c.prenom} ${c.nom}`, emailVerified: true });
    }
    const { uid, ...profil } = c;
    await db().collection(COL.users).doc(uid).set({
      ...profil,
      perimetreRh: c.perimetreRh ?? { tous: false, campusIds: [] },
      actif: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  for (const c of COMPTES_DEMO) {
    const conges = CONGES_PASSES.filter((x) => x.uid === c.uid);
    const refDot = db().collection(COL.dotations).doc(`${c.uid}_${annee}`);
    if ((await refDot.get()).exists) continue; // déjà initialisé
    let debites = 0;
    const batch = db().batch();
    batch.set(db().collection(COL.mouvements).doc(), {
      userId: c.uid, annee, type: 'DOTATION_INITIALE', jours: p.dotationParDefaut, motif: `Attribution annuelle ${annee}`,
      demandeId: null, soldeApres: p.dotationParDefaut, auteurId: 'systeme', auteurNom: 'Système', date: FieldValue.serverTimestamp(),
    });
    for (const conge of conges) {
      const debut = `${annee}-${conge.debut}`;
      const fin = `${annee}-${conge.fin}`;
      const rep = repartir(joursOuvresDeLaPeriode(debut, fin, p), p.dotationParDefaut - debites, 'conge_paye');
      debites += rep.joursPayes;
      const ref = db().collection(COL.demandes).doc();
      batch.set(ref, {
        userId: c.uid, userNom: `${c.prenom} ${c.nom}`, managerId: c.managerId, campusId: c.campusId, serviceId: c.serviceId,
        type: 'conge_paye', annee, dateDebut: debut, dateFin: fin, demiJourneeDebut: false, demiJourneeFin: false,
        commentaire: '', interim: '', statut: 'approuvee', ...rep, accordNonPaye: false, reconfirmationRequise: false,
        ficheNumero: null, ficheSel: randomBytes(16).toString('hex'),
        // Visas électroniques de démonstration ; le congé de Salma attend l'accord de la direction
        ficheStatut: c.uid === 'demo-salma' ? 'attente_direction' : 'signee',
        signatures: {
          employe: { uid: c.uid, nom: `${c.prenom} ${c.nom}`, fonction: c.fonction, date: FieldValue.serverTimestamp() },
          raf: { uid: 'demo-rh', nom: 'Nadia Benali', fonction: 'Gestionnaire RH', date: FieldValue.serverTimestamp() },
          direction: c.uid === 'demo-salma' ? null : { uid: 'demo-direction', nom: 'Rachid Bennani', fonction: 'Directeur régional', date: FieldValue.serverTimestamp(), accordDu: debut, accordAu: fin },
        },
        debitEffectue: true, restitutionEffectuee: false, groupeId: null, annulationDemandee: false, annulation: null,
        avis: { favorable: true, commentaire: '', auteurId: 'demo-resp', auteurNom: 'Karim El Idrissi', date: FieldValue.serverTimestamp() },
        decision: { statut: 'approuvee', motif: '', auteurId: 'demo-rh', auteurNom: 'Nadia Benali', date: FieldValue.serverTimestamp() },
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), soumiseLe: FieldValue.serverTimestamp(),
      });
      batch.set(db().collection(COL.mouvements).doc(), {
        userId: c.uid, annee, type: 'DEBIT', jours: -rep.joursPayes, motif: `Congé approuvé du ${debut} au ${fin}`, demandeId: ref.id,
        soldeApres: p.dotationParDefaut - debites, auteurId: 'demo-rh', auteurNom: 'Nadia Benali', date: FieldValue.serverTimestamp(),
      });
      batch.set(db().collection(COL.historique).doc(), {
        entite: 'demande', entiteId: ref.id, userId: c.uid, action: 'approbation', resume: `Données de démonstration : congé approuvé (${rep.joursPayes} j débités).`,
        motif: null, details: {}, auteurId: 'demo-rh', auteurNom: 'Nadia Benali', date: FieldValue.serverTimestamp(),
      });
    }
    batch.set(refDot, {
      userId: c.uid, userNom: `${c.prenom} ${c.nom}`, campusId: c.campusId, managerId: c.managerId, annee,
      joursAttribues: p.dotationParDefaut, ajustements: 0, joursDebites: debites,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    journal(`• ${c.email} — solde ${annee} : ${p.dotationParDefaut - debites} j`);
  }
  journal(`Données fictives prêtes. Mot de passe de tous les comptes : ${MOT_DE_PASSE_DEMO}`);
}

if (require.main === module && /seed\.[jt]s$/.test(process.argv[1] ?? '')) {
  const emulateur = !!process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulateur && !process.argv.includes('--confirmer')) {
    console.error('Projet réel détecté : relancez avec --confirmer pour insérer les données FICTIVES de démonstration.');
    process.exit(1);
  }
  seed().then(
    () => process.exit(0),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
