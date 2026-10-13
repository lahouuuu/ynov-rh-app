import { describe, expect, it } from 'vitest';
import {
  aujourdhui,
  chevauche,
  estDateValide,
  joursOuvresDeLaPeriode,
  minutesDeRetard,
  scinderParAnnee,
  sommeJours,
} from '../../src/domain/calendrier';

const cal = { joursOuvres: [1, 2, 3, 4, 5], joursFeries: ['2027-05-01', '2027-07-30'] };

describe('Calendrier de travail', () => {
  it('ne compte que les jours ouvrés (lundi → vendredi)', () => {
    // du lundi 1er mars au dimanche 7 mars 2027 : 5 jours ouvrés
    expect(sommeJours(joursOuvresDeLaPeriode('2027-03-01', '2027-03-07', cal))).toBe(5);
  });

  it('exclut les jours fériés', () => {
    // vendredi 30 juillet 2027 est férié (Fête du Trône)
    expect(sommeJours(joursOuvresDeLaPeriode('2027-07-26', '2027-07-30', cal))).toBe(4);
  });

  it('gère les demi-journées de début et de fin', () => {
    const jours = joursOuvresDeLaPeriode('2027-03-01', '2027-03-03', cal, { demiJourneeDebut: true, demiJourneeFin: true });
    expect(jours.map((j) => j.valeur)).toEqual([0.5, 1, 0.5]);
    expect(sommeJours(jours)).toBe(2);
  });

  it('une seule demi-journée', () => {
    expect(sommeJours(joursOuvresDeLaPeriode('2027-03-01', '2027-03-01', cal, { demiJourneeFin: true }))).toBe(0.5);
  });

  it('refuse un jour unique commençant l’après-midi et finissant le matin', () => {
    expect(() =>
      joursOuvresDeLaPeriode('2027-03-01', '2027-03-01', cal, { demiJourneeDebut: true, demiJourneeFin: true }),
    ).toThrow();
  });

  it('refuse une fin antérieure au début et une date invalide', () => {
    expect(() => joursOuvresDeLaPeriode('2027-03-05', '2027-03-01', cal)).toThrow();
    expect(() => joursOuvresDeLaPeriode('2027-02-30', '2027-03-01', cal)).toThrow();
    expect(estDateValide('2027-02-29')).toBe(false);
    expect(estDateValide('2028-02-29')).toBe(true);
  });

  it('un week-end seul ne contient aucun jour ouvré', () => {
    expect(joursOuvresDeLaPeriode('2027-03-06', '2027-03-07', cal)).toEqual([]);
  });

  it('scinde une période qui traverse deux années', () => {
    const p = scinderParAnnee('2027-12-29', '2028-01-04', { demiJourneeDebut: true, demiJourneeFin: true });
    expect(p).toEqual([
      { annee: 2027, debut: '2027-12-29', fin: '2027-12-31', options: { demiJourneeDebut: true, demiJourneeFin: false } },
      { annee: 2028, debut: '2028-01-01', fin: '2028-01-04', options: { demiJourneeDebut: false, demiJourneeFin: true } },
    ]);
  });

  it('détecte les chevauchements (bornes incluses)', () => {
    expect(chevauche('2027-03-01', '2027-03-05', '2027-03-05', '2027-03-10')).toBe(true);
    expect(chevauche('2027-03-01', '2027-03-04', '2027-03-05', '2027-03-10')).toBe(false);
  });

  it('calcule la durée définitive du retard à partir de l’arrivée réelle', () => {
    expect(minutesDeRetard('09:00', '09:47')).toBe(47);
    expect(minutesDeRetard('09:00', '08:55')).toBe(0);
  });

  it('donne la date du jour dans le fuseau Africa/Casablanca', () => {
    // 31/12/2026 23:30 UTC = 01/01/2027 00:30 à Casablanca (UTC+1)
    expect(aujourdhui(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});
