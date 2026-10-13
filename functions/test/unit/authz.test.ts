import { describe, expect, it } from 'vitest';
import * as A from '../../src/domain/authz';
import { Utilisateur } from '../../src/domain/types';

const u = (uid: string, roles: Utilisateur['roles'], extra: Partial<Utilisateur> = {}): Utilisateur => ({
  uid,
  email: `${uid}@test.ma`,
  nom: uid,
  prenom: '',
  roles,
  campusId: 'casablanca',
  serviceId: 'pedagogie',
  fonction: '',
  managerId: null,
  actif: true,
  perimetreRh: { tous: false, campusIds: [] },
  ...extra,
});

const salma = u('salma', ['collaborateur'], { managerId: 'karim' });
const yassine = u('yassine', ['collaborateur'], { managerId: 'autre', campusId: 'rabat' });
const karim = u('karim', ['collaborateur', 'responsable']);
const rhCasa = u('nadia', ['collaborateur', 'rh'], { perimetreRh: { tous: false, campusIds: ['casablanca'] } });
const rhGlobal = u('omar', ['collaborateur', 'rh'], { perimetreRh: { tous: true, campusIds: [] } });
const admin = u('admin', ['collaborateur', 'admin'], { perimetreRh: { tous: true, campusIds: [] } });

const dossier = (owner: Utilisateur) => ({ userId: owner.uid, managerId: owner.managerId, campusId: owner.campusId });

describe('Accès aux dossiers', () => {
  it('le collaborateur voit ses dossiers, pas ceux des autres', () => {
    expect(A.peutVoirDossier(salma, dossier(salma))).toBe(true);
    expect(A.peutVoirDossier(salma, dossier(yassine))).toBe(false);
  });

  it('le responsable voit uniquement son équipe', () => {
    expect(A.peutVoirDossier(karim, dossier(salma))).toBe(true);
    expect(A.peutVoirDossier(karim, dossier(yassine))).toBe(false);
  });

  it('les RH accèdent uniquement au périmètre confié', () => {
    expect(A.peutVoirDossier(rhCasa, dossier(salma))).toBe(true);
    expect(A.peutVoirDossier(rhCasa, dossier(yassine))).toBe(false);
    expect(A.peutVoirDossier(rhGlobal, dossier(yassine))).toBe(true);
  });

  it('le rôle administrateur ne donne pas accès aux dossiers ni aux justificatifs', () => {
    expect(A.peutVoirDossier(admin, dossier(salma))).toBe(false);
    expect(A.peutVoirJustificatif(admin, dossier(salma))).toBe(false);
    expect(A.peutGererComptes(admin)).toBe(true);
    expect(A.peutGererComptes(rhGlobal)).toBe(false);
  });
});

describe('Justificatifs et contenu médical', () => {
  it('seuls le déposant et les RH habilités accèdent aux pièces', () => {
    expect(A.peutVoirJustificatif(salma, dossier(salma))).toBe(true);
    expect(A.peutVoirJustificatif(rhCasa, dossier(salma))).toBe(true);
    expect(A.peutVoirJustificatif(karim, dossier(salma))).toBe(false);
    expect(A.peutVoirJustificatif(rhCasa, dossier(yassine))).toBe(false);
    expect(A.peutVoirJustificatif(yassine, dossier(salma))).toBe(false);
  });

  it('le responsable ne voit pas le contenu médical', () => {
    expect(A.peutVoirContenuMedical(karim, dossier(salma))).toBe(false);
    expect(A.peutVoirContenuMedical(rhCasa, dossier(salma))).toBe(true);
  });
});

describe('Séparation des droits', () => {
  it('seul le responsable du demandeur émet un avis', () => {
    expect(A.peutDonnerAvis(karim, dossier(salma))).toBe(true);
    expect(A.peutDonnerAvis(rhCasa, dossier(salma))).toBe(false);
    expect(A.peutDonnerAvis(karim, dossier(yassine))).toBe(false);
  });

  it('personne ne valide sa propre demande, même en cumulant les rôles', () => {
    const rhResp = u('lina', ['collaborateur', 'responsable', 'rh'], { managerId: 'lina', perimetreRh: { tous: true, campusIds: [] } });
    expect(A.peutDecider(rhResp, dossier(rhResp))).toBe(false);
    expect(A.peutDonnerAvis(rhResp, dossier(rhResp))).toBe(false);
    expect(A.peutDecider(rhCasa, dossier(rhCasa))).toBe(false);
    expect(A.peutDecider(rhGlobal, dossier(rhCasa))).toBe(true);
  });

  it('un gestionnaire RH ne modifie pas ses propres droits annuels', () => {
    expect(A.peutGererDotation(rhGlobal, rhGlobal)).toBe(false);
    expect(A.peutGererDotation(rhGlobal, salma)).toBe(true);
    expect(A.peutGererDotation(rhCasa, yassine)).toBe(false);
    expect(A.peutGererDotation(karim, salma)).toBe(false);
  });

  it('export CSV réservé aux RH ; paramètres réservés au périmètre global', () => {
    expect(A.peutExporter(rhCasa)).toBe(true);
    expect(A.peutExporter(karim)).toBe(false);
    expect(A.peutExporter(admin)).toBe(false);
    expect(A.peutModifierParametres(rhCasa)).toBe(false);
    expect(A.peutModifierParametres(rhGlobal)).toBe(true);
  });

  it('un compte sans rôle RH n’a aucun périmètre RH, même s’il est renseigné', () => {
    const faux = u('x', ['collaborateur'], { perimetreRh: { tous: true, campusIds: [] } });
    expect(A.rhCouvre(faux, { campusId: 'casablanca' })).toBe(false);
  });
});

describe('Direction régionale', () => {
  const dirCasa = u('rachid', ['collaborateur', 'direction'], { perimetreRh: { tous: false, campusIds: ['casablanca'] } });

  it('voit les demandes de congé de son périmètre et signe l’accord, jamais pour elle-même', () => {
    expect(A.peutVoirDemande(dirCasa, dossier(salma))).toBe(true);
    expect(A.peutVoirDemande(dirCasa, dossier(yassine))).toBe(false);
    expect(A.peutSignerDirection(dirCasa, dossier(salma))).toBe(true);
    expect(A.peutSignerDirection(dirCasa, dossier(dirCasa))).toBe(false);
    expect(A.peutSignerDirection(rhGlobal, dossier(salma))).toBe(false);
    expect(A.peutSignerDirection(admin, dossier(salma))).toBe(false);
  });

  it('n’accède ni aux signalements, ni aux justificatifs, ni aux décisions RH', () => {
    expect(A.peutVoirDossier(dirCasa, dossier(salma))).toBe(false);
    expect(A.peutVoirJustificatif(dirCasa, dossier(salma))).toBe(false);
    expect(A.peutDecider(dirCasa, dossier(salma))).toBe(false);
  });
});
