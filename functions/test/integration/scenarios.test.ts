/**
 * Scénarios minimum du cahier des charges (§6), exécutés de bout en bout sur
 * l'API réelle branchée aux émulateurs Firebase.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Timestamp } from 'firebase-admin/firestore';
import { PARAMETRES_PAR_DEFAUT } from '../../src/domain/parametres';
import { ANNEE, api, app, cle, Compte, connecterAvec, creerCompte, db, lundi, plusJours, referentiels, reinitialiser, solde } from './outils';

let direction: Compte, admin: Compte, rhCasa: Compte, rhGlobal: Compte, karim: Compte, salma: Compte, yassine: Compte, imane: Compte;

beforeAll(async () => {
  await reinitialiser();
  await referentiels();
  // Calendrier déterministe : pas de jours fériés pendant les tests
  await db().collection('parametres').doc('general').set({ ...PARAMETRES_PAR_DEFAUT, joursFeries: [] });
  admin = await creerCompte('admin', ['admin']);
  direction = await creerCompte('rachid', ['direction'], { perimetreRh: { tous: true, campusIds: [] } });
  rhCasa = await creerCompte('nadia', ['rh'], { perimetreRh: { tous: false, campusIds: ['casablanca'] } });
  rhGlobal = await creerCompte('omar', ['rh'], { perimetreRh: { tous: true, campusIds: [] } });
  karim = await creerCompte('karim', ['responsable']);
  salma = await creerCompte('salma', [], { managerId: 'karim' });
  yassine = await creerCompte('yassine', [], { campusId: 'rabat', managerId: null });
  imane = await creerCompte('imane', [], { managerId: 'karim' });
});

/** Crée et soumet une demande de congé payé sur n jours ouvrés à partir d'un lundi. */
async function demander(c: Compte, debut: string, nbJours: number, accordNonPaye = false) {
  return api(c).post('/demandes', {
    type: 'conge_paye',
    dateDebut: debut,
    dateFin: plusJours(debut, nbJours - 1),
    soumettre: true,
    attestation: true,
    accordNonPaye,
    cleIdempotence: cle(),
  });
}

/** Avis favorable du responsable puis décision RH. */
async function circuitComplet(id: string, decideur: Compte = rhCasa) {
  const avis = await api(karim).post(`/demandes/${id}/avis`, { favorable: true });
  expect(avis.status, JSON.stringify(avis.body)).toBe(200);
  return api(decideur).post(`/demandes/${id}/decision`, { decision: 'approuver' });
}

describe('Droits annuels', () => {
  it('un compte reçoit 18 jours pour l’année', async () => {
    const r = await api(salma).get(`/dotations/moi?annee=${ANNEE}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ annee: ANNEE, joursAttribues: 18, solde: 18, enAttente: 0 });
  });

  it('les RH modifient la dotation avec motif ; la modification est historisée', async () => {
    const sansMotif = await api(rhCasa).put(`/dotations/imane/${ANNEE}`, { joursAttribues: 20 });
    expect(sansMotif.status).toBe(400);

    const r = await api(rhCasa).put(`/dotations/imane/${ANNEE}`, { joursAttribues: 20, motif: 'Ancienneté' });
    expect(r.status).toBe(200);
    expect(r.body.joursAttribues).toBe(20);
    const mouvement = r.body.mouvements.find((m: { type: string }) => m.type === 'MODIFICATION_DOTATION');
    expect(mouvement).toMatchObject({ jours: 2, motif: 'Ancienneté', auteurId: 'nadia' });
    // L'historique initial est conservé (pas d'écrasement)
    expect(r.body.mouvements.some((m: { type: string }) => m.type === 'DOTATION_INITIALE')).toBe(true);
  });

  it('les droits sont conservés par année', async () => {
    await api(rhCasa).put(`/dotations/imane/${ANNEE + 1}`, { joursAttribues: 22, motif: 'Dotation N+1' });
    expect((await api(imane).get(`/dotations/moi?annee=${ANNEE}`)).body.joursAttribues).toBe(20);
    expect((await api(imane).get(`/dotations/moi?annee=${ANNEE + 1}`)).body.joursAttribues).toBe(22);
  });

  it('un RH ne peut ni modifier ses propres droits ni ceux hors de son périmètre ; un collaborateur non plus', async () => {
    expect((await api(rhCasa).put(`/dotations/nadia/${ANNEE}`, { joursAttribues: 30, motif: 'test' })).status).toBe(403);
    expect((await api(rhCasa).put(`/dotations/yassine/${ANNEE}`, { joursAttribues: 30, motif: 'test' })).status).toBe(403);
    expect((await api(salma).put(`/dotations/salma/${ANNEE}`, { joursAttribues: 30, motif: 'test' })).status).toBe(403);
  });
});

describe('Congé payé', () => {
  it('suit le circuit prévu et n’est débité qu’après approbation RH', async () => {
    const creation = await demander(salma, lundi(5), 3);
    expect(creation.status, JSON.stringify(creation.body)).toBe(201);
    const id = creation.body.ids[0];

    let detail = await api(salma).get(`/demandes/${id}`);
    expect(detail.body.demande).toMatchObject({ statut: 'soumise', joursPayes: 3, joursNonPayes: 0 });
    expect(await solde(salma)).toBe(18);

    // Fiche consultable dès la soumission, mais non définitive
    const ficheSoumise = (await api(salma).get(`/demandes/${id}/fiche/donnees`)).body;
    expect(ficheSoumise).toMatchObject({ definitive: false, visas: { raf: null, direction: null } });
    // Les RH ne peuvent pas décider avant l'avis hiérarchique
    expect((await api(rhCasa).post(`/demandes/${id}/decision`, { decision: 'approuver' })).status).toBe(409);

    await api(karim).post(`/demandes/${id}/avis`, { favorable: true });
    detail = await api(salma).get(`/demandes/${id}`);
    expect(detail.body.demande.statut).toBe('en_decision_rh');
    expect(await solde(salma)).toBe(18); // l'avis ne vaut pas autorisation

    const decision = await api(rhCasa).post(`/demandes/${id}/decision`, { decision: 'approuver' });
    expect(decision.status).toBe(200);
    expect(await solde(salma)).toBe(15);

    // Historique horodaté des étapes
    detail = await api(salma).get(`/demandes/${id}`);
    const actions = detail.body.historique.map((h: { action: string }) => h.action);
    expect(actions.slice(0, 3)).toEqual(['creation_soumission', 'avis', 'approbation']);
    expect(detail.body.historique.every((h: { date: string }) => !!h.date)).toBe(true);

    // Fiche papier pré-remplie, disponible une fois approuvée, pour le demandeur et les RH
    const fiche = await api(salma).get(`/demandes/${id}/fiche`);
    expect(fiche.status).toBe(200);
    expect(fiche.headers['content-type']).toContain('application/pdf');
    expect(fiche.headers['content-disposition']).toMatch(/fiche-conge-\d{4}-\d{4}/);
    expect((await api(rhCasa).get(`/demandes/${id}/fiche`)).status).toBe(200);
    expect((await api(yassine).get(`/demandes/${id}/fiche`)).status).toBe(403);
    // Le numéro est attribué une seule fois
    expect((await api(salma).get(`/demandes/${id}`)).body.demande.ficheNumero).toMatch(/^\d{4}-\d{4}$/);

    // Notification avec état lu / non lu et lien vers le dossier
    const notifs = await api(salma).get('/notifications');
    expect(notifs.body.elements[0]).toMatchObject({ lu: false, lien: `/conges/detail?id=${id}` });
  });

  it('un refus doit être motivé et est notifié', async () => {
    const id = (await demander(imane, lundi(6), 1)).body.ids[0];
    await api(karim).post(`/demandes/${id}/avis`, { favorable: false, commentaire: 'Période chargée' });
    expect((await api(rhCasa).post(`/demandes/${id}/decision`, { decision: 'refuser' })).status).toBe(400);
    expect((await api(rhCasa).post(`/demandes/${id}/decision`, { decision: 'refuser', motif: 'Examens' })).status).toBe(200);
    const notifs = await api(imane).get('/notifications?nonLues=true');
    expect(notifs.body.elements.some((n: { titre: string }) => n.titre.includes('refusée'))).toBe(true);
  });

  it('les chevauchements sont empêchés', async () => {
    const r = await demander(salma, plusJours(lundi(5), 2), 2);
    expect(r.status).toBe(409);
    expect(r.body.erreur.code).toBe('CHEVAUCHEMENT');
  });

  it('une demande traversant deux années est scindée en deux demandes', async () => {
    const r = await api(imane).post('/demandes', {
      type: 'conge_paye',
      dateDebut: `${ANNEE}-12-29`,
      dateFin: `${ANNEE + 1}-01-04`,
      soumettre: false,
      cleIdempotence: cle(),
    });
    expect(r.status).toBe(201);
    expect(r.body.ids).toHaveLength(2);
    const [a, b] = await Promise.all(r.body.ids.map((id: string) => api(imane).get(`/demandes/${id}`)));
    expect(a.body.demande).toMatchObject({ annee: ANNEE, dateFin: `${ANNEE}-12-31` });
    expect(b.body.demande).toMatchObject({ annee: ANNEE + 1, dateDebut: `${ANNEE + 1}-01-01` });
  });
});

describe('Solde insuffisant et solde nul', () => {
  let collab: Compte;

  beforeAll(async () => {
    collab = await creerCompte('hamza', [], { managerId: 'karim' });
    // 18 jours dont 16 décomptés : on simule les 16 jours par un ajustement RH
    await api(rhCasa).post(`/dotations/hamza/${ANNEE}/ajustements`, { jours: -16, motif: 'Reprise de l’ancien suivi' });
    expect(await solde(collab)).toBe(2);
  });

  it('avec 2 jours restants, une demande de 4 jours propose 2 payés et 2 non payés', async () => {
    const sim = await api(collab).post('/demandes/simulation', {
      type: 'conge_paye',
      dateDebut: lundi(10),
      dateFin: plusJours(lundi(10), 3),
    });
    expect(sim.body).toMatchObject({ insuffisant: true, dureeTotale: 4, joursPayes: 2, joursNonPayes: 2 });
    expect(sim.body.periodes[0]).toMatchObject({ soldeAvant: 2, soldeApres: 0 });
    expect(sim.body.periodes[0].repartition.plagesPayees[0]).toMatchObject({ debut: lundi(10), fin: plusJours(lundi(10), 1) });

    // Pas de conversion automatique : l'accord explicite est exigé
    const sansAccord = await demander(collab, lundi(10), 4);
    expect(sansAccord.status).toBe(409);
    expect(sansAccord.body.erreur.code).toBe('ACCORD_REQUIS');

    const avecAccord = await demander(collab, lundi(10), 4, true);
    expect(avecAccord.status).toBe(201);
    const id = avecAccord.body.ids[0];
    expect((await api(collab).get(`/demandes/${id}`)).body.demande).toMatchObject({ joursPayes: 2, joursNonPayes: 2, statut: 'soumise' });

    // Même circuit ; seuls les jours payés sont débités
    expect((await circuitComplet(id)).status).toBe(200);
    expect(await solde(collab)).toBe(0);
  });

  it('avec un solde nul, la demande est soumise intégralement en non payé, sans débit', async () => {
    const r = await demander(collab, lundi(12), 3, true);
    expect(r.status).toBe(201);
    const id = r.body.ids[0];
    expect((await api(collab).get(`/demandes/${id}`)).body.demande).toMatchObject({ joursPayes: 0, joursNonPayes: 3 });
    expect((await circuitComplet(id)).status).toBe(200);
    expect(await solde(collab)).toBe(0);
  });
});

describe('Cohérence et annulation', () => {
  let collab: Compte;
  let id: string;

  beforeAll(async () => {
    collab = await creerCompte('sara', [], { managerId: 'karim' });
  });

  it('une soumission répétée (même clé) ne crée pas de doublon', async () => {
    const corps = { type: 'conge_paye', dateDebut: lundi(20), dateFin: plusJours(lundi(20), 4), soumettre: true, attestation: true, cleIdempotence: cle() };
    const [a, b] = [await api(collab).post('/demandes', corps), await api(collab).post('/demandes', corps)];
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ doublon: true, ids: a.body.ids });
    id = a.body.ids[0];
  });

  it('une approbation répétée ne débite pas deux fois', async () => {
    expect((await circuitComplet(id)).status).toBe(200);
    const encore = await api(rhCasa).post(`/demandes/${id}/decision`, { decision: 'approuver' });
    expect(encore.status).toBe(409);
    // Approbations concurrentes : une seule passe
    expect(await solde(collab)).toBe(13);
  });

  it('une annulation restitue seulement les jours payés, une seule fois', async () => {
    // Après approbation, le collaborateur ne peut que DEMANDER l'annulation
    const demandeAnnulation = await api(collab).post(`/demandes/${id}/annuler`, { motif: 'Changement de projet' });
    expect(demandeAnnulation.status).toBe(200);
    expect((await api(collab).get(`/demandes/${id}`)).body.demande.statut).toBe('approuvee');

    const r = await api(rhCasa).post(`/demandes/${id}/annulation/decision`, { accepter: true, motif: 'Accordé' });
    expect(r.status).toBe(200);
    expect(await solde(collab)).toBe(18);
    const encore = await api(rhCasa).post(`/demandes/${id}/annulation/decision`, { accepter: true, motif: 'Accordé' });
    expect(encore.status).toBe(409);
    expect(await solde(collab)).toBe(18);
  });

  it('jours non payés annulés : aucun crédit', async () => {
    await api(rhCasa).post(`/dotations/sara/${ANNEE}/ajustements`, { jours: -17, motif: 'Test non payé' });
    const r = await demander(collab, lundi(25), 3, true); // 1 payé + 2 non payés
    const idNp = r.body.ids[0];
    await circuitComplet(idNp);
    expect(await solde(collab)).toBe(0);
    await api(rhCasa).post(`/demandes/${idNp}/annulation/decision`, { accepter: true, motif: 'Régularisation' });
    expect(await solde(collab)).toBe(1);
  });

  it('si le solde a changé, la décision est bloquée jusqu’à une nouvelle confirmation', async () => {
    const r = await demander(collab, lundi(30), 1); // 1 jour payé, solde 1
    const idR = r.body.ids[0];
    await api(karim).post(`/demandes/${idR}/avis`, { favorable: true });
    await api(rhGlobal).post(`/dotations/sara/${ANNEE}/ajustements`, { jours: -0.5, motif: 'Correction' });

    const bloquee = await api(rhCasa).post(`/demandes/${idR}/decision`, { decision: 'approuver' });
    expect(bloquee.status).toBe(409);
    expect(bloquee.body.erreur.code).toBe('SOLDE_MODIFIE');
    expect(await solde(collab)).toBe(0.5);
    let detail = await api(collab).get(`/demandes/${idR}`);
    expect(detail.body.demande.reconfirmationRequise).toBe(true);
    expect(detail.body.actions).toContain('reconfirmer');

    expect((await api(collab).post(`/demandes/${idR}/reconfirmer`, {})).status).toBe(409);
    expect((await api(collab).post(`/demandes/${idR}/reconfirmer`, { accordNonPaye: true })).status).toBe(200);
    detail = await api(collab).get(`/demandes/${idR}`);
    expect(detail.body.demande).toMatchObject({ joursPayes: 0.5, joursNonPayes: 0.5, reconfirmationRequise: false });

    expect((await api(rhCasa).post(`/demandes/${idR}/decision`, { decision: 'approuver' })).status).toBe(200);
    expect(await solde(collab)).toBe(0);
  });

  it('une réduction qui rendrait le solde négatif est bloquée', async () => {
    const r = await api(rhCasa).post(`/dotations/sara/${ANNEE}/ajustements`, { jours: -1, motif: 'Test' });
    expect(r.status).toBe(400);
    expect(r.body.erreur.message).toMatch(/négatif/);
  });
});

describe('Signalement et pièce', () => {
  const PDF = Buffer.from('%PDF-1.4\n% certificat fictif\n').toString('base64');
  let idAbsence: string;

  it('une absence est enregistrée sans justificatif, sans modifier le solde', async () => {
    const avant = await solde(imane);
    const r = await api(imane).post('/signalements', {
      type: 'absence',
      categorie: 'maladie',
      dateDebut: lundi(8),
      dureeEstimee: '2 jours',
      cleIdempotence: cle(),
    });
    expect(r.status).toBe(201);
    idAbsence = r.body.id;
    const s = (await api(imane).get(`/signalements/${idAbsence}`)).body.signalement;
    expect(s).toMatchObject({
      statutTraitement: 'declare',
      qualification: 'a_examiner', // jamais « non justifié » automatiquement
      justificatifStatut: 'a_fournir',
      dateFin: null,
    });
    expect(s.echeanceJustificatif).toBeTruthy();
    expect(await solde(imane)).toBe(avant);

    // Notifié au responsable et aux RH, sans contenu médical
    const n = await api(karim).get('/notifications');
    const notif = n.body.elements.find((x: { lien: string }) => x.lien.includes(idAbsence));
    expect(notif).toBeTruthy();
    expect(JSON.stringify(notif)).not.toMatch(/maladie/i);
  });

  it('la date de fin peut être complétée plus tard', async () => {
    const r = await api(imane).patch(`/signalements/${idAbsence}`, { dateFin: plusJours(lundi(8), 1) });
    expect(r.status).toBe(200);
  });

  it('le responsable prend connaissance mais ne voit pas le motif médical', async () => {
    const vue = await api(karim).get(`/signalements/${idAbsence}`);
    expect(vue.status).toBe(200);
    expect(vue.body.signalement.categorie).toBe('confidentiel');
    expect((await api(karim).post(`/signalements/${idAbsence}/prise-connaissance`)).status).toBe(200);
    const s = (await api(imane).get(`/signalements/${idAbsence}`)).body.signalement;
    expect(s.priseConnaissance.parId).toBe('karim');
    expect(s.qualification).toBe('a_examiner'); // ne remplace pas la décision RH
  });

  it('dépôt ultérieur du justificatif puis traitement RH', async () => {
    const depot = await api(imane).post('/justificatifs', {
      dossierType: 'signalement',
      dossierId: idAbsence,
      nomFichier: 'certificat.pdf',
      contentType: 'application/pdf',
      contenuBase64: PDF,
    });
    expect(depot.status, JSON.stringify(depot.body)).toBe(201);
    const idJ = depot.body.id;
    expect((await api(imane).get(`/signalements/${idAbsence}`)).body.signalement.justificatifStatut).toBe('recu_a_examiner');

    // Refus motivé → complément possible
    expect((await api(rhCasa).post(`/justificatifs/${idJ}/decision`, { accepte: false })).status).toBe(400);
    expect((await api(rhCasa).post(`/justificatifs/${idJ}/decision`, { accepte: false, motif: 'Illisible' })).status).toBe(200);
    const complement = await api(imane).post('/justificatifs', {
      dossierType: 'signalement', dossierId: idAbsence, nomFichier: 'certificat-v2.pdf', contentType: 'application/pdf', contenuBase64: PDF,
    });
    expect(complement.status).toBe(201);
    await api(rhCasa).post(`/justificatifs/${complement.body.id}/decision`, { accepte: true });

    const t = await api(rhCasa).post(`/signalements/${idAbsence}/traitement`, { qualification: 'justifie', statutTraitement: 'cloture' });
    expect(t.status).toBe(200);
    const s = (await api(imane).get(`/signalements/${idAbsence}`)).body.signalement;
    expect(s).toMatchObject({ qualification: 'justifie', statutTraitement: 'cloture', justificatifStatut: 'accepte' });
  });

  it('formats et tailles contrôlés ; trois pièces maximum', async () => {
    const r = await api(imane).post('/signalements', { type: 'absence', categorie: 'familial', dateDebut: lundi(9), cleIdempotence: cle() });
    const id = r.body.id;
    const exe = await api(imane).post('/justificatifs', {
      dossierType: 'signalement', dossierId: id, nomFichier: 'virus.pdf', contentType: 'application/pdf', contenuBase64: Buffer.from('MZ....').toString('base64'),
    });
    expect(exe.status).toBe(400);
    for (let i = 0; i < 3; i++) {
      const ok = await api(imane).post('/justificatifs', { dossierType: 'signalement', dossierId: id, nomFichier: `p${i}.pdf`, contentType: 'application/pdf', contenuBase64: PDF });
      expect(ok.status).toBe(201);
    }
    const quatrieme = await api(imane).post('/justificatifs', { dossierType: 'signalement', dossierId: id, nomFichier: 'p4.pdf', contentType: 'application/pdf', contenuBase64: PDF });
    expect(quatrieme.status).toBe(409);
  });

  it('un retard : durée calculée depuis l’arrivée réelle, correction motivée et tracée', async () => {
    const r = await api(salma).post('/signalements', {
      type: 'retard', categorie: 'transport', dateDebut: lundi(7), heurePrevue: '09:00', heureArriveeEstimee: '09:30', cleIdempotence: cle(),
    });
    expect(r.status).toBe(201);
    const id = r.body.id;
    expect((await api(salma).get(`/signalements/${id}`)).body.signalement.justificatifStatut).toBe('non_requis');
    await api(salma).patch(`/signalements/${id}`, { heureArriveeReelle: '09:47' });
    expect((await api(salma).get(`/signalements/${id}`)).body.signalement.retard.minutes).toBe(47);

    expect((await api(salma).patch(`/signalements/${id}`, { heureArriveeReelle: '09:40' })).status).toBe(400);
    expect((await api(salma).patch(`/signalements/${id}`, { heureArriveeReelle: '09:40', motif: 'Erreur de saisie' })).status).toBe(200);
    const detail = (await api(salma).get(`/signalements/${id}`)).body;
    expect(detail.signalement.retard.minutes).toBe(40);
    const correction = detail.historique.find((h: { action: string }) => h.action === 'correction');
    expect(correction).toMatchObject({ motif: 'Erreur de saisie', auteurNom: 'salma SALMA' });
    expect(correction.details.heureArriveeReelle).toEqual({ avant: '09:47', apres: '09:40' });
  });
});

describe('Accès et séparation des droits', () => {
  let idSalma: string;
  let idJustif: string;

  beforeAll(async () => {
    const r = await demander(salma, lundi(40), 2);
    idSalma = r.body.ids[0];
    const s = await api(salma).post('/signalements', { type: 'absence', categorie: 'maladie', dateDebut: lundi(41), cleIdempotence: cle() });
    const j = await api(salma).post('/justificatifs', {
      dossierType: 'signalement', dossierId: s.body.id, nomFichier: 'ordonnance.pdf', contentType: 'application/pdf',
      contenuBase64: Buffer.from('%PDF-1.4 ordonnance').toString('base64'),
    });
    idJustif = j.body.id;
  });

  it('un accès hors périmètre est refusé', async () => {
    expect((await api(yassine).get(`/demandes/${idSalma}`)).status).toBe(403);
    expect((await api(admin).get(`/demandes/${idSalma}`)).status).toBe(403);
    expect((await api(salma).get('/demandes?vue=rh')).status).toBe(403);
    expect((await api(salma).get('/demandes?vue=equipe')).status).toBe(403);
    const rhRabat = await creerCompte('rh-rabat', ['rh'], { campusId: 'rabat', perimetreRh: { tous: false, campusIds: ['rabat'] } });
    expect((await api(rhRabat).get(`/demandes/${idSalma}`)).status).toBe(403);
    const liste = await api(rhRabat).get('/demandes?vue=rh');
    expect(liste.body.elements.every((x: { campusId: string }) => x.campusId === 'rabat')).toBe(true);
  });

  it('y compris au téléchargement des justificatifs', async () => {
    const ok = await api(salma).get(`/justificatifs/${idJustif}/contenu`);
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toContain('no-store');
    expect((await api(rhCasa).get(`/justificatifs/${idJustif}/contenu`)).status).toBe(200);
    expect((await api(karim).get(`/justificatifs/${idJustif}/contenu`)).status).toBe(403);
    expect((await api(admin).get(`/justificatifs/${idJustif}/contenu`)).status).toBe(403);
    expect((await api(yassine).get(`/justificatifs/${idJustif}/contenu`)).status).toBe(403);
  });

  it('personne ne valide sa propre demande, même en cumulant les rôles', async () => {
    const r = await api(rhCasa).post('/demandes', {
      type: 'conge_paye', dateDebut: lundi(42), dateFin: lundi(42), soumettre: true, attestation: true, cleIdempotence: cle(),
    });
    const id = r.body.ids[0];
    expect((await api(rhCasa).get(`/demandes/${id}`)).body.demande.statut).toBe('en_decision_rh');
    const propre = await api(rhCasa).post(`/demandes/${id}/decision`, { decision: 'approuver' });
    expect(propre.status).toBe(403);
    expect(propre.body.erreur.message).toMatch(/autre gestionnaire/);
    expect((await api(rhGlobal).post(`/demandes/${id}/decision`, { decision: 'approuver' })).status).toBe(200);
  });

  it('export CSV réservé aux RH et limité au périmètre', async () => {
    expect((await api(karim).get(`/export/demandes.csv?du=${ANNEE}-01-01&au=${ANNEE}-12-31`)).status).toBe(403);
    expect((await api(admin).get(`/export/demandes.csv?du=${ANNEE}-01-01&au=${ANNEE}-12-31`)).status).toBe(403);
    const csv = await api(rhCasa).get(`/export/demandes.csv?du=${ANNEE}-01-01&au=${ANNEE}-12-31`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('salma SALMA');
  });

  it('pas d’inscription publique ; seul l’administrateur crée et désactive les comptes', async () => {
    const corps = { email: 'nouveau@demo.ynov.ma', nom: 'Nouveau', prenom: 'Compte', roles: ['collaborateur'], campusId: 'casablanca', serviceId: 'pedagogie', managerId: 'karim' };
    expect((await api(rhGlobal).post('/admin/utilisateurs', corps)).status).toBe(403);
    const cree = await api(admin).post('/admin/utilisateurs', corps);
    expect(cree.status, JSON.stringify(cree.body)).toBe(201);
    // Le nouveau compte reçoit sa dotation de l'année en cours
    const dot = await db().collection('dotations').doc(`${cree.body.uid}_${new Date().getFullYear()}`).get();
    expect(dot.get('joursAttribues')).toBe(18);

    expect((await api(admin).patch(`/admin/utilisateurs/${cree.body.uid}`, { managerId: cree.body.uid })).status).toBe(400);
    expect((await api(admin).post('/admin/utilisateurs/yassine/desactiver')).status).toBe(200);
    const bloque = await api(yassine).get('/moi');
    expect([401, 403]).toContain(bloque.status);
    expect((await api(admin).post('/admin/utilisateurs/admin/desactiver')).status).toBe(400);
  });

  it('requête non authentifiée refusée', async () => {
    const { default: request } = await import('supertest');
    const { app } = await import('./outils');
    expect((await request(app).get('/api/moi')).status).toBe(401);
    expect((await request(app).get('/api/sante')).status).toBe(200);
  });
});

describe('Fiche F031 : visas électroniques et accord de la direction', () => {
  let collab: Compte;
  let horsPerimetre: Compte;

  beforeAll(async () => {
    collab = await creerCompte('leila', [], { managerId: 'karim' });
    horsPerimetre = await creerCompte('nabil', [], { campusId: 'rabat' });
  });

  it('la soumission exige la certification (signature électronique de l’employé)', async () => {
    const r = await api(collab).post('/demandes', {
      type: 'conge_paye', dateDebut: lundi(15), dateFin: plusJours(lundi(15), 1), soumettre: true, cleIdempotence: cle(),
    });
    expect(r.status).toBe(400);
    expect(r.body.erreur.message).toMatch(/certifie/);
  });

  it('employé, RAF puis direction signent ; chacun uniquement sa case', async () => {
    const id = (await demander(collab, lundi(15), 2)).body.ids[0];
    let fiche = (await api(collab).get(`/demandes/${id}/fiche/donnees`)).body;
    expect(fiche.visas.employe.nom).toBe('leila LEILA');
    expect(fiche.visas.raf).toBeNull();
    expect(fiche.visas.direction).toBeNull();
    expect(fiche.code).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);

    // Personne ne peut signer pour la direction avant l'approbation RH, ni à sa place
    expect((await api(direction).post(`/demandes/${id}/direction`, { accord: true })).status).toBe(409);
    await circuitComplet(id);
    expect((await api(collab).post(`/demandes/${id}/direction`, { accord: true })).status).toBe(403);
    expect((await api(rhCasa).post(`/demandes/${id}/direction`, { accord: true })).status).toBe(403);
    expect((await api(karim).post(`/demandes/${id}/direction`, { accord: true })).status).toBe(403);
    expect((await api(admin).post(`/demandes/${id}/direction`, { accord: true })).status).toBe(403);

    fiche = (await api(collab).get(`/demandes/${id}/fiche/donnees`)).body;
    expect(fiche.visas.raf.nom).toBe('nadia NADIA');
    expect(fiche.ficheStatut).toBe('attente_direction');
    const codeAvant = fiche.code;

    // La direction voit la demande à signer, mais ni signalements ni justificatifs
    const aSigner = await api(direction).get('/demandes?vue=direction&ficheStatut=attente_direction');
    expect(aSigner.body.elements.some((x: { id: string }) => x.id === id)).toBe(true);
    expect((await api(direction).get('/signalements?vue=rh')).status).toBe(403);

    expect((await api(direction).post(`/demandes/${id}/direction`, { accord: true })).status).toBe(200);
    // Une seule signature
    expect((await api(direction).post(`/demandes/${id}/direction`, { accord: true })).status).toBe(409);
    fiche = (await api(collab).get(`/demandes/${id}/fiche/donnees`)).body;
    expect(fiche).toMatchObject({ ficheStatut: 'signee', definitive: true, accordDirection: { du: lundi(15), au: plusJours(lundi(15), 1) } });
    expect(fiche.visas.direction.nom).toBe('rachid RACHID');
    expect(fiche.code).not.toBe(codeAvant);

    // Vérification d'une fiche imprimée
    const ok = await api(rhCasa).get(`/demandes/fiches/verifier?numero=${fiche.numero}&code=${fiche.code}`);
    expect(ok.body.valide).toBe(true);
    const faux = await api(rhCasa).get(`/demandes/fiches/verifier?numero=${fiche.numero}&code=${codeAvant}`);
    expect(faux.body.valide).toBe(false);
    expect((await api(horsPerimetre).get(`/demandes/fiches/verifier?numero=${fiche.numero}&code=${fiche.code}`)).status).toBe(403);
    expect((await api(horsPerimetre).get(`/demandes/${id}/fiche`)).status).toBe(403);

    const pdf = await api(collab).get(`/demandes/${id}/fiche`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });

  it('le refus motivé de la direction annule le congé et restitue les jours payés', async () => {
    const avant = await solde(collab);
    const id = (await demander(collab, lundi(16), 3)).body.ids[0];
    await circuitComplet(id);
    expect(await solde(collab)).toBe(avant - 3);
    expect((await api(direction).post(`/demandes/${id}/direction`, { accord: false })).status).toBe(400);
    expect((await api(direction).post(`/demandes/${id}/direction`, { accord: false, motif: 'Période de rentrée' })).status).toBe(200);
    expect(await solde(collab)).toBe(avant);
    const d = (await api(collab).get(`/demandes/${id}`)).body.demande;
    expect(d).toMatchObject({ statut: 'annulee', ficheStatut: 'refusee_direction' });
  });

  it('un brouillon peut être modifié par son auteur uniquement', async () => {
    const r = await api(collab).post('/demandes', { type: 'conge_paye', dateDebut: lundi(17), dateFin: lundi(17), cleIdempotence: cle() });
    const id = r.body.ids[0];
    const maj = { type: 'conge_paye', dateDebut: lundi(17), dateFin: plusJours(lundi(17), 2), interim: 'Karim' };
    expect((await api(salma).put(`/demandes/${id}`, maj)).status).toBe(403);
    expect((await api(collab).put(`/demandes/${id}`, maj)).status).toBe(200);
    expect((await api(collab).get(`/demandes/${id}`)).body.demande).toMatchObject({ dureeTotale: 3, interim: 'Karim' });
    expect((await api(collab).get(`/demandes/${id}/fiche/donnees`)).status).toBe(409); // pas de fiche pour un brouillon
    expect((await api(collab).post(`/demandes/${id}/soumettre`, {})).status).toBe(400);
    expect((await api(collab).post(`/demandes/${id}/soumettre`, { attestation: true })).status).toBe(200);
    expect((await api(collab).put(`/demandes/${id}`, maj)).status).toBe(409);
  });
});

describe('Imputation d’une absence sur les congés (sous réserve de validation hiérarchique)', () => {
  it('exige la prise de connaissance du responsable, un motif, et ne s’applique qu’une fois', async () => {
    const collab = await creerCompte('mehdi', [], { managerId: 'karim' });
    const avant = await solde(collab);
    const r = await api(collab).post('/signalements', {
      type: 'absence', categorie: 'force_majeure', dateDebut: lundi(18), dateFin: plusJours(lundi(18), 1), cleIdempotence: cle(),
    });
    const id = r.body.id;
    expect(await solde(collab)).toBe(avant); // un signalement seul ne touche pas au solde

    expect((await api(rhCasa).post(`/signalements/${id}/traitement`, { imputerConges: true, motif: 'Accord du collaborateur' })).status).toBe(409);
    await api(karim).post(`/signalements/${id}/prise-connaissance`);
    expect((await api(rhCasa).post(`/signalements/${id}/traitement`, { imputerConges: true })).status).toBe(400);
    expect((await api(rhCasa).post(`/signalements/${id}/traitement`, { imputerConges: true, motif: 'Accord du collaborateur' })).status).toBe(200);
    expect(await solde(collab)).toBe(avant - 2);
    expect((await api(rhCasa).post(`/signalements/${id}/traitement`, { imputerConges: true, motif: 'Encore' })).status).toBe(409);
    expect(await solde(collab)).toBe(avant - 2);
    const mouvements = (await api(collab).get(`/dotations/moi?annee=${ANNEE}`)).body.mouvements;
    expect(mouvements.some((m: { type: string; jours: number }) => m.type === 'IMPUTATION_ABSENCE' && m.jours === -2)).toBe(true);
  });
});

describe('Durcissement de sécurité', () => {
  it('un administrateur ne peut pas s’attribuer lui-même un rôle (ex. RH) ni un périmètre', async () => {
    const r = await api(admin).patch('/admin/utilisateurs/admin', { roles: ['collaborateur', 'admin', 'rh'] });
    expect(r.status).toBe(403);
    const r2 = await api(admin).patch('/admin/utilisateurs/admin', { perimetreRh: { tous: true, campusIds: [] } });
    expect(r2.status).toBe(403);
  });

  it('en-têtes de sécurité et corps volumineux refusés hors dépôt de justificatif', async () => {
    const r = await api(salma).get('/moi');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.headers['cache-control']).toContain('no-store');
    const gros = await api(salma).post('/demandes/simulation', { type: 'conge_paye', dateDebut: lundi(30), dateFin: lundi(30), commentaire: 'x'.repeat(200_000) });
    expect(gros.status).toBe(413);
  });

  it('les signatures ne peuvent pas être injectées par le client', async () => {
    const r = await api(salma).post('/demandes', {
      type: 'conge_paye', dateDebut: lundi(44), dateFin: lundi(44), soumettre: true, attestation: true, cleIdempotence: cle(),
      signatures: { raf: { uid: 'nadia', nom: 'Faux' }, direction: { uid: 'rachid', nom: 'Faux' } }, ficheStatut: 'signee', statut: 'approuvee',
    });
    expect(r.status).toBe(201);
    const fiche = (await api(salma).get(`/demandes/${r.body.ids[0]}/fiche/donnees`)).body;
    expect(fiche.visas.raf).toBeNull();
    expect(fiche.visas.direction).toBeNull();
    expect(fiche.definitive).toBe(false);
    expect(fiche.statut).toBe('soumise');
  });
});

describe('Refus d’une demande par le responsable (N+1)', () => {
  it('le responsable peut refuser (motif obligatoire) : refus définitif, sans passage par les RH', async () => {
    const id = (await demander(imane, lundi(47), 1)).body.ids[0];
    expect((await api(imane).get(`/demandes/${id}`)).body.actions).not.toContain('refuser_responsable');
    expect((await api(karim).get(`/demandes/${id}`)).body.actions).toContain('refuser_responsable');
    expect((await api(salma).post(`/demandes/${id}/refus-responsable`, { motif: 'x' })).status).toBe(403);
    expect((await api(rhCasa).post(`/demandes/${id}/refus-responsable`, { motif: 'x' })).status).toBe(403);
    expect((await api(karim).post(`/demandes/${id}/refus-responsable`, {})).status).toBe(400);
    expect((await api(karim).post(`/demandes/${id}/refus-responsable`, { motif: 'Inventaire de fin d’année' })).status).toBe(200);

    const d = (await api(imane).get(`/demandes/${id}`)).body.demande;
    expect(d).toMatchObject({ statut: 'refusee', decision: { statut: 'refusee', par: 'responsable', motif: 'Inventaire de fin d’année' } });
    // Plus aucune décision possible ensuite, ni par les RH ni par le responsable
    expect((await api(rhCasa).post(`/demandes/${id}/decision`, { decision: 'approuver' })).status).toBe(409);
    expect((await api(karim).post(`/demandes/${id}/avis`, { favorable: true })).status).toBe(409);
    const notifs = await api(imane).get('/notifications?nonLues=true');
    expect(notifs.body.elements.some((n: { titre: string }) => n.titre.includes('responsable'))).toBe(true);
  });

  it('une demande déjà transmise aux RH ne peut plus être refusée par le responsable', async () => {
    const id = (await demander(imane, lundi(48), 1)).body.ids[0];
    await api(karim).post(`/demandes/${id}/avis`, { favorable: true });
    expect((await api(karim).post(`/demandes/${id}/refus-responsable`, { motif: 'Trop tard' })).status).toBe(409);
  });
});

describe('Invitation par e-mail et mot de passe provisoire', () => {
  const email = 'invite@demo.ynov.ma';
  let uid: string;
  let provisoire: string;

  it('l’administrateur crée le compte : mot de passe provisoire aléatoire (remis en main propre faute de SMTP)', async () => {
    const r = await api(admin).post('/admin/utilisateurs', {
      email, nom: 'Invite', prenom: 'Ines', roles: ['collaborateur'], campusId: 'casablanca', serviceId: 'pedagogie', managerId: 'karim',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    uid = r.body.uid;
    expect(r.body.invitation).toMatchObject({ envoyee: false, destinataire: email });
    provisoire = r.body.invitation.motDePasseProvisoire;
    expect(provisoire).toMatch(/^.{16}$/);
    const liste = await api(admin).get('/admin/utilisateurs?limite=100');
    expect(liste.body.elements.find((u: { uid: string }) => u.uid === uid)).toMatchObject({ motDePasseProvisoire: true, invitationExpiree: false });
  });

  it('avec le mot de passe provisoire, seul le choix du mot de passe personnel est possible', async () => {
    const c = { uid, email, jeton: await connecterAvec(email, provisoire) };
    expect((await api(c).get('/moi')).body.motDePasseProvisoire).toBe(true);
    const bloque = await api(c).get('/tableau-de-bord');
    expect(bloque.status).toBe(403);
    expect(bloque.body.erreur.code).toBe('MOT_DE_PASSE_A_CHANGER');
    expect((await api(c).post('/demandes/simulation', { type: 'conge_paye', dateDebut: lundi(49), dateFin: lundi(49) })).status).toBe(403);

    expect((await api(c).post('/moi/mot-de-passe', { nouveau: 'courtfaible' })).status).toBe(400);
    expect((await api(c).post('/moi/mot-de-passe', { nouveau: 'Invite-Personnel-2026' })).status).toBe(400); // contient l'identifiant
    // La révocation de Firebase est à la seconde : le jeton doit dater d'avant le changement
    await new Promise((r) => setTimeout(r, 1100));
    expect((await api(c).post('/moi/mot-de-passe', { nouveau: 'Personnel-Ines-2026' })).status).toBe(200);

    // Ancien jeton révoqué, ancien mot de passe inutilisable
    expect([401, 403]).toContain((await api(c).get('/moi')).status);
    await expect(connecterAvec(email, provisoire)).rejects.toThrow();
    const c2 = { uid, email, jeton: await connecterAvec(email, 'Personnel-Ines-2026') };
    expect((await api(c2).get('/moi')).body.motDePasseProvisoire).toBe(false);
    expect((await api(c2).get('/tableau-de-bord')).status).toBe(200);
  });

  it('renvoi d’invitation par l’administrateur uniquement ; une invitation expirée bloque l’accès', async () => {
    expect((await api(rhGlobal).post(`/admin/utilisateurs/${uid}/renvoyer-invitation`)).status).toBe(403);
    expect((await api(admin).post('/admin/utilisateurs/admin/renvoyer-invitation')).status).toBe(400);
    const r = await api(admin).post(`/admin/utilisateurs/${uid}/renvoyer-invitation`);
    expect(r.status).toBe(200);
    const nouveau = r.body.invitation.motDePasseProvisoire;
    expect(nouveau).not.toBe(provisoire);
    await expect(connecterAvec(email, 'Personnel-Ines-2026')).rejects.toThrow();
    const c = { uid, email, jeton: await connecterAvec(email, nouveau) };
    expect((await api(c).get('/moi')).body.motDePasseProvisoire).toBe(true);

    await db().collection('users').doc(uid).update({ provisoireExpireLe: Timestamp.fromMillis(Date.now() - 1000) });
    const expire = await api(c).get('/moi');
    expect(expire.status).toBe(403);
    expect(expire.body.erreur.code).toBe('MOT_DE_PASSE_PROVISOIRE_EXPIRE');
  });
});

// Doit rester le dernier bloc : il vide les émulateurs pour simuler un premier déploiement.
describe('Installation : création du premier super-administrateur', () => {
  const corps = {
    cle: 'installation-locale',
    email: 'superadmin@ynov.ma',
    prenom: 'Sara',
    nom: 'Idrissi',
    motDePasse: 'Installation-2026',
    campus: { id: 'casablanca', nom: 'Casablanca' },
    service: { id: 'direction', nom: 'Direction' },
  };

  beforeAll(async () => {
    await reinitialiser();
  });

  it('possible une seule fois, avec la clé d’installation, sans compte préalable', async () => {
    expect((await request(app).get('/api/installation')).body).toEqual({ necessaire: true, disponible: true });
    const mauvaiseCle = await request(app).post('/api/installation').send({ ...corps, cle: 'devinette' });
    expect(mauvaiseCle.status).toBe(403);
    expect(mauvaiseCle.body.erreur.code).toBe('CLE_INVALIDE');
    expect((await request(app).post('/api/installation').send({ ...corps, motDePasse: 'faible' })).status).toBe(400);

    const ok = await request(app).post('/api/installation').send(corps);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const sa = { uid: '', email: corps.email, jeton: await connecterAvec(corps.email, corps.motDePasse) };
    const moi = (await api(sa).get('/moi')).body;
    expect(moi.roles).toEqual(['collaborateur', 'admin']);
    expect(moi.motDePasseProvisoire).toBe(false);
    expect((await api(sa).get('/admin/utilisateurs')).status).toBe(200);

    // Définitivement fermée ensuite
    expect((await request(app).get('/api/installation')).body.necessaire).toBe(false);
    const deuxieme = await request(app).post('/api/installation').send({ ...corps, email: 'intrus@exemple.ma' });
    expect(deuxieme.status).toBe(409);
  });
});
