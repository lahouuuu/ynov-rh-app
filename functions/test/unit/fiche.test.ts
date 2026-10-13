import { describe, expect, it } from 'vitest';
import { codeVerification, contenuFiche, dateDeReprise, dateLongue, nombreDeJours, periodeChoisie } from '../../src/domain/fiche';
import { dessinerFiche } from '../../src/services/fiche';
import { PARAMETRES_PAR_DEFAUT } from '../../src/domain/parametres';

const cal = { joursOuvres: [1, 2, 3, 4, 5], joursFeries: ['2026-07-30'] };

describe('Fiche de congé (formulaire F031/DI)', () => {
  it('formate les nombres de jours et les dates comme le formulaire papier', () => {
    expect(nombreDeJours(3.5)).toBe('3,5 jours');
    expect(nombreDeJours(1)).toBe('1 jour');
    expect(nombreDeJours(0.5)).toBe('0,5 jour');
    expect(dateLongue('2026-07-22')).toBe('Mercredi 22 juillet 2026');
    expect(dateLongue('2026-08-01')).toBe('Samedi 1er août 2026');
  });

  it('décrit la période choisie, demi-journées comprises', () => {
    expect(periodeChoisie('2026-07-17', '2026-07-21')).toBe('Du 17 juillet au 21 juillet 2026 inclus');
    expect(periodeChoisie('2026-07-17', '2026-07-21', true, true)).toBe('Du 17 juillet (après-midi) au 21 juillet 2026 (matin) inclus');
    expect(periodeChoisie('2026-12-28', '2027-01-04')).toBe('Du 28 décembre 2026 au 4 janvier 2027 inclus');
    expect(periodeChoisie('2026-07-17', '2026-07-17')).toBe('Le 17 juillet 2026');
  });

  it('calcule la date de reprise (jour ouvré suivant, week-ends et fériés exclus)', () => {
    // Fin le mardi 21 juillet 2026 → reprise mercredi 22
    expect(dateDeReprise('2026-07-21', false, cal).libelle).toBe('Mercredi 22 juillet 2026');
    // Fin le vendredi 24 juillet → reprise lundi 27
    expect(dateDeReprise('2026-07-24', false, cal).date).toBe('2026-07-27');
    // Fin le mercredi 29 juillet, jeudi 30 férié → reprise vendredi 31
    expect(dateDeReprise('2026-07-29', false, cal).date).toBe('2026-07-31');
    // Fin à midi → reprise le même jour l'après-midi
    expect(dateDeReprise('2026-07-21', true, cal).libelle).toBe('Mardi 21 juillet 2026 (après-midi)');
  });

  it('pré-remplit tous les champs ; mentionne les jours non payés', () => {
    const c = contenuFiche({
      numero: '2026-0001', nom: 'Baali', prenom: 'Mounir', fonction: 'Chef de projet', annee: 2026,
      dateDebut: '2026-07-17', dateFin: '2026-07-21', demiJourneeDebut: false, demiJourneeFin: false,
      dureeTotale: 3, joursNonPayes: 1, solde: 5.5, dateSolde: '2026-08-31', interim: '', dateDemande: '2026-07-10', calendrier: cal,
    });
    expect(c).toMatchObject({
      nom: 'BAALI',
      nombreJours: '3 jours (dont 1 jour non payé)',
      reprise: 'Mercredi 22 juillet 2026',
      resteAcquis: '5,5 jours au 31/08/2026',
      signataireEmploye: 'Mounir Baali',
      dateEmploye: '10/07/2026',
    });
  });

  it('produit un PDF d’une page', async () => {
    const c = contenuFiche({
      numero: '2026-0002', nom: 'Alaoui', prenom: 'Salma', fonction: 'Chargée pédagogique', annee: 2026,
      dateDebut: '2026-11-09', dateFin: '2026-11-12', demiJourneeDebut: false, demiJourneeFin: false,
      dureeTotale: 4, joursNonPayes: 0, solde: 11, dateSolde: '2026-10-01', interim: '', dateDemande: null, calendrier: cal,
    });
    const pdf = await dessinerFiche(
      {
        id: 'x', numero: c.numero, contenu: c, statut: 'approuvee', statutLibelle: 'Approuvée', ficheStatut: 'attente_direction',
        etat: 'En attente de l’accord de la direction', definitive: false, code: 'AAAA-BBBB-CCCC-DDDD', accordDirection: null,
        parametres: PARAMETRES_PAR_DEFAUT.fiche,
        visas: { employe: { nom: 'Salma Alaoui', fonction: '', date: '2026-10-01T08:00:00.000Z', dateCourte: '01/10/2026', heure: '09:00' }, raf: null, direction: null },
      },
      '2026-10-01',
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
  });
});

describe('Code de vérification de la fiche', () => {
  const base = {
    numero: '2026-0001', userId: 'u1', dateDebut: '2026-07-17', dateFin: '2026-07-21', dureeTotale: 3, joursPayes: 3,
    joursNonPayes: 0, statut: 'approuvee', ficheStatut: 'signee',
    visas: [{ role: 'employe', uid: 'u1', date: '2026-07-10T09:00:00.000Z' }, { role: 'raf', uid: 'r1', date: '2026-07-11T09:00:00.000Z' }, null],
  };

  it('est stable pour un même contenu et change dès qu’un élément est modifié', () => {
    const c = codeVerification('sel', base);
    expect(c).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(codeVerification('sel', { ...base })).toBe(c);
    expect(codeVerification('sel', { ...base, dateFin: '2026-07-22' })).not.toBe(c);
    expect(codeVerification('sel', { ...base, joursPayes: 2 })).not.toBe(c);
    expect(codeVerification('autre-sel', base)).not.toBe(c);
  });
});
